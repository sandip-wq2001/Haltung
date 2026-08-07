import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { computePostureMetrics, type PostureMetrics } from '../../classifier/posture-metrics';
import { CameraService } from '../../services/camera.service';
import { MediapipeLoader } from '../../services/mediapipe-loader';
import { LandmarkStream } from '../../services/landmark-stream';
import { createCalibrationProfile } from '../../classifier/calibration-profile';
import { CalibrationProfileService } from '../../services/calibration-profile.service';
import { decodeHeadPose, type HeadPose } from '../../classifier/head-pose';
import { createScreenBaseline } from '../../classifier/attention-baseline';
import { ScreenBaselineService } from '../../services/screen-baseline.service';
import { ProfilePersistence } from '../../services/profile-persistence';

type CalibrationStatus = 'idle' | 'starting' | 'countdown' | 'capturing' | 'done' | 'failed';

const PREPARATION_DURATION = 5_000;
const CALIBRATION_DURATION = 30_000;
const CALIBRATION_SAMPLE_INTERVAL = 500;

@Component({
  selector: 'app-calibration',
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  templateUrl: './calibration.html',
  styleUrl: './calibration.scss',
})
export class Calibration implements OnDestroy {
  @ViewChild('video', { static: true })
  private readonly videoRef!: ElementRef<HTMLVideoElement>;

  protected readonly calibrationStatus = signal<CalibrationStatus>('idle');
  protected readonly samples = signal<PostureMetrics[]>([]);
  protected readonly poseSamples = signal<HeadPose[]>([]);
  protected readonly secondsRemaining = signal(30);

  private readonly camera = inject(CameraService);
  private readonly mediapipeLoader = inject(MediapipeLoader);
  private readonly stream = inject(LandmarkStream);
  private readonly calibrationProfiles = inject(CalibrationProfileService);
  private readonly screenBaselines = inject(ScreenBaselineService);
  private readonly profilePersistence = inject(ProfilePersistence);

  protected startCalibration(): void {
    this.calibrationStatus.set('starting');
    this.samples.set([]);
    this.poseSamples.set([]);
    void this.startMetricCapture();
  }

  private async startMetricCapture(): Promise<void> {
    const video = this.videoRef.nativeElement;

    try {
      video.srcObject = await this.camera.start();
      await video.play();

      const loaded = await this.mediapipeLoader.load();

      this.calibrationStatus.set('countdown');
      const countdownStartedAt = performance.now();
      let captureStartedAt = 0;
      let nextSampleAt = 0;

      this.stream.start(video, loaded.pose, loaded.face, (frame) => {
        if (this.calibrationStatus() === 'countdown') {
          const countdownElapsed = performance.now() - countdownStartedAt;
          const countdownRemaining = Math.max(0, PREPARATION_DURATION - countdownElapsed);
          this.secondsRemaining.set(Math.ceil(countdownRemaining / 1000));

          if (countdownElapsed < PREPARATION_DURATION) {
            return;
          }

          captureStartedAt = performance.now();
          this.secondsRemaining.set(30);
          this.calibrationStatus.set('capturing');
          return;
        }

        const elapsedTime = performance.now() - captureStartedAt;
        const remainingTime = Math.max(0, CALIBRATION_DURATION - elapsedTime);
        this.secondsRemaining.set(Math.ceil(remainingTime / 1000));

        if (elapsedTime >= CALIBRATION_DURATION) {
          this.stream.stop(video);
          this.camera.stop();

          const profile = createCalibrationProfile(this.samples());
          const screenBaseline = createScreenBaseline(this.poseSamples());

          if (!profile || !screenBaseline) {
            this.calibrationStatus.set('failed');
            return;
          }

          this.calibrationProfiles.save(profile);
          this.screenBaselines.save(screenBaseline);
          this.profilePersistence.save(profile, screenBaseline);
          this.calibrationStatus.set('done');
          return;
        }

        if (elapsedTime < nextSampleAt) {
          return;
        }

        nextSampleAt = elapsedTime + CALIBRATION_SAMPLE_INTERVAL;
        const metrics = computePostureMetrics(frame, video.videoWidth, video.videoHeight);

        if (metrics) {
          this.samples.update((current) => [...current, metrics]);
        }

        const headPose = decodeHeadPose(frame.faceTransform);

        if (headPose) {
          this.poseSamples.update((current) => [...current, headPose]);
        }
      });
    } catch (error) {
      console.error('[Calibration] Capture failed', error);
      this.calibrationStatus.set('failed');
      this.camera.stop();
    }
  }

  ngOnDestroy(): void {
    this.stream.stop(this.videoRef.nativeElement);
    this.camera.stop();
  }
}
