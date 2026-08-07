// Schema-freeze checkpoint. Run against every recording BEFORE trusting it:
//   node eval/verify-recording.mjs path/to/recording.jsonl
//
// This FAILS CLOSED, and it checks VALIDITY, not PRESENCE.
//
// The distinction is the whole point. An earlier version checked whether a frame contained pose
// landmarks. But the classifiers need more than that:
//   - posture   needs pose AND iris (for the IPD) AND ear/shoulder visibility >= 0.5
//   - attention needs the face TRANSFORM MATRIX; pose is irrelevant to it
//   - not_in_frame is decided by a MISSING FACE, not by missing pose
// So a recording could have 100% pose and 0% iris — every posture metric null — and still be
// certified. A verifier that can pass unusable data is worse than none: it manufactures confidence.
//
// It also does NOT trust the script embedded in the recording (see canonical-script.mjs).

import { readFileSync } from 'node:fs';

import {
  CANONICAL_DURATION_MS,
  CANONICAL_CAPTURE_DURATION_MS,
  CANONICAL_SCRIPT,
  COMPLIANCE_VALUES,
  SESSION_SCRIPT_ID,
  isScored,
} from './canonical-script.mjs';

export const EXPECTED_SCHEMA_VERSION = 6;
export const MIN_FPS = 20; // below this, frames were dropped
export const MIN_COVERAGE = 0.8; // valid frames required in a scored segment
export const MAX_ABSENT_FACE_COVERAGE = 0.2; // 'absent' must really be absent
export const MIN_CALIBRATION_SAMPLES = 30; // mirrors calibration-profile.ts
export const MIN_BASELINE_SAMPLES = 30; // mirrors attention-baseline.ts
const POSE_LANDMARKS = 33;
const MATRIX_LENGTH = 16;
// Mirrors EYE_LANDMARK_INDICES in classifier/iris-gaze.ts: 4 landmarks per eye (2 corners, 2 lids).
// Only the COUNT is checked here — the order is frozen by the recorder and cannot be verified from
// the file, so it is documented in models/recording.ts instead of asserted.
const EYE_LANDMARKS = 8;

// Mirrors posture-metrics.ts exactly. If that file changes, this must change with it.
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const VISIBILITY = 3;
const MIN_VISIBILITY = 0.5;

const PROFILE_METRICS = [
  'headTiltDeg',
  'shoulderTiltDeg',
  'headShoulderOffsetRatio',
  'shoulderWidthRatio',
  'earShoulderVerticalRatio',
];

// --- validity predicates: what each classifier ACTUALLY requires -------------------------------

// posture-metrics.ts returns null unless all of this holds.
export function posturePossible(frame) {
  if (!frame.pose || !frame.iris || frame.pose.length !== POSE_LANDMARKS) {
    return false;
  }

  for (const index of [LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER]) {
    if (!(frame.pose[index]?.[VISIBILITY] >= MIN_VISIBILITY)) {
      return false;
    }
  }

  // IPD > 0: the two iris points must not coincide.
  const [a, b] = frame.iris;
  return a[0] !== b[0] || a[1] !== b[1];
}

// head-pose.ts returns null without the matrix; attention is then not_in_frame regardless of pose.
export function attentionPossible(frame) {
  return Array.isArray(frame.m) && frame.m.length === MATRIX_LENGTH;
}

// Mirrors the law-of-cosines derivation used by /posture and /record. Distances determine the
// unsigned azimuth magnitude; the study condition supplies whether that magnitude should be frontal
// or off-axis. A zero camera-to-screen side is the valid degenerate frontal triangle.
export function deriveAzimuthDeg(eyeToCameraM, eyeToScreenM, cameraToScreenM) {
  if (
    !Number.isFinite(eyeToCameraM) ||
    eyeToCameraM <= 0 ||
    !Number.isFinite(eyeToScreenM) ||
    eyeToScreenM <= 0 ||
    !Number.isFinite(cameraToScreenM) ||
    cameraToScreenM < 0
  ) {
    return null;
  }

  const cosAzimuth =
    (eyeToCameraM ** 2 + eyeToScreenM ** 2 - cameraToScreenM ** 2) /
    (2 * eyeToCameraM * eyeToScreenM);
  const epsilon = 0.02;

  if (cosAzimuth < -1 - epsilon || cosAzimuth > 1 + epsilon) {
    return null;
  }

  return Math.acos(Math.min(1, Math.max(-1, cosAzimuth))) * (180 / Math.PI);
}

