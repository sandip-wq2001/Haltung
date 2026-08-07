import type { HeadPose } from './head-pose';

const MIN_BASELINE_SAMPLES = 30;

export interface ScreenBaseline {
  createdAt: string;
  yawMedianDeg: number;
  pitchMedianDeg: number;
}

export function isScreenBaseline(value: unknown): value is ScreenBaseline {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['createdAt'] === 'string' &&
    Number.isFinite((value as Record<string, unknown>)['yawMedianDeg']) &&
    Number.isFinite((value as Record<string, unknown>)['pitchMedianDeg'])
  );
}

export function createScreenBaseline(samples: HeadPose[]): ScreenBaseline | null {
  if (samples.length < MIN_BASELINE_SAMPLES) {
    return null;
  }

  return {
    createdAt: new Date().toISOString(),
    yawMedianDeg: median(samples.map((sample) => sample.yawDeg)),
    pitchMedianDeg: median(samples.map((sample) => sample.pitchDeg)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}
