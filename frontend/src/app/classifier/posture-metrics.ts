import type { FrameResult, NormalizedLandmark } from '../models/landmarks';

export interface PostureMetrics {
  ipd: number;
  headShoulderOffsetRatio: number;
  headTiltDeg: number;
  shoulderTiltDeg: number;
  headShoulderRollDiff: number;
  shoulderWidthRatio: number;
  earShoulderVerticalRatio: number;
}

export interface Point {
  x: number;
  y: number;
}

export function computePostureMetrics(
  frame: FrameResult,
  width: number,
  height: number,
): PostureMetrics | null {
  const pose = frame.pose;
  const face = frame.face;

  if (!pose || !face) {
    return null;
  }

  if (pose.landmarks.length <= 12 || face.landmarks.length <= 473) {
    return null;
  }

  const leftEar = pose.landmarks[7];
  const rightEar = pose.landmarks[8];
  const leftShoulder = pose.landmarks[11];
  const rightShoulder = pose.landmarks[12];
  const irisA = face.landmarks[468];
  const irisB = face.landmarks[473];

  if (
    !hasGoodVisibility(leftEar) ||
    !hasGoodVisibility(rightEar) ||
    !hasGoodVisibility(leftShoulder) ||
    !hasGoodVisibility(rightShoulder)
  ) {
    return null;
  }

  const leftEarPoint = toPixelPoint(leftEar, width, height);
  const rightEarPoint = toPixelPoint(rightEar, width, height);
  const leftShoulderPoint = toPixelPoint(leftShoulder, width, height);
  const rightShoulderPoint = toPixelPoint(rightShoulder, width, height);
  const irisAPoint = toPixelPoint(irisA, width, height);
  const irisBPoint = toPixelPoint(irisB, width, height);

  const ipd = distance(irisAPoint, irisBPoint);

  if (ipd <= 0) {
    return null;
  }

  const earMidpoint = midPoint(leftEarPoint, rightEarPoint);
  const shoulderMidpoint = midPoint(leftShoulderPoint, rightShoulderPoint);

  const headShoulderOffsetRatio = (earMidpoint.x - shoulderMidpoint.x) / ipd;
  const shoulderWidthRatio = distance(leftShoulderPoint, rightShoulderPoint) / ipd;
  const earShoulderVerticalRatio = (shoulderMidpoint.y - earMidpoint.y) / ipd;
  const headTiltDeg = foldedTiltDeg(leftEarPoint, rightEarPoint);
  const shoulderTiltDeg = foldedTiltDeg(leftShoulderPoint, rightShoulderPoint);
  const headShoulderRollDiff = foldAngleDeg(headTiltDeg - shoulderTiltDeg);

  return {
    ipd,
    headShoulderOffsetRatio,
    headTiltDeg,
    shoulderTiltDeg,
    headShoulderRollDiff,
    shoulderWidthRatio,
    earShoulderVerticalRatio,
  };
}

function hasGoodVisibility(landmark: NormalizedLandmark): boolean {
  return landmark.visibility >= 0.5;
}

export function toPixelPoint(landmark: NormalizedLandmark, width: number, height: number): Point {
  return {
    x: landmark.x * width,
    y: landmark.y * height,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midPoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function foldAngleDeg(angle: number): number {
  if (angle > 90) {
    return angle - 180;
  }

  if (angle < -90) {
    return angle + 180;
  }

  return angle;
}

export function foldedTiltDeg(a: Point, b: Point): number {
  return foldAngleDeg(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI));
}
