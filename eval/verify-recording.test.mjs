// Adversarial tests for the recording verifier.
//   node --test eval/
//
// The verifier is the gate that decides whether participant data is usable. If it can be fooled,
// every number in the evaluation is suspect. Each test below is a recording that a previous version
// of the verifier CERTIFIED AS VALID and which is in fact unusable. They exist so that can never
// silently happen again.
//
// The rule these encode: check what the classifier ACTUALLY NEEDS, not merely that a field is
// present. Posture needs pose AND iris AND visibility >= 0.5; attention needs the face matrix;
// `not_in_frame` is decided by a MISSING FACE, not by missing pose.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_CAPTURE_DURATION_MS,
  CANONICAL_DURATION_MS,
  CANONICAL_SCRIPT,
  SESSION_SCRIPT_ID,
} from './canonical-script.mjs';
import { verify } from './verify-recording.mjs';

const METRICS = [
  'headTiltDeg',
  'shoulderTiltDeg',
  'headShoulderOffsetRatio',
  'shoulderWidthRatio',
  'earShoulderVerticalRatio',
];

const pose = (visibility = 0.9) => Array.from({ length: 33 }, () => [0.5, 0.5, 0, visibility]);
const iris = () => [[0.45, 0.3], [0.55, 0.3]];
const eye = () => Array.from({ length: 8 }, () => [0.45, 0.3]);
const matrix = () => Array.from({ length: 16 }, () => 0.1);

const isAbsent = (segment) => segment.expectedScreenFacing === 'not_in_frame';

function build({ script = CANONICAL_SCRIPT, frameFor, header: patch = {}, includeLeadIn = false } = {}) {
  const { meta: metaPatch = {}, ...headerPatch } = patch;
  const header = {
    meta: {
      schemaVersion: 6,
      scriptId: SESSION_SCRIPT_ID,
      sessionId: 's',
      participantId: 'p1',
      condition: 'A_frontal',
      camera: { heightM: 1.1, eyeHeightM: 1.2, distanceM: 0.6, azimuthDeg: 0, screenCentreDistanceM: 0 },
      screen: { widthM: 0.598, heightM: 0.336, centreHeightM: 0.99, distanceM: 0.6, awayMarkerOffsetM: 0.25 },
      video: { width: 1280, height: 720 },
      notes: '',
      ...metaPatch,
    },
    script: script.map((s) => ({ ...s })),
    compliance: script.map((s) => ({ segmentId: s.id, compliance: 'yes' })),
    profile: { metrics: Object.fromEntries(METRICS.map((m) => [m, { median: 1, scaledMad: 1 }])) },
    screenBaseline: { yawMedianDeg: -2.3, pitchMedianDeg: 3.1 },
    ...headerPatch,
  };

  const lines = [JSON.stringify(header)];

  for (let t = 0; t < 30_000; t += 500) {
    lines.push(JSON.stringify({ phase: 'calibration', t, seg: 'calibration', pose: pose(), iris: iris(), eye: eye(), m: matrix() }));
  }

  const end = script[script.length - 1].endMs;

  for (let t = 0; t < end; t += 33) {
    const segment = script.find((s) => t >= s.startMs && t < s.endMs);

    if (!includeLeadIn && t < segment.startMs + segment.leadInMs) {
      continue;
    }

    lines.push(JSON.stringify({ phase: 'session', t, seg: segment.id, ...frameFor(segment) }));
  }

  return lines.join('\n');
}

// A well-formed recording: everything present, and the 'absent' segment genuinely empty.
const present = () => ({ pose: pose(), iris: iris(), eye: eye(), m: matrix() });
const empty = () => ({ pose: null, iris: null, eye: null, m: null });

const valid = (segment) => (isAbsent(segment) ? empty() : present());

const failures = (text) => verify(text).problems;

