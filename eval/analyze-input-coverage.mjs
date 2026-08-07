#!/usr/bin/env node

// Separate Pose, visibility, iris/IPD, face-matrix, and complete runtime-posture availability.
// This script reads frozen JSONL recordings and writes only derived Step 01 evidence.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_CAPTURE_DURATION_MS,
  CANONICAL_SCRIPT,
  SESSION_SCRIPT_ID,
  isScored,
} from './canonical-script.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_MANIFEST = resolve(REPOSITORY_ROOT, 'eval/evaluation-manifest.json');
const DEFAULT_CHECKSUMS = resolve(
  REPOSITORY_ROOT,
  'eval/results/00-dataset-freeze/file-checksums.txt',
);
const DEFAULT_OUTPUT = resolve(
  REPOSITORY_ROOT,
  'eval/results/01-data-quality',
);

const EXPECTED_SCHEMA_VERSION = 6;
const POSE_LANDMARK_COUNT = 33;
const FACE_MATRIX_LENGTH = 16;
const REQUIRED_POSE_INDICES = [7, 8, 11, 12];
const VISIBILITY_INDEX = 3;
const MIN_VISIBILITY = 0.5;

function parseArguments() {
  const args = process.argv.slice(2);
  let manifest = DEFAULT_MANIFEST;
  let checksums = DEFAULT_CHECKSUMS;
  let output = DEFAULT_OUTPUT;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === '--manifest' && value) {
      manifest = resolve(process.cwd(), value);
    } else if (args[index] === '--checksums' && value) {
      checksums = resolve(process.cwd(), value);
    } else if (args[index] === '--output' && value) {
      output = resolve(process.cwd(), value);
    } else {
      throw new Error(`unknown or incomplete argument: ${args[index]}`);
    }
    index += 1;
  }

  return { manifest, checksums, output };
}

function repositoryPath(path) {
  return relative(REPOSITORY_ROOT, path).split('\\').join('/');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function finitePointArray(value, pointCount, pointLength) {
  return (
    Array.isArray(value) &&
    value.length === pointCount &&
    value.every((point) => finiteVector(point, pointLength))
  );
}

export function poseAvailable(frame) {
  return finitePointArray(frame.pose, POSE_LANDMARK_COUNT, 4);
}

function requiredPoseVisibilities(frame) {
  if (!poseAvailable(frame)) {
    return null;
  }
  const values = REQUIRED_POSE_INDICES.map((index) => frame.pose[index]?.[VISIBILITY_INDEX]);
  return values.every(Number.isFinite) ? values : null;
}

export function poseVisibilityPass(frame) {
  const values = requiredPoseVisibilities(frame);
  return values !== null && values.every((value) => value >= MIN_VISIBILITY);
}

export function irisIpdAvailable(frame) {
  if (!finitePointArray(frame.iris, 2, 2)) {
    return false;
  }
  const [a, b] = frame.iris;
  return a[0] !== b[0] || a[1] !== b[1];
}

export function faceMatrixAvailable(frame) {
  return finiteVector(frame.m, FACE_MATRIX_LENGTH);
}

export function fullPostureAvailable(frame) {
  return poseAvailable(frame) && poseVisibilityPass(frame) && irisIpdAvailable(frame);
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number(((100 * numerator) / denominator).toFixed(6)) : 0;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function summarizeFrames(frames) {
  const heldFrames = frames.length;
  const poseAvailableFrames = frames.filter(poseAvailable).length;
  const poseVisibilityPassFrames = frames.filter(poseVisibilityPass).length;
  const irisIpdAvailableFrames = frames.filter(irisIpdAvailable).length;
  const faceMatrixAvailableFrames = frames.filter(faceMatrixAvailable).length;
  const fullPostureAvailableFrames = frames.filter(fullPostureAvailable).length;
  const visibilityValues = frames.flatMap((frame) => requiredPoseVisibilities(frame) ?? []);

  return {
    heldFrames,
    poseAvailableFrames,
    poseAvailablePct: percent(poseAvailableFrames, heldFrames),
    poseVisibilityPassFrames,
    poseVisibilityPassPct: percent(poseVisibilityPassFrames, heldFrames),
    poseVisibilityPassGivenPosePct:
      poseAvailableFrames > 0 ? percent(poseVisibilityPassFrames, poseAvailableFrames) : null,
    irisIpdAvailableFrames,
    irisIpdAvailablePct: percent(irisIpdAvailableFrames, heldFrames),
    faceMatrixAvailableFrames,
    faceMatrixAvailablePct: percent(faceMatrixAvailableFrames, heldFrames),
    fullPostureAvailableFrames,
    fullPostureAvailablePct: percent(fullPostureAvailableFrames, heldFrames),
    minimumRequiredPoseVisibility:
      visibilityValues.length > 0 ? Number(Math.min(...visibilityValues).toFixed(6)) : null,
    medianRequiredPoseVisibility:
      visibilityValues.length > 0 ? Number(median(visibilityValues).toFixed(6)) : null,
  };
}

function csvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path, rows) {
  if (rows.length === 0) {
    throw new Error(`refusing to write empty CSV: ${path}`);
  }
  const fields = Object.keys(rows[0]);
  const lines = [fields.map(csvValue).join(',')];
  for (const row of rows) {
    lines.push(fields.map((field) => csvValue(row[field])).join(','));
  }
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function loadChecksums(path) {
  const checksums = new Map();
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) {
      throw new Error(`malformed checksum line: ${line}`);
    }
    checksums.set(match[2], match[1]);
  }
  return checksums;
}

