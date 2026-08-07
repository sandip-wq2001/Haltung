# Step 00 Result — Final Dataset Frozen

## Outcome

The final evaluation dataset is now frozen as ten schema-6/`haltung-session-v8` recordings. The
primary cohort is the eight P1–P4 recordings. The two Author recordings are a separate supplementary
held-out pair and are not included in the P1–P4 aggregate. Four older or superseded recordings are
explicitly excluded.

No final recording has a structural, timing, schema, geometry, compliance, or privacy failure. Five
frontal recordings pass every original verifier check. Five off-axis recordings are structurally
complete but fail the verifier's original 80% model-input-coverage gate for at least one instructed
pose. They are therefore labelled `COVERAGE_FAIL`, not `PASS` and not a corrupt-recording `FAIL`.

| Evaluation group | Final recordings | PASS | COVERAGE_FAIL | FAIL |
|---|---:|---:|---:|---:|
| Primary P1–P4 | 8 | 4 | 4 | 0 |
| Held-out Author | 2 | 1 | 1 | 0 |
| **Total** | **10** | **5** | **5** | **0** |

## Capture completeness

All ten files contain the canonical 30-segment script at 1280 × 720. Each contains 7,951–8,033
saved held-capture frames. The complete procedure timeline spans 867.970–867.997 seconds, including
the unsaved guidance periods; the canonical held windows total 268 seconds. The saved frames therefore
give an effective held-capture rate of 29.668–29.974 fps. Calibration contains 51–59 valid samples per
file. These narrow ranges show that the off-axis coverage failures were not caused by an early stop or
a slow recording clock.

All compliance decisions are `yes` except P2 frontal `lean_close`, which is marked `partial`.
`lean_close` is an unscored capture-only diagnostic, and the frozen later scoring rule uses only
segments marked `yes`. P3's recorded screen distance is 0.75 m frontal and 0.71 m off-axis; this
known 4 cm protocol deviation remains visible rather than being corrected after capture.

## Repeated off-axis coverage result

Every off-axis session falls below the original gate for `tilt_head_right`, while the paired frontal
segment has 100% availability of the complete current posture bundle:

| Case | Off-axis `tilt_head_right` complete-current-posture coverage | Other original below-gate segments |
|---|---:|---|
| P1 | 6% | `screen_bottom_right` head-orientation matrix: 3% |
| P2 | 0% | `screen_top_right` head-orientation matrix: 0%; `screen_bottom_right` head-orientation matrix: 0%; `bend_forward` complete current posture: 0% |
| P3 | 0% | None |
| P4 | 0% | None |
| Author | 8% | `screen_bottom_right` head-orientation matrix: 0%; `bend_forward` complete current posture: 78% |

This is a repeatable condition-and-direction-dependent model-input limitation. It does not prove why
the underlying landmark model lost input, and it is not a gaze result: gaze estimation was rejected
from the study. Later evaluation must report this coverage explicitly and apply the frozen missing-
input scoring policy; it must not discard or silently pass these sessions.

These percentages preserve the original verifier's two composite checks. They must not be described
as general Pose availability or classifier accuracy. The complete current posture check requires Pose,
the four-landmark visibility gate, and iris/IPD; the attention-side check measures availability of the
16-value head-orientation matrix. The separate Step 01 analysis shows Pose landmarks, the Pose
visibility gate, face/iris, the head-orientation matrix, and the complete current posture input as five
parallel measures. In particular, Pose and its visibility gate remained available during the repeated
off-axis right-head-tilt loss. See
[Step 01's five-layer result](../01-data-quality/summary.md) for the authoritative interpretation.

## Exclusions

The excluded set contains the original P1 off-axis file superseded by the controlled-distance redo,
two v7 `Auth` frontal pilots, and one schema-4/v5 Author frontal pilot. Their dispositions and
checksums are recorded in `excluded-recordings.csv`; none may enter a final aggregate. The table uses
opaque checksum-based IDs and does not reproduce the old timestamp-like pilot filename.

## Defense wording

> Ten final v8 recordings were complete at approximately 30 fps. All five frontal sessions passed
> the original verifier. All five off-axis sessions failed at least one of its original composite 80%
> input-coverage checks, most consistently the complete current posture input during right head tilt.
> Step 01 shows that Pose itself remained available there and locates the loss in the separate
> face-dependent inputs. This is repeatable model-coverage loss rather than a stopped capture. We
> preserve the original gate and retain the complete sessions only under an explicit coverage and
> missing-input scoring policy.

## Claim boundary

Step 00 establishes dataset identity, completeness, exclusions, and verifier disposition only. It
does not yet establish classifier accuracy, calibration benefit, threshold quality, or generalisation.
Those questions belong to later numbered evaluations.

## Live reproduction in a chosen folder

Run from the repository root. Set `STEP00_OUTPUT` to any absolute folder in which the generated
evidence should be created. Using a separate folder leaves the tracked evidence and raw JSONL
recordings unchanged.

```bash
cd /Users/sandip.sarraf/Haltung
STEP00_OUTPUT="/absolute/path/to/desired/folder"
node eval/freeze-dataset.mjs --output "$STEP00_OUTPUT"
```

The expected summary is `10` final sessions, `4` excluded recordings, `5` `PASS`, `5`
`COVERAGE_FAIL`, and `0` `FAIL`. If `node` is not on `PATH`, use the recorded local runtime:

```bash
/Users/sandip.sarraf/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  eval/freeze-dataset.mjs --output "$STEP00_OUTPUT"
```

Compare all seven generated files with the tracked Step 00 evidence:

```bash
for file in \
  session-inventory.csv \
  verifier-results.csv \
  verifier-results.json \
  verifier-output.txt \
  segment-coverage.csv \
  excluded-recordings.csv \
  file-checksums.txt
do
  cmp \
    "docs/research/participant-evaluation/00-dataset-freeze/$file" \
    "$STEP00_OUTPUT/$file" \
    && echo "$file: IDENTICAL" \
    || echo "$file: DIFFERENT"
done
```

Finally, independently verify that the ten current raw recordings still match the frozen SHA-256
fingerprints:

```bash
shasum -a 256 -c \
  docs/research/participant-evaluation/00-dataset-freeze/file-checksums.txt
```

All seven comparisons should report `IDENTICAL`, and all ten checksum lines should report `OK`.
The commands are deterministic and read-only with respect to the raw recordings. A difference or
checksum failure must be investigated rather than hidden by regenerating the frozen fingerprints.

## Evidence

- [`method.md`](method.md): frozen cohort, rules, and outcome definitions.
- [`run.txt`](run.txt): exact command, runtime, and script hashes.
- [`session-inventory.csv`](session-inventory.csv): file, geometry, capture, calibration, compliance,
  and checksum inventory.
- [`verifier-results.csv`](verifier-results.csv): one disposition per final recording.
- [`segment-coverage.csv`](segment-coverage.csv): all 30 segment-level rows per recording for the
  original verifier's composite complete-posture and head-matrix coverage checks. Step 01 contains the
  later five-layer separation.
- [`verifier-output.txt`](verifier-output.txt) and [`verifier-results.json`](verifier-results.json):
  complete human-readable and structured verifier evidence.
- [`file-checksums.txt`](file-checksums.txt): frozen SHA-256 identity of all ten final recordings.
- [`excluded-recordings.csv`](excluded-recordings.csv): explicit disposition of every non-final JSONL
  file found under the recording root.
