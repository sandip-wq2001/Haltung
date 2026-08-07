import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { createScreenBaseline, type ScreenBaseline } from '../../classifier/attention-baseline';
import {
  createCalibrationProfile,
  type CalibrationProfile,
} from '../../classifier/calibration-profile';
import { decodeHeadPose, type HeadPose } from '../../classifier/head-pose';
import { EYE_LANDMARK_INDICES } from '../../classifier/iris-gaze';
import { computePostureMetrics, type PostureMetrics } from '../../classifier/posture-metrics';
import type { FrameResult } from '../../models/landmarks';
import {
  RECORDING_SCHEMA_VERSION,
  type Compliance,
  type Condition,
  type RecordedFrame,
  type RecordingHeader,
  type RecordingPhase,
  type VideoSize,
} from '../../models/recording';
import {
  SCRIPT_DURATION_MS,
  SESSION_SCRIPT,
  SESSION_SCRIPT_ID,
  segmentAt,
} from '../../recording/session-script';
import { CameraService } from '../../services/camera.service';
import { LandmarkStream } from '../../services/landmark-stream';
import { MediapipeLoader } from '../../services/mediapipe-loader';

type Phase =
  | 'setup'
  | 'preparing'
  | 'calibrating'
  | 'ready'
  | 'recording'
  | 'review'
  | 'done'
  | 'failed';

const PREPARATION_DURATION = 5_000;
const CALIBRATION_DURATION = 30_000;
const CALIBRATION_SAMPLE_INTERVAL = 500;

const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

const MAX_LANDMARK_INDEX = Math.max(LEFT_IRIS, RIGHT_IRIS, ...EYE_LANDMARK_INDICES);

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function isNonNegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function deriveAzimuthDeg(
  eyeToCameraM: number | null,
  eyeToDisplayM: number | null,
  cameraToDisplayM: number | null,
): number | null {
  if (!isPositive(eyeToCameraM) || !isPositive(eyeToDisplayM) || !isNonNegative(cameraToDisplayM)) {
    return null;
  }

  const cosAzimuth =
    (eyeToCameraM * eyeToCameraM +
      eyeToDisplayM * eyeToDisplayM -
      cameraToDisplayM * cameraToDisplayM) /
    (2 * eyeToCameraM * eyeToDisplayM);
  const epsilon = 0.02;

  if (cosAzimuth < -1 - epsilon || cosAzimuth > 1 + epsilon) {
    return null;
  }

  return Math.acos(Math.min(1, Math.max(-1, cosAzimuth))) * (180 / Math.PI);
}

@Component({
  selector: 'app-record',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    RouterLink,
  ],
  templateUrl: './record.html',
  styleUrl: './record.scss',
})
export class RecordSession implements OnDestroy {
  @ViewChild('video', { static: true })
  private readonly videoRef!: ElementRef<HTMLVideoElement>;

  protected readonly script = SESSION_SCRIPT;
  protected readonly scriptDurationMs = SCRIPT_DURATION_MS;

  protected readonly phase = signal<Phase>('setup');

  protected readonly participantId = signal('');
  protected readonly condition = signal<Condition>('A_frontal');
  protected readonly heightM = signal(1.1);
  protected readonly eyeHeightM = signal(1.2);
  protected readonly distanceM = signal(0.6);
  protected readonly screenCentreDistanceM = signal(0);
  protected readonly screenWidthM = signal(0.598);
  protected readonly screenHeightM = signal(0.336);
  protected readonly screenCentreHeightM = signal(0.99);
  protected readonly screenDistanceM = signal(0.7);
  protected readonly awayMarkerOffsetM = signal(0.25);
  protected readonly notes = signal('');
  protected readonly voiceEnabled = signal(true);

  protected readonly derivedAzimuthDeg = computed(() =>
    deriveAzimuthDeg(this.distanceM(), this.screenDistanceM(), this.screenCentreDistanceM()),
  );

  protected readonly setupError = computed<string | null>(() => {
    if (this.participantId().trim().length === 0) {
      return 'Enter a participant ID.';
    }

    if (
      !isPositive(this.heightM()) ||
      !isPositive(this.eyeHeightM()) ||
      !isPositive(this.distanceM()) ||
      !isPositive(this.screenWidthM()) ||
      !isPositive(this.screenHeightM()) ||
      !isPositive(this.screenCentreHeightM()) ||
      !isPositive(this.screenDistanceM()) ||
      !isPositive(this.awayMarkerOffsetM()) ||
      !isNonNegative(this.screenCentreDistanceM())
    ) {
      return 'Enter valid measured geometry; only frontal camera-to-display distance may be zero.';
    }

    const azimuth = this.derivedAzimuthDeg();

    if (azimuth === null) {
      return 'The three distances cannot form the eye–camera–display triangle. Check the measurements.';
    }

    if (this.condition() === 'A_frontal' && azimuth > 5) {
      return `Condition A requires a frontal camera, but the measured distances derive ${azimuth.toFixed(1)}°.`;
    }

    if (this.condition() === 'B_offaxis') {
      if (this.screenCentreDistanceM() === 0) {
        return 'Condition B requires a positive camera-to-display-centre distance.';
      }

      if (azimuth <= 5) {
        return `Condition B requires an off-axis camera, but the measured distances derive only ${azimuth.toFixed(1)}°.`;
      }
    }

    return null;
  });

