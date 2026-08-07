#!/usr/bin/env node

// Freeze the final participant-study file set without modifying any raw recording.
// Output is written to the Step 00 defense-evidence folder as CSV, JSON, checksums, and text.

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verify } from './verify-recording.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_MANIFEST = resolve(REPOSITORY_ROOT, 'eval/evaluation-manifest.json');
const DEFAULT_OUTPUT = resolve(
  REPOSITORY_ROOT,
  'eval/results/00-dataset-freeze',
);
const RECORDING_ROOT = resolve(REPOSITORY_ROOT, 'eval/recordings');

// Excluded files are keyed by content rather than filename. One superseded pilot used a
// timestamp-like filename; keeping that name out of tracked evidence preserves the recording-date
// privacy rule while its SHA-256 still identifies the file unambiguously.
const EXCLUSION_REASONS = new Map([
  [
    '7e4c362ab2a7b900e34b5eefe138218e99147094674b17dd77ffbd93c116adba',
    'Superseded by the explicitly redone P1 off-axis session with the paired 0.65 m screen distance.',
  ],
  [
    'de451a6e2479e1a507b6c540e99079d32b0d690b0910df80b16c4936c8d33106',
    'Superseded Author pilot using haltung-session-v7; not comparable with the final v8 protocol.',
  ],
  [
    'e21a5239d1595afc5f89bab4f167003283531bb2af48e21ff5808250b8a53458',
    'Superseded Author pilot using haltung-session-v7; not comparable with the final v8 protocol.',
  ],
  [
    'e195f43e5d904f121e098035505f7ffbd85a4dfffd6cd7a96fc0e06fc54c07b9',
    'Superseded Author pilot using schema 4 / haltung-session-v5 and containing removed date fields.',
  ],
]);

