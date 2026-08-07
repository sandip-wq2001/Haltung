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

import { computePostureMetrics } from '../../classifier/posture-metrics';
import { readTiltLines } from '../../classifier/tilt-lines';
import type { FrameResult } from '../../models/landmarks';
import {
  POSTURE_SCRIPT,
  POSTURE_SCRIPT_ID,
  type PosturePose,
} from '../../recording/posture-script';
import { CameraService } from '../../services/camera.service';
import { LandmarkStream } from '../../services/landmark-stream';
import { MediapipeLoader } from '../../services/mediapipe-loader';

type Phase = 'setup' | 'running' | 'done' | 'failed';
type SubPhase = 'settle' | 'capture';
type CameraSpot = 'frontal' | 'left' | 'right';

interface Sample {
  poseId: string;
  t: number;
  headTilt: number | null;
  shoulderTilt: number | null;
  rollDiff: number | null;
  ipd: number | null;
  headShoulderOffsetRatio: number | null;
  shoulderWidthRatio: number | null;
  earShoulderVerticalRatio: number | null;
  earLeftVis: number | null;
  earRightVis: number | null;
  shoulderLeftVis: number | null;
  shoulderRightVis: number | null;
}

interface Stats {
  min: number;
  median: number;
  max: number;
}

interface PoseSummary {
  pose: PosturePose;
  frames: number;
  poseFrames: number;
  metricFrames: number;
  headTilt: Stats | null;
  shoulderTilt: Stats | null;
  rollDiff: Stats | null;
  ipd: Stats | null;
  headShoulderOffsetRatio: Stats | null;
  shoulderWidthRatio: Stats | null;
  earShoulderVerticalRatio: Stats | null;
  minVisibility: number | null;
}

@Component({
  selector: 'app-posture',
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
  templateUrl: './posture.html',
  styleUrl: './posture.scss',
})
export class PostureSession implements OnDestroy {
  @ViewChild('video', { static: true })
  private readonly videoRef!: ElementRef<HTMLVideoElement>;

  protected readonly script = POSTURE_SCRIPT;

  protected readonly phase = signal<Phase>('setup');
  protected readonly subPhase = signal<SubPhase>('settle');
  protected readonly poseIndex = signal(0);
  protected readonly secondsLeft = signal(0);
  protected readonly poseVisible = signal(false);
  protected readonly summary = signal<PoseSummary[]>([]);

  protected readonly liveHeadTilt = signal<number | null>(null);
  protected readonly liveShoulderTilt = signal<number | null>(null);
  protected readonly liveRollDiff = signal<number | null>(null);

  protected readonly personId = signal('');
  protected readonly cameraSpot = signal<CameraSpot>('frontal');
  protected readonly sessionNumber = signal(1);
  protected readonly voiceEnabled = signal(true);
  protected readonly notes = signal('');

  protected readonly cameraHeightM = signal<number | null>(null);
  protected readonly eyeHeightM = signal<number | null>(null);
  protected readonly eyeToCameraM = signal<number | null>(null);
  protected readonly eyeToMonitorM = signal<number | null>(null);
  protected readonly cameraToMonitorM = signal<number | null>(null);
  protected readonly lidAngleDeg = signal<number | null>(null);

  protected readonly derivedAzimuthDeg = computed<number | null>(() => {
    const a = this.eyeToCameraM();
    const b = this.eyeToMonitorM();
    const c = this.cameraToMonitorM();

    if (!isPositive(a) || !isPositive(b) || !isNonNegative(c)) {
      return null;
    }

    const cosAzimuth = (a * a + b * b - c * c) / (2 * a * b);

    const EPSILON = 0.02;

    if (cosAzimuth < -1 - EPSILON || cosAzimuth > 1 + EPSILON) {
      return null;
    }

    const clamped = Math.min(1, Math.max(-1, cosAzimuth));

    return Math.acos(clamped) * (180 / Math.PI);
  });

  protected readonly canStart = computed(
    () =>
      this.personId().trim().length > 0 &&
      isPositive(this.cameraHeightM()) &&
      isPositive(this.eyeHeightM()) &&
      isPositive(this.eyeToCameraM()) &&
      isPositive(this.eyeToMonitorM()) &&
      isNonNegative(this.cameraToMonitorM()) &&
      isPositive(this.lidAngleDeg()) &&
      this.derivedAzimuthDeg() !== null,
  );

  protected readonly spotMismatch = computed(() => {
    const azimuth = this.derivedAzimuthDeg();

    if (azimuth === null) {
      return null;
    }

    if (this.cameraSpot() === 'frontal' && azimuth > 5) {
      return `Camera position says "frontal" but the derived azimuth is ${azimuth.toFixed(1)}°. Check the dropdown or the three distances.`;
    }

    if (this.cameraSpot() !== 'frontal' && azimuth <= 5) {
      return `Camera position says "${this.cameraSpot()}" but the derived azimuth is only ${azimuth.toFixed(1)}°. Check the dropdown or the three distances.`;
    }

    return null;
  });
  protected readonly currentPose = computed<PosturePose | null>(
    () => POSTURE_SCRIPT[this.poseIndex()] ?? null,
  );
  protected readonly progressPercent = computed(
    () => (this.poseIndex() / POSTURE_SCRIPT.length) * 100,
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
      console.error('[Posture] Camera or MediaPipe failed', error);
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
    const lines = readTiltLines(frame, this.videoWidth, this.videoHeight);

    this.secondsLeft.set(Math.ceil(Math.max(0, limit - elapsed) / 1000));
    this.poseVisible.set(lines.ear !== null && lines.shoulder !== null);
    this.liveHeadTilt.set(lines.ear?.tiltDeg ?? null);
    this.liveShoulderTilt.set(lines.shoulder?.tiltDeg ?? null);
    this.liveRollDiff.set(lines.rollDiff);

    if (this.subPhase() === 'capture') {
      const metrics = computePostureMetrics(frame, this.videoWidth, this.videoHeight);

      this.record(pose, Math.round(elapsed), lines, metrics);
    }

    if (elapsed < limit) {
      return;
    }

    if (this.subPhase() === 'settle') {
      this.beginStep('capture');
      return;
    }

    const next = this.poseIndex() + 1;

    if (next >= POSTURE_SCRIPT.length) {
      this.finish();
      return;
    }

    this.poseIndex.set(next);
    this.beginStep('settle');
  }