export function loadManifest(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const primarySessions = raw.primarySessions ?? [];
  const heldOutSessions = raw.heldOutSessions ?? [];
  const groups = [
    ['primary', primarySessions],
    ['held_out', heldOutSessions],
  ];
  const entries = groups.flatMap(([group, sessions]) =>
    sessions.map((session) => ({ ...session, group })),
  );
  if (primarySessions.length !== 8 || heldOutSessions.length !== 2) {
    throw new Error('expected the frozen eight primary and two held-out sessions');
  }
  const identities = (sessions) =>
    new Set(sessions.map((session) => `${session.participantId}\u0000${session.condition}`));
  const expectedPrimary = new Set(
    ['P1', 'P2', 'P3', 'P4'].flatMap((participantId) =>
      ['A_frontal', 'B_offaxis'].map((condition) => `${participantId}\u0000${condition}`),
    ),
  );
  const expectedHeldOut = new Set(
    ['A_frontal', 'B_offaxis'].map((condition) => `Author\u0000${condition}`),
  );
  const sameSet = (actual, expected) =>
    actual.size === expected.size && [...expected].every((value) => actual.has(value));
  if (
    !sameSet(identities(primarySessions), expectedPrimary) ||
    !sameSet(identities(heldOutSessions), expectedHeldOut)
  ) {
    throw new Error('manifest must contain P1–P4 in primary and Author only in held-out');
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error('manifest repeats a recording path');
  }
  return entries;
}

function readRecording(entry, checksums) {
  const path = resolve(REPOSITORY_ROOT, entry.path);
  const text = readFileSync(path, 'utf8');
  if (checksums.get(entry.path) !== sha256(text)) {
    throw new Error(`${entry.path}: content no longer matches the Step 00 checksum`);
  }
  const lines = text.trim().split('\n');
  const header = JSON.parse(lines[0]);
  const frames = lines.slice(1).map((line) => JSON.parse(line));
  const meta = header.meta ?? {};
  const sourceAlias = String(meta.participantId ?? '').replace(/\s*\([^)]*\)\s*$/, '');
  if (sourceAlias !== entry.participantId || meta.condition !== entry.condition) {
    throw new Error(`${entry.path}: manifest identity does not match the recording header`);
  }
  if (meta.schemaVersion !== EXPECTED_SCHEMA_VERSION || meta.scriptId !== SESSION_SCRIPT_ID) {
    throw new Error(`${entry.path}: recording is not schema 6 / ${SESSION_SCRIPT_ID}`);
  }
  return { header, frames };
}

function complianceMap(header) {
  return new Map((header.compliance ?? []).map((row) => [row.segmentId, row.compliance]));
}

function ordinaryPresenceSegment(segment) {
  return segment.allowFaceLoss !== true && segment.expectedScreenFacing !== 'not_in_frame';
}

function lossInterpretation(segment) {
  if (segment.expectedScreenFacing === 'not_in_frame') {
    return 'expected_absence';
  }
  if (segment.id === 'face_lost') {
    return 'diagnostic_face_loss';
  }
  if (segment.allowFaceLoss === true) {
    return 'permitted_face_loss';
  }
  return 'ordinary';
}

