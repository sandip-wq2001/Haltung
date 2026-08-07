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

import { decodeHeadPose } from '../../classifier/head-pose';
import { computeIrisGaze } from '../../classifier/iris-gaze';
import type { FrameResult } from '../../models/landmarks';
import {
  THRESHOLD_SCRIPT,
  THRESHOLD_SCRIPT_ID,
  type ThresholdPose,
} from '../../recording/threshold-script';
import { CameraService } from '../../services/camera.service';
import { LandmarkStream } from '../../services/landmark-stream';
import { MediapipeLoader } from '../../services/mediapipe-loader';

type Phase = 'setup' | 'running' | 'done' | 'failed';
type SubPhase = 'settle' | 'capture';
type CameraSpot = 'frontal' | 'left' | 'right';

interface Sample {
  poseId: string;
  t: number;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
  irisH: number | null;
  irisV: number | null;
  openness: number | null;
}

interface Stats {
  min: number;
  median: number;
  max: number;
}

interface PoseSummary {
  pose: ThresholdPose;
  frames: number;
  faceFrames: number;
  yaw: Stats | null;
  pitch: Stats | null;
  irisH: Stats | null;
  irisV: Stats | null;
  openness: Stats | null;
}

@Component({
  selector: 'app-threshold',
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
  templateUrl: './threshold.html',
  styleUrl: './threshold.scss',
})
export class ThresholdSession implements OnDestroy {
  @ViewChild('video', { static: true })
  private readonly videoRef!: ElementRef<HTMLVideoElement>;

  protected readonly script = THRESHOLD_SCRIPT;

  protected readonly phase = signal<Phase>('setup');
  protected readonly subPhase = signal<SubPhase>('settle');
  protected readonly poseIndex = signal(0);
  protected readonly secondsLeft = signal(0);
  protected readonly faceVisible = signal(false);
  protected readonly summary = signal<PoseSummary[]>([]);

  protected readonly personId = signal('');
  protected readonly cameraSpot = signal<CameraSpot>('frontal');
  protected readonly sessionNumber = signal(1);

  protected readonly heightM = signal(1.1);
  protected readonly eyeHeightM = signal(1.2);
  protected readonly distanceM = signal(0.6);
  protected readonly azimuthDeg = signal(0);
  protected readonly screenCentreDistanceM = signal(0.15);
  protected readonly screenWidthM = signal(0.598);
  protected readonly screenCentreHeightM = signal(0.99);
  protected readonly screenDistanceM = signal(0.7);
  protected readonly awayMarkerOffsetM = signal(0.25);

  protected readonly voiceEnabled = signal(true);
  protected readonly notes = signal('');

  protected readonly canStart = computed(() => this.personId().trim().length > 0);
  protected readonly currentPose = computed<ThresholdPose | null>(
    () => THRESHOLD_SCRIPT[this.poseIndex()] ?? null,
  );
  protected readonly progressPercent = computed(
    () => (this.poseIndex() / THRESHOLD_SCRIPT.length) * 100,
  );

  private readonly camera = inject(CameraService);
  private readonly mediapipeLoader = inject(MediapipeLoader);
  private readonly stream = inject(LandmarkStream);

  private samples: Sample[] = [];
  private videoWidth = 0;
  private videoHeight = 0;
  private stepStartedAt = 0;

  protected async start(): Promise<void> {
    const video = this.videoRef.nativeElement;
    this.samples = [];
    this.summary.set([]);
    this.poseIndex.set(0);

    try {
      video.srcObject = await this.camera.start();
      await video.play();

      this.videoWidth = video.videoWidth;
      this.videoHeight = video.videoHeight;

      if (this.videoWidth === 0 || this.videoHeight === 0) {
        throw new Error('Camera reported no dimensions.');
      }

      const loaded = await this.mediapipeLoader.load();

      this.phase.set('running');
      this.beginStep('settle');

      this.stream.start(video, loaded.pose, loaded.face, (frame) => this.onFrame(frame));
    } catch (error) {
      console.error('[Threshold] Camera or MediaPipe failed', error);
      this.fail();
    }
  }

  private beginStep(next: SubPhase): void {
    const pose = this.currentPose();

    if (!pose) {
      return;
    }

    this.subPhase.set(next);
    this.stepStartedAt = performance.now();

    if (next === 'settle') {
      this.speak(pose.instruction);
    } else {
      this.beep();
    }
  }

