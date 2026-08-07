import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';

import { DrawingUtils } from '@mediapipe/tasks-vision';
import {
  calibratedZScores,
  classifyCalibratedPosture,
  classifyPosture,
  type CalibratedZScores,
  type PostureState,
} from '../../classifier/posture-classifier';
import { StateSmoother } from '../../classifier/state-smoother';
import {
  computePostureMetrics,
  type PostureMetrics,
} from '../../classifier/posture-metrics';
import { decodeHeadPose, type HeadPose } from '../../classifier/head-pose';
import { computeIrisGaze, type IrisGaze } from '../../classifier/iris-gaze';
import {
  classifyCalibratedAttention,
  classifyGenericAttention,
  type ScreenFacingState,
} from '../../classifier/attention-classifier';
import type { Delegate } from '../../models/landmarks';
import { CameraService } from '../../services/camera.service';
import { LandmarkStream } from '../../services/landmark-stream';
import { MediapipeLoader } from '../../services/mediapipe-loader';
import { drawFrame, readTiltLines, type LiveFocus, type TiltLines } from './live-drawing';
import { CalibrationProfileService } from '../../services/calibration-profile.service';
import { ScreenBaselineService } from '../../services/screen-baseline.service';


@Component({
  selector: 'app-live',
  imports: [],
  templateUrl: './live.html',
  styleUrl: './live.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Live implements AfterViewInit, OnDestroy {
  @ViewChild('video', { static: true })
  private readonly videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  protected readonly status = signal('Waiting for camera...');
  protected readonly fps = signal(0);
  protected readonly delegate = signal<Delegate | null>(null);
  protected readonly metrics = signal<PostureMetrics | null>(null);
  protected readonly genericPostureState = signal<PostureState | null>(null);
  protected readonly calibratedPostureState = signal<PostureState | null>(null);
  protected readonly headPose = signal<HeadPose | null>(null);
  protected readonly genericAttention = signal<ScreenFacingState | null>(null);
  protected readonly calibratedAttention = signal<ScreenFacingState | null>(null);
  protected readonly calibratedZ = signal<CalibratedZScores | null>(null);
  protected readonly irisGaze = signal<IrisGaze | null>(null);

  protected readonly focus = signal<LiveFocus>('headTilt');
  protected readonly tiltLines = signal<TiltLines | null>(null);

  private readonly camera = inject(CameraService);
  private readonly mediapipeLoader = inject(MediapipeLoader);
  private readonly stream = inject(LandmarkStream);
  private readonly calibrationProfiles = inject(CalibrationProfileService);
  private readonly screenBaselines = inject(ScreenBaselineService);

  private readonly genericPostureSmoother = new StateSmoother<PostureState>();
  private readonly calibratedPostureSmoother = new StateSmoother<PostureState>();
  private readonly genericAttentionSmoother = new StateSmoother<ScreenFacingState>();
  private readonly calibratedAttentionSmoother = new StateSmoother<ScreenFacingState>();

  protected label(state: PostureState | ScreenFacingState | null, fallback: string): string {
    switch (state) {
      case 'within_range':
        return 'Within range';
      case 'moderate_deviation':
        return 'Moderate deviation';
      case 'large_deviation':
        return 'Large deviation';
      case 'within_screen_band':
        return 'Screen-facing';
      case 'outside_screen_band':
        return 'Away from screen';
      case 'not_in_frame':
        return 'Face not detected';
      default:
        return fallback;
    }
  }

  private static readonly FOCUS_ORDER: readonly LiveFocus[] = ['headTilt', 'tiltLines', 'all'];

  protected readonly focusLabel: Record<LiveFocus, string> = {
    headTilt: 'head tilt only',
    tiltLines: 'head + shoulder tilt',
    all: 'all metrics',
  };

  protected toggleFocus(): void {
    this.focus.update((current) => {
      const order = Live.FOCUS_ORDER;
      return order[(order.indexOf(current) + 1) % order.length];
    });
  }

  ngAfterViewInit(): void {
    void this.startLiveView();
  }

  private async startLiveView(): Promise<void> {
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[Live] Could not create canvas context.');
        this.status.set('Failed. Canvas is not available.');
        return;
      }
      const drawingUtils = new DrawingUtils(ctx);

      this.status.set('Requesting camera permission...');
      video.srcObject = await this.camera.start();
      await video.play();

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      this.status.set('Loading MediaPipe...');
      const loaded = await this.mediapipeLoader.load();
      this.delegate.set(loaded.delegate);

      this.status.set('Running.');
      this.stream.start(
        video,
        loaded.pose,
        loaded.face,
        (frame) => {
        this.fps.set(Math.round(frame.fps));
        drawFrame(frame, ctx, drawingUtils, this.focus());
        this.tiltLines.set(readTiltLines(frame, canvas.width, canvas.height));

        const t = frame.timestampMs;
        const profile = this.calibrationProfiles.profile();

        const metrics = computePostureMetrics(frame, canvas.width, canvas.height);
        const headPose = decodeHeadPose(frame.faceTransform);

        this.metrics.set(metrics);
        this.headPose.set(headPose);
        this.irisGaze.set(computeIrisGaze(frame, canvas.width, canvas.height));
        this.calibratedZ.set(metrics ? calibratedZScores(metrics, profile) : null);

        this.genericPostureState.set(
          this.genericPostureSmoother.update(metrics ? classifyPosture(metrics) : null, t),
        );
        this.calibratedPostureState.set(
          this.calibratedPostureSmoother.update(
            metrics ? classifyCalibratedPosture(metrics, profile) : null,
            t,
          ),
        );
        this.genericAttention.set(
          this.genericAttentionSmoother.update(classifyGenericAttention(headPose), t),
        );
        this.calibratedAttention.set(
          this.calibratedAttentionSmoother.update(
            classifyCalibratedAttention(headPose, this.screenBaselines.baseline()),
            t,
          ),
        );
        },
        (error) => {
          this.status.set('Stopped: the frame loop crashed. See the console.');
          console.error('[Live] frame loop crashed', error);
          this.camera.stop();
        },
      );
    } catch (error) {
      console.error('[Live] init failed', error);
      this.status.set('Failed. Check browser permission and console.');
      this.camera.stop();
    }
  }

  ngOnDestroy(): void {
    this.stream.stop(this.videoRef.nativeElement);
    this.camera.stop();
  }
}
