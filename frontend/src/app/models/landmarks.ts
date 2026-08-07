export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseResult {
  landmarks: NormalizedLandmark[];
}

export interface FaceResult {
  landmarks: NormalizedLandmark[];
}

export interface FrameResult {
  pose: PoseResult | null;
  face: FaceResult | null;
  faceTransform: number[] | null;
  timestampMs: number;
  fps: number;
}

export type Delegate = 'GPU' | 'CPU';