  private record(
    pose: PosturePose,
    t: number,
    lines: ReturnType<typeof readTiltLines>,
    metrics: ReturnType<typeof computePostureMetrics>,
  ): void {
    this.samples.push({
      poseId: pose.id,
      t,
      headTilt: lines.ear?.tiltDeg ?? null,
      shoulderTilt: lines.shoulder?.tiltDeg ?? null,
      rollDiff: lines.rollDiff,
      ipd: metrics?.ipd ?? null,
      headShoulderOffsetRatio: metrics?.headShoulderOffsetRatio ?? null,
      shoulderWidthRatio: metrics?.shoulderWidthRatio ?? null,
      earShoulderVerticalRatio: metrics?.earShoulderVerticalRatio ?? null,
      earLeftVis: lines.ear?.left.visibility ?? null,
      earRightVis: lines.ear?.right.visibility ?? null,
      shoulderLeftVis: lines.shoulder?.left.visibility ?? null,
      shoulderRightVis: lines.shoulder?.right.visibility ?? null,
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
    return POSTURE_SCRIPT.map((pose) => {
      const rows = this.samples.filter((sample) => sample.poseId === pose.id);
      const visibilities = rows.flatMap((row) =>
        [row.earLeftVis, row.earRightVis, row.shoulderLeftVis, row.shoulderRightVis].filter(
          (value): value is number => value !== null && Number.isFinite(value),
        ),
      );

      return {
        pose,
        frames: rows.length,
        poseFrames: rows.filter((row) => row.rollDiff !== null).length,
        metricFrames: rows.filter((row) => row.ipd !== null).length,
        headTilt: stats(rows.map((row) => row.headTilt)),
        shoulderTilt: stats(rows.map((row) => row.shoulderTilt)),
        rollDiff: stats(rows.map((row) => row.rollDiff)),
        ipd: stats(rows.map((row) => row.ipd)),
        headShoulderOffsetRatio: stats(rows.map((row) => row.headShoulderOffsetRatio)),
        shoulderWidthRatio: stats(rows.map((row) => row.shoulderWidthRatio)),
        earShoulderVerticalRatio: stats(rows.map((row) => row.earShoulderVerticalRatio)),
        minVisibility: visibilities.length ? Math.min(...visibilities) : null,
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
      'cameraHeightM',
      'eyeHeightM',
      'eyeToCameraM',
      'eyeToMonitorM',
      'cameraToMonitorM',
      'derivedAzimuthDeg',
      'lidAngleDeg',
      'notes',
      'pose',
      'group',
      't',
      'headTilt',
      'shoulderTilt',
      'rollDiff',
      'ipd',
      'headShoulderOffsetRatio',
      'shoulderWidthRatio',
      'earShoulderVerticalRatio',
      'earLeftVis',
      'earRightVis',
      'shoulderLeftVis',
      'shoulderRightVis',
    ].join(',');

    const groupById = new Map(POSTURE_SCRIPT.map((pose) => [pose.id, pose.group]));
    const prefix = [
      POSTURE_SCRIPT_ID,
      this.personId().trim(),
      this.cameraSpot(),
      this.sessionNumber(),
      this.videoWidth,
      this.videoHeight,
      num(this.cameraHeightM()),
      num(this.eyeHeightM()),
      num(this.eyeToCameraM()),
      num(this.eyeToMonitorM()),
      num(this.cameraToMonitorM()),
      num(this.derivedAzimuthDeg()),
      num(this.lidAngleDeg()),
      JSON.stringify(this.notes()),
    ].join(',');

    const rows = this.samples.map((sample) =>
      [
        prefix,
        sample.poseId,
        groupById.get(sample.poseId) ?? '',
        sample.t,
        num(sample.headTilt),
        num(sample.shoulderTilt),
        num(sample.rollDiff),
        num(sample.ipd),
        num(sample.headShoulderOffsetRatio),
        num(sample.shoulderWidthRatio),
        num(sample.earShoulderVerticalRatio),
        num(sample.earLeftVis),
        num(sample.earRightVis),
        num(sample.shoulderLeftVis),
        num(sample.shoulderRightVis),
      ].join(','),
    );

    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `posture_${this.personId().trim()}_${this.cameraSpot()}_s${this.sessionNumber()}.csv`;
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
      console.warn('[Posture] Speech unavailable', error);
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
      console.warn('[Posture] Audio unavailable', error);
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
    median: sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
  };
}

function num(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 1e4) / 1e4);
}

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function isNonNegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}
