# Step 01 Result — Separate Model-Input Availability

**Status: COMPLETE.** This step measures whether the required model outputs existed. It does
not yet evaluate thresholds, calibration benefit, classifier accuracy, or gaze.

## Short result

The recordings are complete enough to analyse, and the recurring off-axis problem is now located
more precisely: **Pose did not disappear. The separate Face Landmarker output disappeared in certain
directions.** When that happened, head orientation could not be decoded and the current monolithic
posture-metric function could not return its complete bundle, even though Pose-only posture features
remained recoverable.

This corrects the earlier shorthand that a pose had only “3% attention input” or “6% posture input.”
For P1 off-axis, `screen_bottom_right` had 2.5% face/iris, head-matrix, and complete-posture input,
while `tilt_head_right` had 6.1%. **Both still had 100% Pose availability and passed the current Pose
visibility gate on 100% of held frames.**

## What the five separate checks show

| Check | Observed result | What it means |
|---|---|---|
| Pose landmark availability | 100% in all 259 compliant ordinary-presence session rows | All 33 stored Pose landmarks remained available in the ordinary scored poses. |
| Pose visibility gate | Exactly matched Pose availability; no Pose-present frame failed the ear/shoulder ≥0.5 gate | The application accepted the required Pose visibility values. This does not prove direct optical visibility. |
| Face/iris and IPD | 100% for ordinary frontal poses, with direction-specific off-axis losses | The two stored iris centres needed for posture normalization were sometimes unavailable off-axis. This is not a gaze result. |
| Head-orientation matrix | Its percentage matched face/iris in every segment and calibration summary | In these recordings the matrix and iris output arrived or disappeared together, although they remain logically separate inputs. |
| Complete current posture input | Matched face/iris here because Pose and its visibility gate remained available | The current `computePostureMetrics` bundle could not run without iris/IPD. This does not mean every Pose-only posture feature was unavailable. |

Across all 79,851 held frames—including deliberate `face_lost` and `absent` actions—Pose and the
visibility gate were available in 77,162 frames (96.632%). Face/iris, the head matrix, and the complete
posture bundle were available in 70,085 frames (87.770%). Those overall percentages are inventory
figures, not accuracy scores; deliberate-loss actions are included in their denominators.

## Primary P1–P4 findings

- Every compliant ordinary frontal segment had 100% availability on all five measures.
- The repeated off-axis failure is `tilt_head_right`. Pose and visibility were present in all
  720/720 P1–P4 frames. Face/iris, the matrix, and complete posture input were present in only 11/720
  frames (1.5% as a raw frame count): P1 6.1%, P2 0%, P3 0%, and P4 0%. The participant median is 0%,
  range 0–6.1%.
- Off-axis `screen_bottom_right` had a primary median of 51.3%, range 0–100%: P1 2.5%, P2 0%, P3
  100%, and P4 100%. Pose and visibility were 100% for every participant.
- A median can hide one-person failures. P2 alone also had 0% face-dependent input at off-axis
  `screen_top_right` and `bend_forward`, plus small losses in three baseline segments. Dashed heatmap
  borders identify rows where P1–P4 did not all have the same coverage; `results.csv` gives the exact
  minimum and maximum.

## Separate held-out Author finding

The Author is not included in any P1–P4 median. The held-out off-axis recording independently repeats
the strongest pattern: `tilt_head_right` retained 100% Pose and visibility but only 14/181 face/iris,
matrix, and complete-posture frames (7.7%). The Author also had 0% face-dependent coverage at
`screen_bottom_right`, 86.6% at `screen_top_right`, and 78.3% at `bend_forward`.

## Calibration input

All ten calibrations had 100% Pose and visibility coverage. Nine also had 100% face/iris, matrix, and
complete-posture input. P2 off-axis had 51/59 such calibration frames (86.4%). The calibration is not
missing, but that one session has less face input than the others and later calibration analyses must
retain this fact.

## Intentional loss is kept separate

- `turn_left` and `turn_right`: face loss is permitted and compatible with the instruction; it is not
  required to happen.
- `face_lost`: deliberate diagnostic action.
- `absent`: person absence is expected.

These rows remain in `segment-coverage.csv`, but they are excluded from the ordinary-presence session
means. Their low coverage must not be described as accidental recording corruption.

## Defensible claim boundary

This step supports the claim that the ten files have complete held timelines and that some natural
off-axis directions produce repeatable loss of the Face Landmarker outputs while Pose remains usable.
It does **not** show whether a threshold is correct, whether calibration improves classification,
whether MediaPipe directly saw an occluded landmark, or whether gaze can be estimated. `/record`
stores all 33 Pose landmarks but only selected face-derived outputs (two iris centres, selected eye
points, and the 16-value matrix), not all 478 face landmarks.

The performance evaluation should start only after this result is reviewed, because missing complete
posture input and missing head-orientation input must be reported separately from classifier errors.

## Live reproduction in a chosen folder

From the repository root, run the tests and regenerate the four core artifacts in any chosen output
folder:

```bash
cd /Users/sandip.sarraf/Haltung

node --test eval/analyze-input-coverage.test.mjs

STEP01_OUTPUT="/private/tmp/haltung-step01-rerun"
node eval/analyze-input-coverage.mjs --output "$STEP01_OUTPUT"
```

The expected result is seven passing tests, ten analysed sessions, and 300 analysed held segments.
Compare the regenerated evidence with the frozen copy:

```bash
for file in \
  session-summary.csv \
  segment-coverage.csv \
  results.csv \
  coverage-heatmap.svg
do
  cmp \
    "docs/research/participant-evaluation/01-data-quality/$file" \
    "$STEP01_OUTPUT/$file" \
    && echo "$file: IDENTICAL" \
    || echo "$file: DIFFERENT"
done
```

The live reproduction produced `IDENTICAL` for all four files. `input-coverage.xlsx` is a formatted
review copy of the CSV evidence, and `coverage-heatmap.png` is a rendered presentation copy of the
SVG; neither is a separate analytical result.
