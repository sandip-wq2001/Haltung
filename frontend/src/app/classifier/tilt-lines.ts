import { foldAngleDeg, foldedTiltDeg, toPixelPoint } from './posture-metrics';
import type { FrameResult } from '../models/landmarks';

export const LEFT_EAR = 7;
export const RIGHT_EAR = 8;
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;

export interface LineReading {
  left: { x: number; y: number; visibility: number };
  right: { x: number; y: number; visibility: number };
  tiltDeg: number;
}

export interface TiltLines {
  ear: LineReading | null;
  shoulder: LineReading | null;
  rollDiff: number | null;
}

export function readTiltLines(frame: FrameResult, width: number, height: number): TiltLines {
  const ear = readLine(frame, width, height, LEFT_EAR, RIGHT_EAR);
  const shoulder = readLine(frame, width, height, LEFT_SHOULDER, RIGHT_SHOULDER);

  return {
    ear,
    shoulder,
    rollDiff: ear && shoulder ? foldAngleDeg(ear.tiltDeg - shoulder.tiltDeg) : null,
  };
}

function readLine(
  frame: FrameResult,
  width: number,
  height: number,
  leftIndex: number,
  rightIndex: number,
): LineReading | null {
  const pose = frame.pose;

  if (!pose || pose.landmarks.length <= Math.max(leftIndex, rightIndex)) {
    return null;
  }

  const left = pose.landmarks[leftIndex];
  const right = pose.landmarks[rightIndex];
  const leftPoint = toPixelPoint(left, width, height);
  const rightPoint = toPixelPoint(right, width, height);

  return {
    left: { x: leftPoint.x, y: leftPoint.y, visibility: left.visibility },
    right: { x: rightPoint.x, y: rightPoint.y, visibility: right.visibility },
    tiltDeg: foldedTiltDeg(leftPoint, rightPoint),
  };
}