// --- verification -------------------------------------------------------------------------------

export function verify(text) {
  const problems = [];
  const check = (ok, message) => {
    if (!ok) {
      problems.push(message);
    }
  };

  const lines = text.trim().split('\n');
  const header = JSON.parse(lines[0]);
  const frames = lines.slice(1).map((line) => JSON.parse(line));

  const meta = header.meta ?? {};
  const video = meta.video ?? {};

  // ---- header
  check(meta.schemaVersion === EXPECTED_SCHEMA_VERSION, `schemaVersion is ${meta.schemaVersion}, expected ${EXPECTED_SCHEMA_VERSION}`);
  check(typeof meta.participantId === 'string' && meta.participantId.length > 0, 'participantId is empty');
  check(meta.condition === 'A_frontal' || meta.condition === 'B_offaxis', `condition is '${meta.condition}'`);
  check(meta.scriptId === SESSION_SCRIPT_ID, `scriptId is '${meta.scriptId}', expected '${SESSION_SCRIPT_ID}'`);
  check(
    Number.isFinite(video.width) && video.width > 0 && Number.isFinite(video.height) && video.height > 0,
    'video dimensions are missing or invalid — the recording cannot be replayed',
  );

  for (const field of ['heightM', 'eyeHeightM', 'distanceM', 'azimuthDeg']) {
    check(Number.isFinite(meta.camera?.[field]), `camera.${field} is missing or not a number`);
  }

  // Camera->display-centre distance (schema v4). Zero is valid in condition A when the camera sits
  // at the display centre. Condition B needs a positive third side and a genuinely off-axis derived
  // angle. This is condition-aware by design: treating zero as universally missing rejected a real
  // frontal setup in the v7 pilot.
  check(
    Number.isFinite(meta.camera?.screenCentreDistanceM) && meta.camera.screenCentreDistanceM >= 0,
    'camera.screenCentreDistanceM is missing, not a number, or negative',
  );

  const derivedAzimuthDeg = deriveAzimuthDeg(
    meta.camera?.distanceM,
    meta.screen?.distanceM,
    meta.camera?.screenCentreDistanceM,
  );
  check(derivedAzimuthDeg !== null, 'the three camera/screen distances cannot form a valid triangle');

  if (derivedAzimuthDeg !== null && Number.isFinite(meta.camera?.azimuthDeg)) {
    check(
      Math.abs(Math.abs(meta.camera.azimuthDeg) - derivedAzimuthDeg) <= 1,
      `camera.azimuthDeg is ${meta.camera.azimuthDeg.toFixed(1)}° but the measured distances derive ${derivedAzimuthDeg.toFixed(1)}°`,
    );
  }

  if (derivedAzimuthDeg !== null && meta.condition === 'A_frontal') {
    check(
      derivedAzimuthDeg <= 5,
      `condition A is frontal but the measured distances derive ${derivedAzimuthDeg.toFixed(1)}° azimuth`,
    );
  }

  if (meta.condition === 'B_offaxis') {
    check(
      meta.camera?.screenCentreDistanceM > 0,
      'condition B requires a positive camera.screenCentreDistanceM',
    );

    if (derivedAzimuthDeg !== null) {
      check(
        derivedAzimuthDeg > 5,
        `condition B is off-axis but the measured distances derive only ${derivedAzimuthDeg.toFixed(1)}° azimuth`,
      );
    }
  }

  // Screen geometry (schema v3). These must be POSITIVE, not merely finite: a zero display width or
  // distance silently means "not measured", and the required-yaw analysis would then divide by it.
  for (const field of ['widthM', 'heightM', 'centreHeightM', 'distanceM', 'awayMarkerOffsetM']) {
    check(
      Number.isFinite(meta.screen?.[field]) && meta.screen[field] > 0,
      `screen.${field} is missing, not a number, or not positive — the required head yaw cannot be computed`,
    );
  }

  // ---- the script must be the CANONICAL one, not whatever the file claims
  const script = header.script ?? [];
  check(script.length === CANONICAL_SCRIPT.length, `script has ${script.length} segments, expected ${CANONICAL_SCRIPT.length}`);

  for (const [index, expected] of CANONICAL_SCRIPT.entries()) {
    const actual = script[index];

    if (!actual) {
      check(false, `script is missing segment '${expected.id}'`);
      continue;
    }

    for (const field of ['id', 'instruction', 'startMs', 'endMs', 'leadInMs', 'expectedPosture', 'expectedScreenFacing', 'allowFaceLoss']) {
      check(
        actual[field] === expected[field],
        `script segment ${index} field '${field}' is ${JSON.stringify(actual[field])}, expected ${JSON.stringify(expected[field])}`,
      );
    }
  }

  // ---- profile
  check(header.profile != null, 'calibration profile is missing');
  check(header.screenBaseline != null, 'screen baseline is missing');
  check(meta.startedAt === undefined, 'meta.startedAt must not be exported (wall-clock privacy)');
  check(header.profile?.createdAt === undefined, 'profile.createdAt must not be exported (wall-clock privacy)');
  check(
    header.screenBaseline?.createdAt === undefined,
    'screenBaseline.createdAt must not be exported (wall-clock privacy)',
  );

  if (header.profile) {
    for (const name of PROFILE_METRICS) {
      const baseline = header.profile.metrics?.[name];

      if (!baseline || !Number.isFinite(baseline.median) || !Number.isFinite(baseline.scaledMad)) {
        check(false, `profile metric '${name}' is missing or not finite`);
        continue;
      }

      check(baseline.scaledMad > 0, `profile metric '${name}' has a non-positive scaledMad`);
    }
  }

  if (header.screenBaseline) {
    for (const field of ['yawMedianDeg', 'pitchMedianDeg']) {
      check(Number.isFinite(header.screenBaseline[field]), `screenBaseline.${field} is missing or not finite`);
    }
  }

  // ---- compliance: a judgement for every segment, and a LEGAL one
  const complianceById = new Map((header.compliance ?? []).map((c) => [c.segmentId, c.compliance]));

  for (const segment of CANONICAL_SCRIPT) {
    const value = complianceById.get(segment.id);
    check(value !== undefined, `segment '${segment.id}' has no compliance judgement`);
    check(
      value === undefined || COMPLIANCE_VALUES.includes(value),
      `segment '${segment.id}' has compliance '${value}', expected one of ${COMPLIANCE_VALUES.join(' | ')}`,
    );
  }

  // ---- frame shape and phases
  const knownSegments = new Set(CANONICAL_SCRIPT.map((s) => s.id));
  const shapeProblems = new Set();

  for (const frame of frames) {
    if (frame.phase !== 'calibration' && frame.phase !== 'session') {
      shapeProblems.add(`unknown frame phase '${frame.phase}'`);
    }

    if (frame.phase === 'session' && !knownSegments.has(frame.seg)) {
      shapeProblems.add(`unknown segment id '${frame.seg}' in a session frame`);
    }

    if (frame.pose !== null) {
      if (frame.pose.length !== POSE_LANDMARKS) {
        shapeProblems.add(`pose has ${frame.pose.length} landmarks, expected ${POSE_LANDMARKS}`);
      } else if (frame.pose.some((l) => l.length !== 4 || !l.every(Number.isFinite))) {
        shapeProblems.add('a pose landmark is malformed or non-finite');
      }
    }

    if (frame.iris !== null && (frame.iris.length !== 2 || !frame.iris.every((p) => p.length === 2 && p.every(Number.isFinite)))) {
      shapeProblems.add('iris is malformed or non-finite');
    }

    // `eye` is undefined in schema v2 files and null when no face was found. Both are distinguished
    // from a MALFORMED array, which would mean the recorder wrote the wrong landmark set.
    if (frame.eye === undefined) {
      shapeProblems.add('frames carry no `eye` field — this is a pre-v3 recording');
    } else if (
      frame.eye !== null &&
      (frame.eye.length !== EYE_LANDMARKS || !frame.eye.every((p) => p.length === 2 && p.every(Number.isFinite)))
    ) {
      shapeProblems.add(`eye is malformed or non-finite (expected ${EYE_LANDMARKS} landmarks)`);
    }

    if (frame.m !== null && (frame.m.length !== MATRIX_LENGTH || !frame.m.every(Number.isFinite))) {
      shapeProblems.add('face matrix is malformed or non-finite');
    }
  }

  for (const problem of shapeProblems) {
    check(false, problem);
  }

  // ---- calibration: enough VALID samples for each baseline
  const calibration = frames.filter((f) => f.phase === 'calibration');
  const calibrationPosture = calibration.filter(posturePossible).length;
  const calibrationAttention = calibration.filter(attentionPossible).length;

  check(
    calibrationPosture >= MIN_CALIBRATION_SAMPLES,
    `only ${calibrationPosture} calibration frames can produce posture metrics, need >= ${MIN_CALIBRATION_SAMPLES} — the profile cannot be rebuilt`,
  );
  check(
    calibrationAttention >= MIN_BASELINE_SAMPLES,
    `only ${calibrationAttention} calibration frames carry a face matrix, need >= ${MIN_BASELINE_SAMPLES} — the screen baseline cannot be rebuilt`,
  );

  // ---- session
  const session = frames.filter((f) => f.phase === 'session');
  const duration = session.length ? session[session.length - 1].t : 0;
  // Session timestamps span the full protocol, but lead-in frames are deliberately not persisted.
  // Dividing by 616 s would therefore call healthy 30 FPS capture "dropped". The denominator is the
  // sum of the canonical held-capture windows only.
  const fps = CANONICAL_CAPTURE_DURATION_MS > 0
    ? (session.length * 1000) / CANONICAL_CAPTURE_DURATION_MS
    : 0;

  check(session.length > 0, 'no session frames recorded');
  check(fps >= MIN_FPS, `effective fps is ${fps.toFixed(1)}, below ${MIN_FPS} — frames were dropped`);
  check(
    duration >= CANONICAL_DURATION_MS - 1000,
    `session ended at ${(duration / 1000).toFixed(1)}s but the canonical script runs to ${CANONICAL_DURATION_MS / 1000}s — cut short`,
  );

  let previous = -1;

  for (const frame of session) {
    if (!Number.isFinite(frame.t) || frame.t < previous) {
      check(false, 'session timestamps are not monotonically increasing');
      break;
    }
    previous = frame.t;
  }

  // ---- per-segment coverage, checked against what each classifier ACTUALLY needs
  const rows = [];

  for (const segment of CANONICAL_SCRIPT) {
    const inSegment = session.filter((f) => f.seg === segment.id);

    // The recorder persists only held-capture frames. Retain the explicit predicate as a fail-closed
    // defence against an older or modified recorder that leaked transition movement into the file.
    const scored = inSegment.filter((f) => isScored(f, segment));
    const n = scored.length;
    const postureOk = scored.filter(posturePossible).length;
    const attentionOk = scored.filter(attentionPossible).length;
    const posturePct = n ? postureOk / n : 0;
    const attentionPct = n ? attentionOk / n : 0;

    rows.push({ segment, n, all: inSegment.length, posturePct, attentionPct, compliance: complianceById.get(segment.id) ?? '—' });

    check(n > 0, `segment '${segment.id}' has no scored frames — it cannot be scored`);

    const outsideCapture = inSegment.filter((f) => !isScored(f, segment)).length;
    check(
      outsideCapture === 0,
      `segment '${segment.id}' has ${outsideCapture} frames outside its held-capture window (lead-in frames must not be persisted)`,
    );

    // Posture is only scored where the script instructed a posture.
    if (segment.expectedPosture !== null) {
      check(
        posturePct >= MIN_COVERAGE,
        `segment '${segment.id}' expects posture '${segment.expectedPosture}' but only ${Math.round(100 * posturePct)}% of frames can produce posture metrics (need >= ${100 * MIN_COVERAGE}%; pose+iris+visibility>=0.5 are all required)`,
      );
    }

    if (segment.expectedScreenFacing === 'not_in_frame') {
      // Decided by a MISSING FACE, not by missing pose. A frame with no pose but a full face
      // matrix would be classified focused/away — the opposite of what this segment expects.
      check(
        attentionPct <= MAX_ABSENT_FACE_COVERAGE,
        `segment '${segment.id}' expects an empty frame but ${Math.round(100 * attentionPct)}% of frames still carry a face matrix (need <= ${100 * MAX_ABSENT_FACE_COVERAGE}%)`,
      );
    } else if (segment.expectedScreenFacing !== null && !segment.allowFaceLoss) {
      check(
        attentionPct >= MIN_COVERAGE,
        `segment '${segment.id}' expects attention '${segment.expectedScreenFacing}' but only ${Math.round(100 * attentionPct)}% of frames carry a face matrix (need >= ${100 * MIN_COVERAGE}%)`,
      );
    }
    // allowFaceLoss segments (the away turns) are deliberately NOT checked for face coverage: past
    // |yaw| 54 deg the tracker drops the face, and off-axis the far-side turn exceeds that by doing
    // exactly what it was instructed to do. The percentage is still printed per segment, and low
    // coverage there is a result to report, not a reason to discard the recording.
  }

  return {
    header,
    problems,
    rows,
    calibration: { posture: calibrationPosture, attention: calibrationAttention },
    session: { frames: session.length, duration, fps, derivedAzimuthDeg },
  };
}

