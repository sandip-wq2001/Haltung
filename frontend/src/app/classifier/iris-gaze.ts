import type { FrameResult, NormalizedLandmark } from '../models/landmarks';

export interface IrisGaze {
  irisGazeH: number;
  irisGazeV: number;
  eyeOpenness: number;
}

const RIGHT_EYE = { iris: 468, cornerA: 33, cornerB: 133, lidTop: 159, lidBottom: 145 };
const LEFT_EYE = { iris: 473, cornerA: 362, cornerB: 263, lidTop: 386, lidBottom: 374 };

export const EYE_LANDMARK_INDICES: readonly number[] = [
  RIGHT_EYE.cornerA,
  RIGHT_EYE.cornerB,
  RIGHT_EYE.lidTop,
  RIGHT_EYE.lidBottom,
  LEFT_EYE.cornerA,
  LEFT_EYE.cornerB,
  LEFT_EYE.lidTop,
  LEFT_EYE.lidBottom,
];

interface Point {
  x: number;
  y: number;
}

interface EyeIndices {
  iris: number;
  cornerA: number;
  cornerB: number;
  lidTop: number;
  lidBottom: number;
}

interface EyeSignals {
  h: number;
  v: number;
  openness: number;
}

export function computeIrisGaze(frame: FrameResult, width: number, height: number): IrisGaze | null {
  const face = frame.face;

  if (!face || face.landmarks.length <= 477) {
    return null;
  }

  const right = eyeSignals(face.landmarks, RIGHT_EYE, width, height);
  const left = eyeSignals(face.landmarks, LEFT_EYE, width, height);

  if (right === null || left === null) {
    return null;
  }

  return {
    irisGazeH: (right.h + left.h) / 2,
    irisGazeV: (right.v + left.v) / 2,
    eyeOpenness: (right.openness + left.openness) / 2,
  };
}

function eyeSignals(
  landmarks: NormalizedLandmark[],
  eye: EyeIndices,
  width: number,
  height: number,
): EyeSignals | null {
  const iris = toPixel(landmarks[eye.iris], width, height);
  const cornerA = toPixel(landmarks[eye.cornerA], width, height);
  const cornerB = toPixel(landmarks[eye.cornerB], width, height);
  const lidTop = toPixel(landmarks[eye.lidTop], width, height);
  const lidBottom = toPixel(landmarks[eye.lidBottom], width, height);

  const left = Math.min(cornerA.x, cornerB.x);
  const right = Math.max(cornerA.x, cornerB.x);
  const eyeWidth = right - left;

  const top = Math.min(lidTop.y, lidBottom.y);
  const bottom = Math.max(lidTop.y, lidBottom.y);
  const lidGap = bottom - top;

  if (eyeWidth <= 1e-6 || lidGap <= 1e-6) {
    return null;
  }

  const cornerMidY = (cornerA.y + cornerB.y) / 2;

  return {
    h: (iris.x - left) / eyeWidth - 0.5,
    v: (iris.y - cornerMidY) / eyeWidth,
    openness: lidGap / eyeWidth,
  };
}

function toPixel(landmark: NormalizedLandmark, width: number, height: number): Point {
  return { x: landmark.x * width, y: landmark.y * height };
}
