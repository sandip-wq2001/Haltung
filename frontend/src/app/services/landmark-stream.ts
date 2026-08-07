import { Injectable } from '@angular/core';
import { FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

import type { FrameResult } from '../models/landmarks';

@Injectable({ providedIn: 'root' })
export class LandmarkStream {
  private running = false;
  private vfcHandle: number | null = null;
  private recentFrameTimes: number[] = [];

  start(
    video: HTMLVideoElement,
    pose: PoseLandmarker,
    face: FaceLandmarker,
    onFrameResult: (frame: FrameResult) => void,
    onError?: (error: unknown) => void,
  ): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.recentFrameTimes = [];

    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
      throw new Error('This browser does not support requestVideoFrameCallback.');
    }

    const onFrame = (): void => {
      if (!this.running) {
        return;
      }

      try {
        const t = performance.now();
        const poseResult = pose.detectForVideo(video, t);
        const faceResult = face.detectForVideo(video, t);

        this.recentFrameTimes.push(t);
        if (this.recentFrameTimes.length > 30) {
          this.recentFrameTimes.shift();
        }

        onFrameResult({
          pose: poseResult.landmarks.length
            ? { landmarks: poseResult.landmarks[0] }
            : null,
          face: faceResult.faceLandmarks.length
            ? { landmarks: faceResult.faceLandmarks[0] }
            : null,
          faceTransform: faceResult.facialTransformationMatrixes?.[0]?.data ?? null,
          timestampMs: t,
          fps: this.computeFps(),
        });
      } catch (error) {
        console.error('[LandmarkStream] frame loop stopped', error);
        this.running = false;
        onError?.(error);
        return;
      }

      this.vfcHandle = video.requestVideoFrameCallback(onFrame);
    };

    this.vfcHandle = video.requestVideoFrameCallback(onFrame);
  }

  stop(video: HTMLVideoElement): void {
    this.running = false;
    if (this.vfcHandle !== null) {
      video.cancelVideoFrameCallback(this.vfcHandle);
      this.vfcHandle = null;
    }
    this.recentFrameTimes = [];
  }

  private computeFps(): number {
    const n = this.recentFrameTimes.length;
    if (n < 2) {
      return 0;
    }
    const spanMs = this.recentFrameTimes[n - 1] - this.recentFrameTimes[0];
    if (spanMs <= 0) {
      return 0;
    }
    return ((n - 1) * 1000) / spanMs;
  }
}
