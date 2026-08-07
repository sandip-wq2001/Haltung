import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CameraService {
  private stream: MediaStream | null = null;

  async start(): Promise<MediaStream> {
    if (this.stream) {
      return this.stream;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user',
      },
      audio: false,
    });

    return this.stream;
  }

  stop(): void {
    if (!this.stream) {
      return;
    }

    for (const track of this.stream.getTracks()) {
      track.stop();
    }

    this.stream = null;
  }
}