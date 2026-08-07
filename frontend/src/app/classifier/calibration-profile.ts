import type { PostureMetrics } from './posture-metrics';

const MIN_CALIBRATION_SAMPLES = 30;
const MAD_NORMAL_SCALE = 1.4826;

export const MIN_SCALED_MAD_ROLL_DIFF = 0.5;

const MIN_SCALED_MAD = {
  headTiltDeg: 0.5,
  shoulderTiltDeg: 0.2,
  headShoulderOffsetRatio: 0.04,
  shoulderWidthRatio: 0.06,
  earShoulderVerticalRatio: 0.05,
} as const;

export interface MetricBaseLine {
  median: number;
  scaledMad: number;
}

export interface CalibrationProfile {
  createdAt: string;
  metrics: {
    headTiltDeg: MetricBaseLine;
    shoulderTiltDeg: MetricBaseLine;
    headShoulderOffsetRatio: MetricBaseLine;
    shoulderWidthRatio: MetricBaseLine;
    earShoulderVerticalRatio: MetricBaseLine;
  };
}

const CALIBRATION_METRIC_NAMES = [
  'headTiltDeg',
  'shoulderTiltDeg',
  'headShoulderOffsetRatio',
  'shoulderWidthRatio',
  'earShoulderVerticalRatio',
] as const;

export function isCalibrationProfile(value: unknown): value is CalibrationProfile {
  if (!isRecord(value) || typeof value['createdAt'] !== 'string') {
    return false;
  }

  const metrics = value['metrics'];

  return (
    isRecord(metrics) && CALIBRATION_METRIC_NAMES.every((name) => isMetricBaseline(metrics[name]))
  );
}

export function createCalibrationProfile(samples: PostureMetrics[]): CalibrationProfile | null {
  if (samples.length < MIN_CALIBRATION_SAMPLES) {
    return null;
  }

  return {
    createdAt: new Date().toISOString(),
    metrics: {
      headTiltDeg: robustBaseline(
        samples.map((sample) => sample.headTiltDeg),
        MIN_SCALED_MAD.headTiltDeg,
      ),
      shoulderTiltDeg: robustBaseline(
        samples.map((sample) => sample.shoulderTiltDeg),
        MIN_SCALED_MAD.shoulderTiltDeg,
      ),
      headShoulderOffsetRatio: robustBaseline(
        samples.map((sample) => sample.headShoulderOffsetRatio),
        MIN_SCALED_MAD.headShoulderOffsetRatio,
      ),
      shoulderWidthRatio: robustBaseline(
        samples.map((sample) => sample.shoulderWidthRatio),
        MIN_SCALED_MAD.shoulderWidthRatio,
      ),
      earShoulderVerticalRatio: robustBaseline(
        samples.map((sample) => sample.earShoulderVerticalRatio),
        MIN_SCALED_MAD.earShoulderVerticalRatio,
      ),
    },
  };
}

function robustBaseline(values: number[], minScaledMad: number): MetricBaseLine {
  const medianValue = median(values);
  const absoluteDeviations: number[] = [];

  for (const value of values) {
    absoluteDeviations.push(Math.abs(value - medianValue));
  }

  return {
    median: medianValue,
    scaledMad: Math.max(median(absoluteDeviations) * MAD_NORMAL_SCALE, minScaledMad),
  };
}

function median(values: number[]): number {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }

  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function isMetricBaseline(value: unknown): value is MetricBaseLine {
  return (
    isRecord(value) &&
    Number.isFinite(value['median']) &&
    Number.isFinite(value['scaledMad']) &&
    (value['scaledMad'] as number) > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