describe('verify-recording', () => {
  it('freezes v8 at 20-second guidance and 268 seconds of held capture', () => {
    assert.equal(SESSION_SCRIPT_ID, 'haltung-session-v8');
    assert.equal(CANONICAL_DURATION_MS, 868_000);
    assert.equal(CANONICAL_CAPTURE_DURATION_MS, 268_000);
    assert.ok(CANONICAL_SCRIPT.every((segment) => segment.leadInMs === 20_000));
  });

  it('accepts a well-formed recording', () => {
    assert.deepEqual(failures(build({ frameFor: valid })), []);
  });

  it('rejects a posture segment with no iris (IPD impossible, so every metric is null)', () => {
    const problems = failures(
      build({ frameFor: (s) => (isAbsent(s) ? empty() : { ...present(), iris: null }) }),
    );
    assert.ok(problems.some((p) => p.includes("'baseline_1'") && p.includes('posture metrics')));
  });

  it('rejects a posture segment where every landmark visibility is below the gate', () => {
    const problems = failures(
      build({ frameFor: (s) => (isAbsent(s) ? empty() : { ...present(), pose: pose(0) }) }),
    );
    assert.ok(problems.some((p) => p.includes("'baseline_1'") && p.includes('posture metrics')));
  });

  it('rejects an attention segment with no face matrix (head pose is undecidable)', () => {
    const problems = failures(build({ frameFor: (s) => (isAbsent(s) ? empty() : { ...present(), m: null }) }));
    assert.ok(problems.some((p) => p.includes('face matrix')));
  });

  it('rejects an "absent" segment that still contains a face — pose absence is the WRONG signal', () => {
    const problems = failures(
      build({ frameFor: (s) => (isAbsent(s) ? { ...present(), pose: null } : present()) }),
    );
    assert.ok(problems.some((p) => p.includes("'absent'") && p.includes('still carry a face matrix')));
  });

  // --- schema v6: privacy and landmark shape -----------------------------------------------------
  // The iris signals need eye corners and lids. They cannot be recovered after the fact, so a
  // recording missing them is unusable for that analysis and must not pass as if it were complete.

  it('rejects a pre-v3 recording whose frames carry no eye landmarks', () => {
    const problems = failures(
      build({
        frameFor: (s) => {
          const frame = isAbsent(s) ? empty() : present();
          delete frame.eye;
          return frame;
        },
      }),
    );
    assert.ok(problems.some((p) => p.includes('pre-v3 recording')));
  });

  it('rejects the wrong eye landmark count — a recorder writing a different landmark set', () => {
    const problems = failures(
      build({ frameFor: (s) => (isAbsent(s) ? empty() : { ...present(), eye: [[0.45, 0.3]] }) }),
    );
    assert.ok(problems.some((p) => p.includes('eye is malformed')));
  });

  it('rejects wall-clock fields removed by privacy schema v6', () => {
    const problems = failures(build({ frameFor: valid, header: { meta: { startedAt: '2026-08-04' } } }));
    assert.ok(problems.some((p) => p.includes('wall-clock privacy')));
  });

  // --- condition-aware screen geometry ------------------------------------------------------------
  // Yaw requirements follow from the display's angular width. Missing or zero geometry means the
  // Step 9 analysis cannot be reproduced, and zero would silently divide.

  it('rejects a missing screen geometry block', () => {
    const text = build({ frameFor: valid });
    const lines = text.split('\n');
    const header = JSON.parse(lines[0]);
    delete header.meta.screen;
    lines[0] = JSON.stringify(header);
    assert.ok(failures(lines.join('\n')).some((p) => p.includes('screen.widthM')));
  });

  it('rejects a zero display width — "not measured" dressed up as a measurement', () => {
    const problems = failures(
      build({
        frameFor: valid,
        header: { meta: { screen: { widthM: 0, heightM: 0.336, centreHeightM: 0.99, distanceM: 0.6, awayMarkerOffsetM: 0.25 } } },
      }),
    );
    assert.ok(problems.some((p) => p.includes('screen.widthM') && p.includes('positive')));
  });

  it('accepts camera-to-screen distance zero for a frontal setup', () => {
    assert.deepEqual(failures(build({ frameFor: valid })), []);
  });

  it('rejects camera-to-screen distance zero for an off-axis setup', () => {
    const problems = failures(
      build({
        frameFor: valid,
        header: {
          meta: {
            condition: 'B_offaxis',
            camera: { heightM: 1.1, eyeHeightM: 1.2, distanceM: 0.6, azimuthDeg: 0, screenCentreDistanceM: 0 },
          },
        },
      }),
    );
    assert.ok(problems.some((p) => p.includes('condition B requires a positive')));
  });

  it('accepts an off-axis setup whose three distances derive a non-zero azimuth', () => {
    const problems = failures(
      build({
        frameFor: valid,
        header: {
          meta: {
            condition: 'B_offaxis',
            camera: { heightM: 1.1, eyeHeightM: 1.2, distanceM: 0.6, azimuthDeg: 30, screenCentreDistanceM: 0.31 },
          },
        },
      }),
    );
    assert.deepEqual(problems, []);
  });

  it('rejects a stored azimuth that disagrees with the three measured distances', () => {
    const problems = failures(
      build({
        frameFor: valid,
        header: {
          meta: {
            condition: 'B_offaxis',
            camera: { heightM: 1.1, eyeHeightM: 1.2, distanceM: 0.6, azimuthDeg: 12, screenCentreDistanceM: 0.31 },
          },
        },
      }),
    );
    assert.ok(problems.some((p) => p.includes('but the measured distances derive')));
  });

  it('rejects transition frames persisted during a lead-in', () => {
    const problems = failures(build({ frameFor: valid, includeLeadIn: true }));
    assert.ok(problems.some((p) => p.includes('lead-in frames must not be persisted')));
  });

  // --- v4 script: the away turns -----------------------------------------------------------------

  it('accepts an away turn that lost the face entirely — the pose exceeds the tracker, by design', () => {
    const isTurn = (segment) => segment.allowFaceLoss === true;
    const problems = failures(
      build({ frameFor: (s) => (isAbsent(s) || isTurn(s) ? empty() : present()) }),
    );
    assert.deepEqual(problems, []);
  });

  it('still rejects a face-less "phone_down" segment — allowFaceLoss is per-segment, not global', () => {
    const problems = failures(
      build({ frameFor: (s) => (isAbsent(s) ? empty() : s.id === 'phone_down' ? { ...present(), m: null } : present()) }),
    );
    assert.ok(problems.some((p) => p.includes("'phone_down'") && p.includes('face matrix')));
  });

  it('rejects a recording that declares its own short script — a file must not certify itself', () => {
    const tiny = [{ id: 'baseline_1', instruction: 'wrong', startMs: 0, endMs: 3000, leadInMs: 2000, expectedPosture: 'within_range', expectedScreenFacing: 'within_screen_band' }];
    const problems = failures(build({ script: tiny, frameFor: valid }));
    assert.ok(problems.some((p) => p.includes('script has 1 segments')));
  });

  it('rejects changed spoken instruction text', () => {
    const text = build({ frameFor: valid });
    const lines = text.split('\n');
    const header = JSON.parse(lines[0]);
    header.script[0].instruction = 'Do something else.';
    lines[0] = JSON.stringify(header);
    assert.ok(failures(lines.join('\n')).some((p) => p.includes("field 'instruction'")));
  });

  it('rejects an illegal compliance value', () => {
    const text = build({ frameFor: valid });
    const lines = text.split('\n');
    const header = JSON.parse(lines[0]);
    header.compliance = CANONICAL_SCRIPT.map((s) => ({ segmentId: s.id, compliance: 'bogus' }));
    lines[0] = JSON.stringify(header);
    assert.ok(failures(lines.join('\n')).some((p) => p.includes("compliance 'bogus'")));
  });

  it('rejects a missing compliance judgement', () => {
    const text = build({ frameFor: valid });
    const lines = text.split('\n');
    const header = JSON.parse(lines[0]);
    header.compliance = [];
    lines[0] = JSON.stringify(header);
    assert.ok(failures(lines.join('\n')).some((p) => p.includes('no compliance judgement')));
  });

  it('rejects a recording with no capture resolution', () => {
    const text = build({ frameFor: valid });
    const lines = text.split('\n');
    const header = JSON.parse(lines[0]);
    delete header.meta.video;
    lines[0] = JSON.stringify(header);
    assert.ok(failures(lines.join('\n')).some((p) => p.includes('video dimensions')));
  });

  it('rejects a wrong schema version', () => {
    const problems = failures(build({ frameFor: valid, header: { meta: { schemaVersion: 1 } } }));
    assert.ok(problems.some((p) => p.includes('schemaVersion')));
  });
});