function parseArguments() {
  const args = process.argv.slice(2);
  let manifest = DEFAULT_MANIFEST;
  let output = DEFAULT_OUTPUT;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--manifest' && args[index + 1]) {
      manifest = resolve(process.cwd(), args[index + 1]);
      index += 1;
    } else if (args[index] === '--output' && args[index + 1]) {
      output = resolve(process.cwd(), args[index + 1]);
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${args[index]}`);
    }
  }

  return { manifest, output };
}

function repositoryPath(path) {
  return relative(REPOSITORY_ROOT, path).split('\\').join('/');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function csvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = Array.isArray(value) ? value.join(' | ') : String(value);
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

function listJsonlFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...listJsonlFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      output.push(path);
    }
  }
  return output.sort();
}

export function coverageProblem(problem) {
  return (
    problem.startsWith("segment '") &&
    (problem.includes('frames can produce posture metrics') ||
      problem.includes('frames carry a face matrix'))
  );
}

export function verifierStatus(problems) {
  if (problems.length === 0) {
    return 'PASS';
  }
  return problems.every(coverageProblem) ? 'COVERAGE_FAIL' : 'FAIL';
}

function validateManifest(groups) {
  const expectedConditions = new Set(['A_frontal', 'B_offaxis']);
  const allPaths = [];
  const participantSets = new Map();

  for (const [group, sessions] of groups) {
    if (sessions.length === 0) {
      throw new Error(`manifest group ${group} must not be empty`);
    }

    const participantConditions = new Map();
    const pairKeys = new Set();
    for (const session of sessions) {
      if (
        typeof session.participantId !== 'string' ||
        session.participantId.length === 0 ||
        !expectedConditions.has(session.condition) ||
        typeof session.path !== 'string' ||
        session.path.length === 0
      ) {
        throw new Error(`manifest group ${group} contains an invalid session entry`);
      }

      const pairKey = `${session.participantId}\u0000${session.condition}`;
      if (pairKeys.has(pairKey)) {
        throw new Error(
          `manifest group ${group} repeats ${session.participantId}/${session.condition}`,
        );
      }
      pairKeys.add(pairKey);
      allPaths.push(session.path);

      const conditions = participantConditions.get(session.participantId) ?? new Set();
      conditions.add(session.condition);
      participantConditions.set(session.participantId, conditions);
    }

    for (const [participantId, conditions] of participantConditions) {
      if (
        conditions.size !== expectedConditions.size ||
        [...expectedConditions].some((condition) => !conditions.has(condition))
      ) {
        throw new Error(
          `manifest group ${group} participant ${participantId} needs one frontal and one off-axis session`,
        );
      }
    }
    participantSets.set(group, new Set(participantConditions.keys()));
  }

  if (new Set(allPaths).size !== allPaths.length) {
    throw new Error('manifest repeats a recording path');
  }

  const primaryParticipants = participantSets.get('primary') ?? new Set();
  const heldOutParticipants = participantSets.get('held_out') ?? new Set();
  const overlap = [...primaryParticipants].filter((id) => heldOutParticipants.has(id));
  if (overlap.length > 0) {
    throw new Error(`participants appear in primary and held-out groups: ${overlap.join(', ')}`);
  }
}

function complianceCounts(header) {
  const counts = { yes: 0, partial: 0, no: 0 };
  for (const item of header.compliance ?? []) {
    if (Object.hasOwn(counts, item.compliance)) {
      counts[item.compliance] += 1;
    }
  }
  return counts;
}

function inspectSession(entry, group) {
  const absolutePath = resolve(REPOSITORY_ROOT, entry.path);
  const text = readFileSync(absolutePath, 'utf8');
  const result = verify(text);
  const meta = result.header.meta ?? {};
  const sourceParticipantId = String(meta.participantId ?? '');
  const sourceAlias = sourceParticipantId.replace(/\s*\([^)]*\)\s*$/, '');
  if (sourceAlias !== entry.participantId) {
    throw new Error(
      `${repositoryPath(absolutePath)}: manifest participant ${entry.participantId} does not match ` +
        `source participant ${sourceParticipantId}`,
    );
  }
  if (meta.condition !== entry.condition) {
    throw new Error(
      `${repositoryPath(absolutePath)}: manifest condition ${entry.condition} does not match ` +
        `source condition ${meta.condition}`,
    );
  }
  const compliance = complianceCounts(result.header);
  const status = verifierStatus(result.problems);

  return {
    inventory: {
      group,
      participantId: entry.participantId,
      condition: entry.condition,
      relativePath: repositoryPath(absolutePath),
      sha256: sha256(text),
      bytes: Buffer.byteLength(text, 'utf8'),
      schemaVersion: meta.schemaVersion,
      scriptId: meta.scriptId,
      cameraHeightM: meta.camera?.heightM,
      eyeHeightM: meta.camera?.eyeHeightM,
      eyeCameraDistanceM: meta.camera?.distanceM,
      cameraScreenDistanceM: meta.camera?.screenCentreDistanceM,
      screenDistanceM: meta.screen?.distanceM,
      storedAzimuthDeg: meta.camera?.azimuthDeg,
      derivedAzimuthDeg: result.session.derivedAzimuthDeg,
      videoWidth: meta.video?.width,
      videoHeight: meta.video?.height,
      calibrationPostureFrames: result.calibration.posture,
      calibrationAttentionFrames: result.calibration.attention,
      sessionFrames: result.session.frames,
      durationSeconds: (result.session.duration / 1000).toFixed(3),
      effectiveFps: result.session.fps.toFixed(3),
      complianceYes: compliance.yes,
      compliancePartial: compliance.partial,
      complianceNo: compliance.no,
      verifierStatus: status,
    },
    verifier: {
      group,
      participantId: entry.participantId,
      condition: entry.condition,
      relativePath: repositoryPath(absolutePath),
      status,
      problemCount: result.problems.length,
      problems: result.problems,
    },
    coverage: result.rows.map((row) => ({
      group,
      participantId: entry.participantId,
      condition: entry.condition,
      segmentId: row.segment.id,
      expectedPosture: row.segment.expectedPosture,
      expectedScreenFacing: row.segment.expectedScreenFacing,
      allowFaceLoss: row.segment.allowFaceLoss ?? false,
      compliance: row.compliance,
      heldFrames: row.n,
      allSegmentFrames: row.all,
      postureCoverage: Number(row.posturePct.toFixed(8)),
      attentionCoverage: Number(row.attentionPct.toFixed(8)),
    })),
  };
}

function humanVerifierOutput(sessions) {
  const lines = [];
  for (const session of sessions) {
    const { verifier, inventory, coverage } = session;
    lines.push(`=== ${verifier.group} / ${verifier.participantId} / ${verifier.condition} ===`);
    lines.push(verifier.relativePath);
    lines.push(
      `status=${verifier.status} problems=${verifier.problemCount} ` +
        `frames=${inventory.sessionFrames} fps=${inventory.effectiveFps} ` +
        `azimuth=${Number(inventory.derivedAzimuthDeg).toFixed(2)}deg`,
    );
    if (verifier.problems.length === 0) {
      lines.push('problems: none');
    } else {
      lines.push('problems:');
      for (const problem of verifier.problems) {
        lines.push(`  - ${problem}`);
      }
    }
    lines.push('segment coverage:');
    for (const row of coverage) {
      lines.push(
        `  ${row.segmentId.padEnd(24)} posture=${(
          100 * Number(row.postureCoverage)
        ).toFixed(0)}% attention=${(100 * Number(row.attentionCoverage)).toFixed(0)}%`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function excludedRecordings(includedPaths) {
  return listJsonlFiles(RECORDING_ROOT)
    .map((absolutePath) => {
      const relativePath = repositoryPath(absolutePath);
      if (includedPaths.has(relativePath)) {
        return null;
      }

      const text = readFileSync(absolutePath, 'utf8');
      let meta = {};
      try {
        meta = JSON.parse(text.split('\n', 1)[0]).meta ?? {};
      } catch {
        // A malformed excluded pilot remains excluded; its checksum still preserves identity.
      }

      const contentSha256 = sha256(text);
      const reason = EXCLUSION_REASONS.get(contentSha256);
      if (!reason) {
        throw new Error(
          `unmanifested recording ${contentSha256} has no frozen exclusion reason`,
        );
      }

      return {
        recordingId: `excluded-${contentSha256.slice(0, 12)}`,
        sha256: contentSha256,
        bytes: statSync(absolutePath).size,
        sourceParticipantId: meta.participantId,
        condition: meta.condition,
        schemaVersion: meta.schemaVersion,
        scriptId: meta.scriptId,
        disposition: 'EXCLUDED',
        reason,
      };
    })
    .filter((row) => row !== null);
}

function main() {
  const args = parseArguments();
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  const groups = [
    ['primary', manifest.primarySessions ?? []],
    ['held_out', manifest.heldOutSessions ?? []],
  ];
  validateManifest(groups);

  mkdirSync(args.output, { recursive: true });
  const inspected = groups.flatMap(([group, entries]) =>
    entries.map((entry) => inspectSession(entry, group)),
  );

  const inventory = inspected.map((session) => session.inventory);
  const verifierRows = inspected.map((session) => ({
    ...session.verifier,
    problems: session.verifier.problems.join(' | '),
  }));
  const coverage = inspected.flatMap((session) => session.coverage);
  const includedPaths = new Set(inventory.map((row) => row.relativePath));
  const excluded = excludedRecordings(includedPaths);

  writeCsv(resolve(args.output, 'session-inventory.csv'), inventory);
  writeCsv(resolve(args.output, 'verifier-results.csv'), verifierRows);
  writeCsv(resolve(args.output, 'segment-coverage.csv'), coverage);
  writeCsv(resolve(args.output, 'excluded-recordings.csv'), excluded);
  writeFileSync(
    resolve(args.output, 'verifier-results.json'),
    `${JSON.stringify(
      inspected.map((session) => ({
        ...session.verifier,
        segmentCoverage: session.coverage,
      })),
      null,
      2,
    )}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(args.output, 'verifier-output.txt'),
    humanVerifierOutput(inspected),
    'utf8',
  );
  writeFileSync(
    resolve(args.output, 'file-checksums.txt'),
    `${inventory.map((row) => `${row.sha256}  ${row.relativePath}`).join('\n')}\n`,
    'utf8',
  );

  const statusCounts = { PASS: 0, COVERAGE_FAIL: 0, FAIL: 0 };
  for (const row of inventory) {
    statusCounts[row.verifierStatus] += 1;
  }
  console.log(`froze ${inventory.length} final sessions (${excluded.length} excluded recordings)`);
  for (const status of ['PASS', 'COVERAGE_FAIL', 'FAIL']) {
    console.log(`${status}: ${statusCounts[status]}`);
  }
  console.log(`wrote Step 00 evidence to ${repositoryPath(args.output)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
