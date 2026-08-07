import { Injectable } from '@angular/core';
import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';

import type { Delegate } from '../models/landmarks';

export interface LoadedLandmarkers {
  pose: PoseLandmarker;
  face: FaceLandmarker;
  delegate: Delegate;
}

@Injectable({
  providedIn: 'root',
})
export class MediapipeLoader {
  private loaded: LoadedLandmarkers | null = null;

  async load(): Promise<LoadedLandmarkers> {
    if (this.loaded) {
      return this.loaded;
    }

    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

    const createLandmarkers = async (
      delegate: Delegate,
    ): Promise<LoadedLandmarkers> => {
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/models/pose_landmarker_full.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });

      const face = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/models/face_landmarker.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });

      return { pose, face, delegate };
    };

    try {
      this.loaded = await createLandmarkers('GPU');
      return this.loaded;
    } catch (gpuError) {
      console.warn(
        '[MediapipeLoader] GPU delegate failed, falling back to CPU.',
        gpuError,
      );

      this.loaded = await createLandmarkers('CPU');
      return this.loaded;
    }
  }
}
