import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  faceMatrixAvailable,
  fullPostureAvailable,
  irisIpdAvailable,
  loadManifest,
  poseAvailable,
  poseVisibilityPass,
  summarizeFrames,
} from './analyze-input-coverage.mjs';

const CURRENT_MANIFEST = resolve('eval/evaluation-manifest.json');

function goodFrame() {
  const pose = Array.from({ length: 33 }, (_, index) => [index / 100, index / 200, 0, 0.99]);
  return {
    pose,
    iris: [
      [0.45, 0.4],
      [0.55, 0.4],
    ],
    m: Array.from({ length: 16 }, (_, index) => index),
  };
}

describe('separate input-coverage predicates', () => {
  it('keeps Pose available when the independent Face outputs are absent', () => {
    const frame = { ...goodFrame(), iris: null, m: null };
    assert.equal(poseAvailable(frame), true);
    assert.equal(poseVisibilityPass(frame), true);
    assert.equal(irisIpdAvailable(frame), false);
    assert.equal(faceMatrixAvailable(frame), false);
    assert.equal(fullPostureAvailable(frame), false);
  });

  it('distinguishes a visibility-gate failure from Pose absence', () => {
    const frame = goodFrame();
    frame.pose[8][3] = 0.49;
    assert.equal(poseAvailable(frame), true);
    assert.equal(poseVisibilityPass(frame), false);
    assert.equal(irisIpdAvailable(frame), true);
    assert.equal(fullPostureAvailable(frame), false);
  });

  it('requires distinct iris centres for posture normalization', () => {
    const frame = goodFrame();
    frame.iris = [
      [0.5, 0.4],
      [0.5, 0.4],
    ];
    assert.equal(irisIpdAvailable(frame), false);
    assert.equal(fullPostureAvailable(frame), false);
  });

  it('keeps iris/IPD and the head-orientation matrix as independent measures', () => {
    const matrixOnly = { ...goodFrame(), iris: null };
    assert.equal(irisIpdAvailable(matrixOnly), false);
    assert.equal(faceMatrixAvailable(matrixOnly), true);
    assert.equal(fullPostureAvailable(matrixOnly), false);

    const irisOnly = { ...goodFrame(), m: null };
    assert.equal(irisIpdAvailable(irisOnly), true);
    assert.equal(faceMatrixAvailable(irisOnly), false);
    assert.equal(fullPostureAvailable(irisOnly), true);
  });

  it('reports the five measures independently on one shared denominator', () => {
    const complete = goodFrame();
    const poseOnly = { ...goodFrame(), iris: null, m: null };
    const absent = { pose: null, iris: null, m: null };
    assert.deepEqual(summarizeFrames([complete, poseOnly, absent]), {
      heldFrames: 3,
      poseAvailableFrames: 2,
      poseAvailablePct: 66.666667,
      poseVisibilityPassFrames: 2,
      poseVisibilityPassPct: 66.666667,
      poseVisibilityPassGivenPosePct: 100,
      irisIpdAvailableFrames: 1,
      irisIpdAvailablePct: 33.333333,
      faceMatrixAvailableFrames: 1,
      faceMatrixAvailablePct: 33.333333,
      fullPostureAvailableFrames: 1,
      fullPostureAvailablePct: 33.333333,
      minimumRequiredPoseVisibility: 0.99,
      medianRequiredPoseVisibility: 0.99,
    });
  });

  it('leaves visibility-given-Pose undefined when Pose is wholly absent', () => {
    const summary = summarizeFrames([{ pose: null, iris: null, m: null }]);
    assert.equal(summary.poseVisibilityPassGivenPosePct, null);
  });

  it('rejects contamination between the primary and held-out manifest groups', () => {
    const manifest = JSON.parse(readFileSync(CURRENT_MANIFEST, 'utf8'));
    const primaryOffAxis = manifest.primarySessions.findIndex(
      (session) => session.participantId === 'P4' && session.condition === 'B_offaxis',
    );
    const authorOffAxis = manifest.heldOutSessions.findIndex(
      (session) => session.condition === 'B_offaxis',
    );
    [manifest.primarySessions[primaryOffAxis], manifest.heldOutSessions[authorOffAxis]] = [
      manifest.heldOutSessions[authorOffAxis],
      manifest.primarySessions[primaryOffAxis],
    ];

    const directory = mkdtempSync(join(tmpdir(), 'haltung-coverage-test-'));
    const path = join(directory, 'manifest.json');
    try {
      writeFileSync(path, JSON.stringify(manifest), 'utf8');
      assert.throws(
        () => loadManifest(path),
        /P1–P4 in primary and Author only in held-out/,
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