function segmentRows(entry, recording) {
  const compliance = complianceMap(recording.header);
  const azimuthDeg = Number(recording.header.meta.camera.azimuthDeg);
  return CANONICAL_SCRIPT.map((segment, segmentIndex) => {
    const frames = recording.frames.filter(
      (frame) => frame.phase === 'session' && frame.seg === segment.id && isScored(frame, segment),
    );
    return {
      group: entry.group,
      participantId: entry.participantId,
      condition: entry.condition,
      azimuthDeg,
      segmentIndex: segmentIndex + 1,
      segmentId: segment.id,
      expectedPosture: segment.expectedPosture,
      expectedScreenFacing: segment.expectedScreenFacing,
      allowFaceLoss: segment.allowFaceLoss === true,
      expectedPersonAbsence: segment.expectedScreenFacing === 'not_in_frame',
      ordinaryPresenceSegment: ordinaryPresenceSegment(segment),
      lossInterpretation: lossInterpretation(segment),
      compliance: compliance.get(segment.id),
      ...summarizeFrames(frames),
    };
  });
}

function prefixedFrameSummary(prefix, summary) {
  return {
    [`${prefix}Frames`]: summary.heldFrames,
    [`${prefix}PoseAvailableFrames`]: summary.poseAvailableFrames,
    [`${prefix}PoseAvailablePct`]: summary.poseAvailablePct,
    [`${prefix}PoseVisibilityPassFrames`]: summary.poseVisibilityPassFrames,
    [`${prefix}PoseVisibilityPassPct`]: summary.poseVisibilityPassPct,
    [`${prefix}PoseVisibilityPassGivenPosePct`]: summary.poseVisibilityPassGivenPosePct,
    [`${prefix}IrisIpdAvailableFrames`]: summary.irisIpdAvailableFrames,
    [`${prefix}IrisIpdAvailablePct`]: summary.irisIpdAvailablePct,
    [`${prefix}FaceMatrixAvailableFrames`]: summary.faceMatrixAvailableFrames,
    [`${prefix}FaceMatrixAvailablePct`]: summary.faceMatrixAvailablePct,
    [`${prefix}FullPostureAvailableFrames`]: summary.fullPostureAvailableFrames,
    [`${prefix}FullPostureAvailablePct`]: summary.fullPostureAvailablePct,
  };
}

function sessionResult(entry, recording, rows) {
  const ordinaryRows = rows.filter(
    (row) => row.ordinaryPresenceSegment && row.compliance === 'yes',
  );
  const calibrationFrames = recording.frames.filter((frame) => frame.phase === 'calibration');
  const totalHeldFrames = rows.reduce((total, row) => total + row.heldFrames, 0);
  const average = (field) =>
    Number(
      (
        ordinaryRows.reduce((total, row) => total + Number(row[field]), 0) /
        ordinaryRows.length
      ).toFixed(6),
    );
  return {
    group: entry.group,
    participantId: entry.participantId,
    condition: entry.condition,
    azimuthDeg: Number(recording.header.meta.camera.azimuthDeg),
    totalHeldFrames,
    effectiveFps: Number(
      ((totalHeldFrames * 1000) / CANONICAL_CAPTURE_DURATION_MS).toFixed(6),
    ),
    ordinaryEligibleSegments: ordinaryRows.length,
    ordinaryHeldFrames: ordinaryRows.reduce((total, row) => total + row.heldFrames, 0),
    ordinaryPoseAvailableMeanPct: average('poseAvailablePct'),
    ordinaryPoseVisibilityPassMeanPct: average('poseVisibilityPassPct'),
    ordinaryIrisIpdAvailableMeanPct: average('irisIpdAvailablePct'),
    ordinaryFaceMatrixAvailableMeanPct: average('faceMatrixAvailablePct'),
    ordinaryFullPostureAvailableMeanPct: average('fullPostureAvailablePct'),
    ...prefixedFrameSummary('calibration', summarizeFrames(calibrationFrames)),
  };
}

const COVERAGE_MEASURES = [
  ['PoseAvailable', 'poseAvailablePct', 'Pose array'],
  ['PoseVisibilityPass', 'poseVisibilityPassPct', 'Visibility gate'],
  ['IrisIpdAvailable', 'irisIpdAvailablePct', 'Face/iris (IPD)'],
  ['FaceMatrixAvailable', 'faceMatrixAvailablePct', 'Head matrix'],
  ['FullPostureAvailable', 'fullPostureAvailablePct', 'Full posture'],
];