// --- CLI -----------------------------------------------------------------------------------------

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());

if (invokedDirectly) {
  const path = process.argv[2];

  if (!path) {
    console.error('usage: node eval/verify-recording.mjs <recording.jsonl>');
    process.exit(2);
  }

  const result = verify(readFileSync(path, 'utf8'));
  const { header, problems, rows, calibration, session } = result;
  const meta = header.meta ?? {};

  console.log('--- header ---');
  console.log('schemaVersion  ', meta.schemaVersion);
  console.log('participant    ', meta.participantId);
  console.log('condition      ', meta.condition);
  console.log('camera         ', JSON.stringify(meta.camera));
  console.log('screen         ', JSON.stringify(meta.screen));
  console.log('video          ', `${meta.video?.width}x${meta.video?.height}`);
  console.log('notes          ', meta.notes || '(none)');
  console.log('screenBaseline ', header.screenBaseline ? JSON.stringify(header.screenBaseline) : 'MISSING');

  if (header.profile) {
    console.log('profile scaledMad (measured jitter — use this to ground MIN_SCALED_MAD):');

    for (const [name, baseline] of Object.entries(header.profile.metrics ?? {})) {
      if (Number.isFinite(baseline?.median)) {
        console.log(`  ${name.padEnd(26)} median ${baseline.median.toFixed(4).padStart(9)}   scaledMad ${baseline.scaledMad.toFixed(4)}`);
      }
    }
  }

  console.log('\n--- calibration ---');
  console.log('posture-capable frames  ', calibration.posture);
  console.log('face-matrix frames      ', calibration.attention);

  console.log('\n--- session ---');
  console.log('frames         ', session.frames);
  console.log('duration       ', (session.duration / 1000).toFixed(1), 's');
  console.log('effective fps  ', session.fps.toFixed(1));
  console.log('derived azimuth', session.derivedAzimuthDeg === null ? 'INVALID' : `${session.derivedAzimuthDeg.toFixed(1)} deg`);

  console.log('\n--- segments (held-capture frames only) ---');
  console.log('id             scored   /all   posture   attention   complied');

  for (const row of rows) {
    console.log(
      row.segment.id.padEnd(15) +
        String(row.n).padStart(6) +
        String(row.all).padStart(7) +
        `${Math.round(100 * row.posturePct)}%`.padStart(10) +
        `${Math.round(100 * row.attentionPct)}%`.padStart(12) +
        `   ${row.compliance}`,
    );
  }

  console.log('');

  if (problems.length > 0) {
    console.error(`FAILED (${problems.length}):`);

    for (const problem of problems) {
      console.error('  -', problem);
    }

    process.exit(1);
  }

  console.log('OK — this recording can be analysed.');

  const flagged = (header.compliance ?? []).filter((c) => c.compliance !== 'yes');

  if (flagged.length > 0) {
    console.log(
      `NOTE: ${flagged.length} segment(s) marked non-compliant (${flagged.map((c) => `${c.segmentId}=${c.compliance}`).join(', ')}). ` +
        `Valid data — but decide, BEFORE analysis, whether they are scored or excluded.`,
    );
  }
}