  protected readonly calibrationSecondsRemaining = signal(30);
  protected readonly preparationSecondsRemaining = signal(5);
  protected readonly elapsedMs = signal(0);
  protected readonly frameCount = signal(0);
  protected readonly personDetected = signal(false);
  protected readonly compliance = signal<Record<string, Compliance | undefined>>({});

  protected readonly canSave = computed(() => {
    const judged = this.compliance();
    return SESSION_SCRIPT.every((segment) => judged[segment.id] !== undefined);
  });

  protected readonly canCalibrate = computed(() => this.setupError() === null);
  protected readonly currentSegment = computed(() => segmentAt(this.elapsedMs()));
  protected readonly secondsToNext = computed(() => {
    const segment = this.currentSegment();

    if (!segment) {
      return 0;
    }

    return Math.ceil((segment.endMs - this.elapsedMs()) / 1000);
  });

  private readonly camera = inject(CameraService);
  private readonly mediapipeLoader = inject(MediapipeLoader);
  private readonly stream = inject(LandmarkStream);

  private metricSamples: PostureMetrics[] = [];
  private poseSamples: HeadPose[] = [];
  private profile: CalibrationProfile | null = null;
  private screenBaseline: ScreenBaseline | null = null;

  private frames: RecordedFrame[] = [];
  private videoSize: VideoSize = { width: 0, height: 0 };
  private phaseStartedAt = 0;
  private nextSampleAt = 0;
  private lastSpokenSeg: string | null = null;
  private lastBeepedSeg: string | null = null;

  protected async startCalibration(): Promise<void> {
    const video = this.videoRef.nativeElement;
    this.frames = [];
    this.metricSamples = [];
    this.poseSamples = [];
    this.profile = null;
    this.screenBaseline = null;

    try {
      video.srcObject = await this.camera.start();
      await video.play();

      this.videoSize = { width: video.videoWidth, height: video.videoHeight };

      if (this.videoSize.width === 0 || this.videoSize.height === 0) {
        throw new Error('Camera reported no dimensions.');
      }

      const loaded = await this.mediapipeLoader.load();

      this.phaseStartedAt = performance.now();
      this.preparationSecondsRemaining.set(5);
      this.phase.set('preparing');

      this.stream.start(video, loaded.pose, loaded.face, (frame) => this.onFrame(frame));
    } catch (error) {
      console.error('[Record] Camera or MediaPipe failed', error);
      this.fail();
    }
  }

  protected startRecording(): void {
    this.frameCount.set(0);
    this.elapsedMs.set(0);
    this.lastSpokenSeg = null;
    this.lastBeepedSeg = null;
    this.phaseStartedAt = performance.now();
    this.phase.set('recording');
  }

  protected setCompliance(segmentId: string, value: Compliance): void {
    this.compliance.update((current) => ({ ...current, [segmentId]: value }));
  }

  protected markAllCompliant(): void {
    this.compliance.set(
      Object.fromEntries(SESSION_SCRIPT.map((segment) => [segment.id, 'yes'])) as Record<
        string,
        Compliance
      >,
    );
  }

  private onFrame(frame: FrameResult): void {
    const phase = this.phase();

    if (phase === 'preparing') {
      this.onPreparationFrame();
      return;
    }

    if (phase === 'calibrating') {
      this.onCalibrationFrame(frame);
      return;
    }

    if (phase === 'recording') {
      this.onRecordingFrame(frame);
    }
  }

  private onPreparationFrame(): void {
    const elapsed = performance.now() - this.phaseStartedAt;

    this.preparationSecondsRemaining.set(
      Math.ceil(Math.max(0, PREPARATION_DURATION - elapsed) / 1000),
    );

    if (elapsed < PREPARATION_DURATION) {
      return;
    }

    this.phaseStartedAt = performance.now();
    this.nextSampleAt = 0;
    this.calibrationSecondsRemaining.set(30);
    this.phase.set('calibrating');
  }

  private onCalibrationFrame(frame: FrameResult): void {
    const elapsed = performance.now() - this.phaseStartedAt;

    this.calibrationSecondsRemaining.set(
      Math.ceil(Math.max(0, CALIBRATION_DURATION - elapsed) / 1000),
    );

    if (elapsed >= CALIBRATION_DURATION) {
      this.profile = createCalibrationProfile(this.metricSamples);
      this.screenBaseline = createScreenBaseline(this.poseSamples);

      if (!this.profile || !this.screenBaseline) {
        this.fail();
        return;
      }

      this.phase.set('ready');
      return;
    }

    if (elapsed < this.nextSampleAt) {
      return;
    }

    this.nextSampleAt = elapsed + CALIBRATION_SAMPLE_INTERVAL;

    const metrics = computePostureMetrics(frame, this.videoSize.width, this.videoSize.height);

    if (metrics) {
      this.metricSamples.push(metrics);
    }

    const headPose = decodeHeadPose(frame.faceTransform);

    if (headPose) {
      this.poseSamples.push(headPose);
    }

    this.captureFrame(frame, 'calibration', Math.round(elapsed), 'calibration');
  }