function primarySegmentResults(segmentRows) {
  const output = [];
  for (const condition of ['A_frontal', 'B_offaxis']) {
    for (const segment of CANONICAL_SCRIPT) {
      const rows = segmentRows.filter(
        (row) =>
          row.group === 'primary' &&
          row.condition === condition &&
          row.segmentId === segment.id &&
          row.compliance === 'yes',
      );
      const result = {
        group: 'primary',
        condition,
        segmentIndex: CANONICAL_SCRIPT.indexOf(segment) + 1,
        segmentId: segment.id,
        expectedPosture: segment.expectedPosture,
        expectedScreenFacing: segment.expectedScreenFacing,
        lossInterpretation: lossInterpretation(segment),
        participantCount: rows.length,
      };
      for (const [prefix, field] of COVERAGE_MEASURES) {
        const values = rows.map((row) => Number(row[field]));
        result[`${prefix}MedianPct`] = Number(median(values).toFixed(6));
        result[`${prefix}MinPct`] = Number(Math.min(...values).toFixed(6));
        result[`${prefix}MaxPct`] = Number(Math.max(...values).toFixed(6));
      }
      output.push(result);
    }
  }
  return output;
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function interpolateColor(left, right, amount) {
  const parse = (color) => [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const start = parse(left);
  const end = parse(right);
  const channels = start.map((value, index) => Math.round(value + (end[index] - value) * amount));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function coverageColor(value) {
  const stops = [
    [0, '#b2182b'],
    [50, '#efb366'],
    [80, '#f3e6a2'],
    [100, '#1a9850'],
  ];
  for (let index = 1; index < stops.length; index += 1) {
    if (value <= stops[index][0]) {
      const [leftValue, leftColor] = stops[index - 1];
      const [rightValue, rightColor] = stops[index];
      return interpolateColor(leftColor, rightColor, (value - leftValue) / (rightValue - leftValue));
    }
  }
  return stops.at(-1)[1];
}

function heatmapSvg(primaryResults) {
  const conditions = [
    ['A_frontal', 'Frontal'],
    ['B_offaxis', 'Off-axis'],
  ];
  const cellWidth = 82;
  const cellHeight = 24;
  const labelWidth = 225;
  const top = 170;
  const gridWidth = conditions.length * COVERAGE_MEASURES.length * cellWidth;
  const width = labelWidth + gridWidth + 120;
  const height = top + CANONICAL_SCRIPT.length * cellHeight + 160;
  const byKey = new Map(
    primaryResults.map((row) => [`${row.condition}\u0000${row.segmentId}`, row]),
  );
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<style>text{font-family:Arial,Helvetica,sans-serif;fill:#17202a}.title{font-size:24px;font-weight:700}.subtitle{font-size:13px;fill:#4d5966}.condition{font-size:15px;font-weight:700}.row{font-size:11px}.col{font-size:10px;font-weight:600}.cell{font-size:10px;font-weight:700}.note{font-size:11px;fill:#4d5966}</style>',
    '<text class="title" x="20" y="34">Where each model input remained available</text>',
    '<text class="subtitle" x="20" y="57">Cell = median segment coverage across P1–P4; every participant is weighted once.</text>',
    '<text class="subtitle" x="20" y="76">Five parallel measures are shown separately; they are not a sequential funnel.</text>',
  ];

  conditions.forEach(([, conditionLabel], conditionIndex) => {
    const groupX = labelWidth + conditionIndex * COVERAGE_MEASURES.length * cellWidth;
    parts.push(
      `<rect x="${groupX}" y="86" width="${COVERAGE_MEASURES.length * cellWidth}" height="26" fill="${conditionIndex === 0 ? '#e8f1f7' : '#f2ece4'}"/>`,
      `<text class="condition" x="${groupX + (COVERAGE_MEASURES.length * cellWidth) / 2}" y="104" text-anchor="middle">${conditionLabel}</text>`,
    );
    COVERAGE_MEASURES.forEach(([, , label], measureIndex) => {
      const x = groupX + measureIndex * cellWidth + cellWidth / 2;
      parts.push(
        `<text class="col" x="${x}" y="${top - 11}" text-anchor="start" transform="rotate(-48 ${x} ${top - 11})">${xml(label)}</text>`,
      );
    });
  });

  CANONICAL_SCRIPT.forEach((segment, rowIndex) => {
    const y = top + rowIndex * cellHeight;
    const mark =
      segment.expectedScreenFacing === 'not_in_frame'
        ? ' ‡'
        : segment.id === 'face_lost'
          ? ' §'
          : segment.allowFaceLoss
            ? ' †'
            : '';
    if (mark) {
      parts.push(
        `<rect x="12" y="${y}" width="${labelWidth - 12}" height="${cellHeight}" fill="#f1f3f5"/>`,
      );
    }
    parts.push(
      `<text class="row" x="${labelWidth - 9}" y="${y + 16}" text-anchor="end">${xml(segment.id + mark)}</text>`,
    );

    conditions.forEach(([condition], conditionIndex) => {
      const row = byKey.get(`${condition}\u0000${segment.id}`);
      if (!row) {
        throw new Error(`missing primary heatmap row: ${condition}/${segment.id}`);
      }
      COVERAGE_MEASURES.forEach(([prefix, , label], measureIndex) => {
        const value = Number(row[`${prefix}MedianPct`]);
        const minimum = Number(row[`${prefix}MinPct`]);
        const maximum = Number(row[`${prefix}MaxPct`]);
        const participantVariation = maximum - minimum > 0.000001;
        const x =
          labelWidth +
          (conditionIndex * COVERAGE_MEASURES.length + measureIndex) * cellWidth;
        const textColor = value < 25 || value > 92 ? '#ffffff' : '#17202a';
        parts.push(
          `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="${coverageColor(value)}" stroke="${participantVariation ? '#273746' : '#ffffff'}" stroke-width="${participantVariation ? 1.5 : 0.7}"${participantVariation ? ' stroke-dasharray="3 2"' : ''}><title>${xml(`${condition} · ${segment.id} · ${label}: median ${value.toFixed(1)}%, range ${minimum.toFixed(1)}–${maximum.toFixed(1)}%, n=${row.participantCount}`)}</title></rect>`,
          `<text class="cell" x="${x + cellWidth / 2}" y="${y + 16}" text-anchor="middle" style="fill:${textColor}">${Math.round(value)}</text>`,
        );
      });
    });
    parts.push(
      `<line x1="12" y1="${y + cellHeight}" x2="${labelWidth + gridWidth}" y2="${y + cellHeight}" stroke="#ffffff" stroke-width="0.6"/>`,
    );
  });

  const dividerX = labelWidth + COVERAGE_MEASURES.length * cellWidth;
  parts.push(
    `<line x1="${dividerX}" y1="86" x2="${dividerX}" y2="${top + CANONICAL_SCRIPT.length * cellHeight}" stroke="#253746" stroke-width="3"/>`,
  );
  const legendY = top + CANONICAL_SCRIPT.length * cellHeight + 32;
  for (let value = 0; value <= 100; value += 2) {
    parts.push(
      `<rect x="${labelWidth + (value / 100) * 360}" y="${legendY}" width="8" height="16" fill="${coverageColor(value)}"/>`,
    );
  }
  parts.push(
    `<text class="note" x="${labelWidth}" y="${legendY + 34}">0% unavailable</text>`,
    `<text class="note" x="${labelWidth + 180}" y="${legendY + 34}" text-anchor="middle">50%</text>`,
    `<text class="note" x="${labelWidth + 360}" y="${legendY + 34}" text-anchor="end">100% available</text>`,
    `<text class="note" x="20" y="${height - 48}">Dashed border = P1–P4 range is not zero; read the exact minimum and maximum in results.csv.</text>`,
    `<text class="note" x="20" y="${height - 30}">† face loss permitted · § face-loss diagnostic · ‡ expected person absence · held-out Author remains separate.</text>`,
    `<text class="note" x="20" y="${height - 12}">P2 frontal lean_close is partial, so that one median uses n=3. Gaze is not evaluated.</text>`,
    '</svg>',
  );
  return `${parts.join('\n')}\n`;
}

function main() {
  const args = parseArguments();
  const entries = loadManifest(args.manifest);
  const checksums = loadChecksums(args.checksums);
  mkdirSync(args.output, { recursive: true });

  const allSegmentRows = [];
  const sessionSummary = [];
  for (const entry of entries) {
    const recording = readRecording(entry, checksums);
    const rows = segmentRows(entry, recording);
    allSegmentRows.push(...rows);
    sessionSummary.push(sessionResult(entry, recording, rows));
  }

  if (allSegmentRows.length !== entries.length * CANONICAL_SCRIPT.length) {
    throw new Error('expected exactly 300 session/segment rows');
  }
  const results = primarySegmentResults(allSegmentRows);
  writeCsv(resolve(args.output, 'segment-coverage.csv'), allSegmentRows);
  writeCsv(resolve(args.output, 'results.csv'), results);
  writeCsv(resolve(args.output, 'session-summary.csv'), sessionSummary);
  writeFileSync(
    resolve(args.output, 'coverage-heatmap.svg'),
    heatmapSvg(results),
    'utf8',
  );

  console.log(`analysed ${entries.length} sessions and ${allSegmentRows.length} held segments`);
  console.log(`wrote ${repositoryPath(args.output)}/segment-coverage.csv`);
  console.log(`wrote ${repositoryPath(args.output)}/results.csv`);
  console.log(`wrote ${repositoryPath(args.output)}/session-summary.csv`);
  console.log(`wrote ${repositoryPath(args.output)}/coverage-heatmap.svg`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
