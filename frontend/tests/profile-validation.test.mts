import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isScreenBaseline, type ScreenBaseline } from '../src/app/classifier/attention-baseline.ts';
import {
  isCalibrationProfile,
  type CalibrationProfile,
} from '../src/app/classifier/calibration-profile.ts';

const profile: CalibrationProfile = {
  createdAt: '2026-07-14T00:00:00.000Z',
  metrics: {
    headTiltDeg: { median: 0, scaledMad: 1 },
    shoulderTiltDeg: { median: 0, scaledMad: 1 },
    headShoulderOffsetRatio: { median: 0, scaledMad: 0.02 },
    shoulderWidthRatio: { median: 4, scaledMad: 0.05 },
    earShoulderVerticalRatio: { median: 2, scaledMad: 0.05 },
  },
};

describe('persisted calibration validation', () => {
  it('accepts a complete finite profile', () => {
    assert.equal(isCalibrationProfile(profile), true);
  });

  it('rejects the partial profile that previously stopped the live frame loop', () => {
    const partial = {
      createdAt: '2026-07-14T00:00:00.000Z',
      metrics: { headTiltDeg: { median: 1.2, scaledMad: 1 } },
    };

    assert.equal(isCalibrationProfile(partial), false);
  });

  it('rejects non-finite values and non-positive dispersion', () => {
    assert.equal(
      isCalibrationProfile({
        ...profile,
        metrics: { ...profile.metrics, shoulderTiltDeg: { median: Number.NaN, scaledMad: 1 } },
      }),
      false,
    );
    assert.equal(
      isCalibrationProfile({
        ...profile,
        metrics: { ...profile.metrics, shoulderTiltDeg: { median: 0, scaledMad: 0 } },
      }),
      false,
    );
  });

  it('validates the complete screen-direction baseline', () => {
    const baseline: ScreenBaseline = {
      createdAt: '2026-07-14T00:00:00.000Z',
      yawMedianDeg: -2.3,
      pitchMedianDeg: 4.1,
    };

    assert.equal(isScreenBaseline(baseline), true);
    assert.equal(isScreenBaseline({ ...baseline, pitchMedianDeg: Number.NaN }), false);
    assert.equal(isScreenBaseline({ yawMedianDeg: 0, pitchMedianDeg: 0 }), false);
  });
});
