import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifierStatus } from './freeze-dataset.mjs';

describe('dataset-freeze verifier dispositions', () => {
  it('labels only per-segment input loss as COVERAGE_FAIL', () => {
    assert.equal(
      verifierStatus([
        "segment 'tilt_head_right' expects posture 'deviation' but only 0% of frames can produce posture metrics (need >= 80%)",
      ]),
      'COVERAGE_FAIL',
    );
  });

  it('keeps a missing posture calibration baseline as FAIL', () => {
    assert.equal(
      verifierStatus([
        'only 0 calibration frames can produce posture metrics, need >= 30 — the profile cannot be rebuilt',
      ]),
      'FAIL',
    );
  });

  it('keeps a missing attention calibration baseline as FAIL', () => {
    assert.equal(
      verifierStatus([
        'only 0 calibration frames carry a face matrix, need >= 30 — the screen baseline cannot be rebuilt',
      ]),
      'FAIL',
    );
  });
});
