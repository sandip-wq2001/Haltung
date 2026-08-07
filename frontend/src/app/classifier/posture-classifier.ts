import type { PostureMetrics } from './posture-metrics';
import {
  isCalibrationProfile,
  type CalibrationProfile,
  type MetricBaseLine,
} from './calibration-profile';

export type PostureState = 'within_range' | 'moderate_deviation' | 'large_deviation';

const ROLL_DIFF_BAD_DEG = 3;
const ROLL_DIFF_VERY_BAD_DEG = 7;

function classifyMagnitude(value: number, bad: number, veryBad: number): number {
  const magnitude = Math.abs(value);

  if (magnitude > veryBad) {
    return 2;
  }

  if (magnitude > bad) {
    return 1;
  }

  return 0;
}

function postureStateFromSeverity(severity: number): PostureState {
  if (severity === 2) {
    return 'large_deviation';
  }

  if (severity === 1) {
    return 'moderate_deviation';
  }

  return 'within_range';
}

export function classifyPosture(metrics: PostureMetrics): PostureState {
  const severity = classifyMagnitude(
    metrics.headShoulderRollDiff,
    ROLL_DIFF_BAD_DEG,
    ROLL_DIFF_VERY_BAD_DEG,
  );

  return postureStateFromSeverity(severity);
}

function zScore(value: number, baseline: MetricBaseLine): number {
  return Math.abs((value - baseline.median) / baseline.scaledMad);
}

const Z_BAD = 2.5;
const Z_VERY_BAD = 3.5;

function severityFromZ(z: number): number {
  if (z > Z_VERY_BAD) {
    return 2;
  }

  if (z > Z_BAD) {
    return 1;
  }
  return 0;
}

export interface CalibratedZScores {
  headTiltDeg: number;
  shoulderTiltDeg: number;
  headShoulderOffsetRatio: number;
  shoulderWidthRatio: number;
  earShoulderVerticalRatio: number;
}

export function calibratedZScores(
  metrics: PostureMetrics,
  profile: CalibrationProfile | null,
): CalibratedZScores | null {
  if (!isCalibrationProfile(profile)) {
    return null;
  }

  return {
    headTiltDeg: zScore(metrics.headTiltDeg, profile.metrics.headTiltDeg),
    shoulderTiltDeg: zScore(metrics.shoulderTiltDeg, profile.metrics.shoulderTiltDeg),
    headShoulderOffsetRatio: zScore(
      metrics.headShoulderOffsetRatio,
      profile.metrics.headShoulderOffsetRatio,
    ),
    shoulderWidthRatio: zScore(metrics.shoulderWidthRatio, profile.metrics.shoulderWidthRatio),
    earShoulderVerticalRatio: zScore(
      metrics.earShoulderVerticalRatio,
      profile.metrics.earShoulderVerticalRatio,
    ),
  };
}

export function classifyFromZScores(z: CalibratedZScores): PostureState {
  const severity = Math.max(
    severityFromZ(z.headTiltDeg),
    severityFromZ(z.shoulderTiltDeg),
    severityFromZ(z.headShoulderOffsetRatio),
    severityFromZ(z.shoulderWidthRatio),
    severityFromZ(z.earShoulderVerticalRatio),
  );

  return postureStateFromSeverity(severity);
}

export function classifyCalibratedPosture(
  metrics: PostureMetrics,
  profile: CalibrationProfile | null,
): PostureState | null {
  const z = calibratedZScores(metrics, profile);

  if (!z) {
    return null;
  }

  return classifyFromZScores(z);
}