  private onFrame(frame: FrameResult): void {
    if (this.phase() !== 'running') {
      return;
    }

    const pose = this.currentPose();

    if (!pose) {
      return;
    }

    const elapsed = performance.now() - this.stepStartedAt;
    const limit = this.subPhase() === 'settle' ? pose.settleMs : pose.captureMs;

    this.secondsLeft.set(Math.ceil(Math.max(0, limit - elapsed) / 1000));
    this.faceVisible.set(frame.faceTransform !== null);

    if (this.subPhase() === 'capture') {
      this.record(pose, Math.round(elapsed), frame);
    }

    if (elapsed < limit) {
      return;
    }

    if (this.subPhase() === 'settle') {
      this.beginStep('capture');
      return;
    }

    const next = this.poseIndex() + 1;

    if (next >= THRESHOLD_SCRIPT.length) {
      this.finish();
      return;
    }

    this.poseIndex.set(next);
    this.beginStep('settle');
  }

  private record(pose: ThresholdPose, t: number, frame: FrameResult): void {
    const head = decodeHeadPose(frame.faceTransform);
    const iris = computeIrisGaze(frame, this.videoWidth, this.videoHeight);

    this.samples.push({
      poseId: pose.id,
      t,
      yaw: head ? head.yawDeg : null,
      pitch: head ? head.pitchDeg : null,
      roll: head ? head.rollDeg : null,
      irisH: iris ? iris.irisGazeH : null,
      irisV: iris ? iris.irisGazeV : null,
      openness: iris ? iris.eyeOpenness : null,
    });
  }

  private finish(): void {
    this.stream.stop(this.videoRef.nativeElement);
    this.camera.stop();
    this.summary.set(this.buildSummary());
    this.speak('All poses complete.');
    this.phase.set('done');
  }

  private buildSummary(): PoseSummary[] {
    return THRESHOLD_SCRIPT.map((pose) => {
      const rows = this.samples.filter((sample) => sample.poseId === pose.id);

      return {
        pose,
        frames: rows.length,
        faceFrames: rows.filter((row) => row.yaw !== null).length,
        yaw: stats(rows.map((row) => row.yaw)),
        pitch: stats(rows.map((row) => row.pitch)),
        irisH: stats(rows.map((row) => row.irisH)),
        irisV: stats(rows.map((row) => row.irisV)),
        openness: stats(rows.map((row) => row.openness)),
      };
    });
  }

  protected exportCsv(): void {
    const header = [
      'scriptId',
      'personId',
      'cameraSpot',
      'session',
      'videoWidth',
      'videoHeight',
      'heightM',
      'eyeHeightM',
      'distanceM',
      'azimuthDeg',
      'screenCentreDistanceM',
      'screenWidthM',
      'screenCentreHeightM',
      'screenDistanceM',
      'awayMarkerOffsetM',
      'notes',
      'pose',
      'group',
      't',
      'yaw',
      'pitch',
      'roll',
      'irisH',
      'irisV',
      'openness',
    ].join(',');

    const groupById = new Map(THRESHOLD_SCRIPT.map((pose) => [pose.id, pose.group]));
    const prefix = [
      THRESHOLD_SCRIPT_ID,
      this.personId().trim(),
      this.cameraSpot(),
      this.sessionNumber(),
      this.videoWidth,
      this.videoHeight,
      this.heightM(),
      this.eyeHeightM(),
      this.distanceM(),
      this.azimuthDeg(),
      this.screenCentreDistanceM(),
      this.screenWidthM(),
      this.screenCentreHeightM(),
      this.screenDistanceM(),
      this.awayMarkerOffsetM(),
      JSON.stringify(this.notes()),
    ].join(',');

    const rows = this.samples.map((sample) =>
      [
        prefix,
        sample.poseId,
        groupById.get(sample.poseId) ?? '',
        sample.t,
        num(sample.yaw),
        num(sample.pitch),
        num(sample.roll),
        num(sample.irisH),
        num(sample.irisV),
        num(sample.openness),
      ].join(','),
    );

    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `threshold_${this.personId().trim()}_${this.cameraSpot()}_s${this.sessionNumber()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  protected again(): void {
    this.sessionNumber.update((value) => value + 1);
    this.phase.set('setup');
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
      console.warn('[Threshold] Speech unavailable', error);
    }
  }

  private beep(): void {
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
      console.warn('[Threshold] Audio unavailable', error);
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

function stats(values: (number | null)[]): Stats | null {
  const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));

  if (clean.length === 0) {
    return null;
  }

  const sorted = [...clean].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median:
      sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
  };
}

function num(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 1e4) / 1e4);
}
