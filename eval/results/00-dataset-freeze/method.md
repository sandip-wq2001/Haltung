# Step 00 Method — Dataset Freeze and Verification

## Question

Which recordings belong to the final evaluation, are their files structurally complete, and which
quality-gate failures are recording failures versus condition-dependent model-input loss?

This step does not compare classifier performance and does not inspect which threshold performs
best. It only freezes and verifies the evidence that later steps may use.

## Frozen groups

### Primary cohort

P1, P2, P3, and P4 each contribute one frontal and one off-axis schema-6/v8 recording: eight
sessions in total. These four participants are the only members of the primary descriptive
feasibility evaluation.

### Supplementary held-out case

Author contributes one frontal and one off-axis schema-6/v8 recording. These two files are registered
and verified here but excluded from every P1–P4 aggregate. They are held out from classifier-outcome
evaluation and threshold fitting until the dedicated held-out evaluation step. Their recording quality
and model-input availability may be audited separately without using their classifier outcomes to
choose a threshold.

The cohort split is encoded structurally in `eval/evaluation-manifest.json` as `primarySessions` and
`heldOutSessions`. The evaluator rejects a participant appearing in both groups.

The manifest aliases are the analysis identifiers. A source header may append one parenthesised
capture note, as in `P1(redone)` or `P3(glasses)`; the freeze script removes only that final note and
requires the remaining identifier to equal the manifest alias. Participant-result fields use only the
manifest alias. The inventory and checksum evidence retain the original relative file path for
reproducibility, so a source filename can still contain its original capture note. Conditions must
match exactly.

## Inclusion rules

A final recording must:

1. be explicitly named in the manifest;
2. use schema 6 and `haltung-session-v8`;
3. have one frontal and one off-axis session for its participant alias;
4. contain the canonical 30-segment script and all compliance judgements;
5. contain no application-generated wall-clock date;
6. contain enough valid calibration samples to rebuild posture and screen-facing baselines;
7. contain the complete held-capture timeline at at least 20 effective frames per second; and
8. preserve the recorded geometry needed to reproduce the camera condition.

The independent verifier in `eval/verify-recording.mjs` implements these checks without trusting the
script embedded in the recording.

## Verifier outcome classes

The original verifier remains unchanged. Its 80% per-segment input-coverage gate is preserved.
Step 00 reports three possible outcomes:

- **PASS:** no verifier problem;
- **COVERAGE_FAIL:** the file is structurally/timing complete, but one or more required held poses
  provide the complete current posture input or head-orientation matrix in less than 80% of frames;
- **FAIL:** any other problem, such as wrong schema/script, malformed JSON, missing frames, invalid
  geometry, low FPS, missing compliance, or privacy-field regression.

`COVERAGE_FAIL` is not silently converted to `PASS`. Later analyses may retain a complete recording
when the loss is the system outcome being measured, but must report its coverage and scoring rule.

### Relationship to the five-layer Step 01 analysis

The original verifier deliberately remains unchanged and its two composite coverage checks remain part
of the dataset-freeze evidence:

- `postureCoverage` means availability of the complete current posture bundle: a complete Pose packet,
  the four required Pose landmarks passing visibility ≥ 0.5, and two distinct iris centres for IPD;
- `attentionCoverage` means availability of the finite 16-value face transformation matrix needed to
  decode head orientation.

Neither field means general Pose availability, direct optical landmark visibility, or classifier
accuracy. Step 01 therefore analyses five parallel layers separately: Pose landmark availability, the
Pose visibility gate, face/iris and IPD, the head-orientation matrix, and the complete current posture
input. Step 01 is authoritative for interpreting which underlying input disappeared; Step 00 remains
authoritative for the frozen file set and the original verifier disposition.

## Frozen scoring contract for later steps

Step 00 does not calculate performance, but it freezes how the later evaluator must score the final
recordings:

- include only segments whose operator compliance is `yes`;
- give each eligible scripted segment equal weight within a participant, then give each participant
  equal weight in the P1–P4 descriptive aggregate;
- during a scripted posture deviation, count a frame without the required posture input as a miss;
- for attention, preserve the implemented `not_in_frame` alarm when the face matrix is absent;
- report both the raw frame decision and the exact 1.5-second dwell result; and
- evaluate head orientation only. Do not calculate or claim gaze.

The implementation and detector-arm definitions are documented in
[`eval/README.md`](../../../../eval/README.md) and tested by
[`eval/test_evaluate_recordings.py`](../../../../eval/test_evaluate_recordings.py). Threshold
selection and classifier performance are not examined until their dedicated later steps.

## Superseded recordings

Every JSONL file under `docs/research/recordingSessions/` that is not in either manifest group is
listed in `excluded-recordings.csv` with an opaque ID, reason, and content checksum. Raw excluded
filenames are deliberately omitted because one superseded pilot used a timestamp-like filename.
Known categories are:

- old Author/Auth pilots using superseded v5 or v7 scripts; and
- the original P1 off-axis session replaced by the controlled-distance redone session.

These files remain preserved on disk but never enter final evaluation results.

## Frozen outputs

- `session-inventory.csv`: group, alias, condition, geometry, frame/calibration counts, FPS,
  compliance counts, file size, and SHA-256.
- `verifier-results.csv`: one status row per final session with every reported problem.
- `segment-coverage.csv`: per-session/per-segment output of the original verifier's composite complete-
  posture and head-orientation-matrix coverage checks. Step 01 contains the five-layer separation.
- `verifier-results.json`: structured verifier evidence for exact programmatic reuse.
- `verifier-output.txt`: human-readable full verifier outcome.
- `file-checksums.txt`: SHA-256 for all ten final files.
- `excluded-recordings.csv`: opaque checksum identity of every non-manifest recording and why it is
  excluded, without exposing old timestamp-like filenames.
- `run.txt`: the exact reproducible command.
- `summary.md`: the defense-ready interpretation written only after the outputs are inspected.

## Reproducibility and privacy

`eval/freeze-dataset.mjs` uses only Node.js standard-library modules and imports the same frozen
verifier used at capture time. It reads but never modifies JSONL files. Checksums identify content
changes without copying landmarks into tracked result files. Analytical identity fields use participant
aliases; relative source paths are retained only where needed to reproduce the file mapping. No
recording date is introduced.

## Completion rule

Step 00 is complete only when all ten final sessions have a checksum, an explicit verifier outcome,
an inventory row, and a documented disposition; all superseded files have an exclusion row; the
Author pair has no classifier-outcome row and enters no aggregate in primary evaluator outputs or
threshold fitting; and the central evaluation index links every artifact.