  private onRecordingFrame(frame: FrameResult): void {
    const t = Math.round(performance.now() - this.phaseStartedAt);

    if (t >= SCRIPT_DURATION_MS) {
      this.finishRecording();
      return;
    }

    this.elapsedMs.set(t);

    const segment = segmentAt(t);

    if (segment && segment.id !== this.lastSpokenSeg) {
      this.lastSpokenSeg = segment.id;
      this.speak(segment.instruction);
    }

    if (segment && segment.id !== this.lastBeepedSeg && t >= segment.startMs + segment.leadInMs) {
      this.lastBeepedSeg = segment.id;
      this.beep();
    }

    this.personDetected.set(frame.pose !== null);

    if (!segment || t < segment.startMs + segment.leadInMs) {
      return;
    }

    this.captureFrame(frame, 'session', t, segment.id);

    this.frameCount.update((count) => count + 1);
  }

  private captureFrame(frame: FrameResult, phase: RecordingPhase, t: number, seg: string): void {
    const faceLandmarks = frame.face?.landmarks ?? null;
    const hasEyeLandmarks = faceLandmarks !== null && faceLandmarks.length > MAX_LANDMARK_INDEX;

    this.frames.push({
      phase,
      t,
      seg,
      pose: frame.pose
        ? frame.pose.landmarks.map((landmark) => [
            round4(landmark.x),
            round4(landmark.y),
            round4(landmark.z),
            round4(landmark.visibility),
          ])
        : null,
      iris:
        hasEyeLandmarks && faceLandmarks
          ? [
              [round4(faceLandmarks[LEFT_IRIS].x), round4(faceLandmarks[LEFT_IRIS].y)],
              [round4(faceLandmarks[RIGHT_IRIS].x), round4(faceLandmarks[RIGHT_IRIS].y)],
            ]
          : null,
      eye:
        hasEyeLandmarks && faceLandmarks
          ? EYE_LANDMARK_INDICES.map((index) => [
              round4(faceLandmarks[index].x),
              round4(faceLandmarks[index].y),
            ])
          : null,
      m: frame.faceTransform ? frame.faceTransform.map(round4) : null,
    });
  }

  private finishRecording(): void {
    this.stream.stop(this.videoRef.nativeElement);
    this.camera.stop();
    this.compliance.set({});
    this.phase.set('review');
  }

  protected exportRecording(): void {
    if (!this.canSave()) {
      return;
    }

    const sessionId = crypto.randomUUID();
    const header: RecordingHeader = {
      meta: {
        schemaVersion: RECORDING_SCHEMA_VERSION,
        scriptId: SESSION_SCRIPT_ID,
        sessionId,
        participantId: this.participantId().trim(),
        condition: this.condition(),
        camera: {
          heightM: this.heightM(),
          eyeHeightM: this.eyeHeightM(),
          distanceM: this.distanceM(),
          azimuthDeg: this.derivedAzimuthDeg() ?? 0,
          screenCentreDistanceM: this.screenCentreDistanceM(),
        },
        screen: {
          widthM: this.screenWidthM(),
          heightM: this.screenHeightM(),
          centreHeightM: this.screenCentreHeightM(),
          distanceM: this.screenDistanceM(),
          awayMarkerOffsetM: this.awayMarkerOffsetM(),
        },
        video: this.videoSize,
        notes: this.notes(),
      },
      script: SESSION_SCRIPT,
      compliance: SESSION_SCRIPT.map((segment) => ({
        segmentId: segment.id,
        compliance: this.compliance()[segment.id] as Compliance,
      })),
      profile: this.profile ? { metrics: this.profile.metrics } : null,
      screenBaseline: this.screenBaseline
        ? {
            yawMedianDeg: this.screenBaseline.yawMedianDeg,
            pitchMedianDeg: this.screenBaseline.pitchMedianDeg,
          }
        : null,
    };

    const lines = [JSON.stringify(header), ...this.frames.map((frame) => JSON.stringify(frame))];
    const blob = new Blob([lines.join('\n')], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `haltung_${this.participantId().trim()}_${this.condition()}_${sessionId}.jsonl`;
    link.click();

    URL.revokeObjectURL(url);
    this.phase.set('done');
  }

  private speak(text: string): void {
    if (!this.voiceEnabled() || typeof speechSynthesis === 'undefined') {
      return;
    }

    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn('[Record] Speech unavailable', error);
    }
  }

  private beep(): void {
    if (!this.voiceEnabled()) {
      return;
    }

    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.15);

      setTimeout(() => void context.close(), 500);
    } catch (error) {
      console.warn('[Record] Audio unavailable', error);
    }
  }

  private fail(): void {
    this.stream.stop(this.videoRef.nativeElement);
    this.camera.stop();
    this.phase.set('failed');
  }

  ngOnDestroy(): void {
    this.stream.stop(this.videoRef.nativeElement);
    this.camera.stop();
  }
}
