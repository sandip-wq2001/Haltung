# Step 02 Method — Generic Versus Personally Calibrated Classification

## Question

For the eight frozen P1–P4 recordings, does personal calibration reduce false alarms compared with
the generic fixed-threshold control, and what change in misses accompanies it?

This step evaluates the already frozen engineering thresholds. It does not tune or sweep a threshold,
use the held-out Author outcomes, infer gaze, or make a population-level claim from four participants.

## Method provenance

The thresholds, three posture arms, two attention arms, compliance rule, missing-input treatment,
equal-segment weighting, 1.5-second dwell, and P1–P4/Author split were frozen in `docs/metric-spec.md`,
`eval/README.md`, and Step 00 before this numbered result was packaged. This file consolidates those
rules in one place; it is not represented as a preregistration. Keeping structurally complete
off-axis sessions despite the original 80% composite-coverage failure is an exploratory amendment
made after N=4 and must remain named as such.

## Cohort and source data

- **Primary:** P1, P2, P3, and P4, each with one frontal and one off-axis session (eight sessions).
- **Held out:** the Author pair is registered and schema-validated but no Author classifier outcome
  is calculated in this step.
- Exact files and identities come only from `eval/evaluation-manifest.json` and the Step 00 checksums.
- Only schema-6, `haltung-session-v8` held frames are replayed. The 20-second guidance periods were
  processed live but not saved and therefore cannot be scored.
- Only segments marked compliance `yes` are scored. `partial` and `no` remain in the recording but
  do not enter a performance result.

## Detector arms

### Posture A — generic roll difference

The only feature is `headShoulderRollDiff = fold(headTiltDeg − shoulderTiltDeg)`.

- `|roll difference| ≤ 3°`: `within_range`
- `3° < |roll difference| ≤ 7°`: `moderate_deviation`
- `|roll difference| > 7°`: `large_deviation`

The cutoffs are strict `>` comparisons. They are engineering assumptions, not clinical cutoffs.

### Posture B — calibrated roll difference

This arm uses exactly the same roll-difference feature as A, but centres it on the participant's
calibration-window median and scales it by
`max(1.4826 × median absolute deviation, 0.5°)`. Its absolute robust-z bands are:

- `|z| ≤ 2.5`: `within_range`
- `2.5 < |z| ≤ 3.5`: `moderate_deviation`
- `|z| > 3.5`: `large_deviation`

B minus A is the clean posture comparison for calibration alone. Arm B exists for evaluation and
its baseline is reconstructed from recorded calibration frames, never from scripted session poses.

### Posture C — complete calibrated system

This is the implemented five-feature calibrated posture classifier. It takes the worst absolute
robust z-score across `headTiltDeg`, `shoulderTiltDeg`, `headShoulderOffsetRatio`,
`shoulderWidthRatio`, and `earShoulderVerticalRatio`, using the stored TypeScript calibration profile
and the same 2.5/3.5 bands. The frozen minimum scaled-MAD floors are respectively `0.5°`, `0.2°`,
`0.04`, `0.06`, and `0.05`.

C minus B compares calibrated roll difference with the current calibrated five-proxy system. The
feature sets are not nested, so it must not be described as the marginal effect of simply “adding”
features. C versus A is an honest system-versus-system comparison, but it must not be described as
calibration alone because both the baseline rule and feature set change.

### Screen-facing attention

Both attention arms use the same inclusive band: yaw `±29°` and pitch `±12°`.

- **Generic:** the band is centred on camera-facing `yaw = 0°`, `pitch = 0°`.
- **Calibrated:** the same band is centred on the stored personal screen-facing median yaw and pitch.

Calibrated minus generic therefore changes only the origin. This is head orientation relative to the
screen-facing band; gaze and cognitive attention are not measured.

## Script references

Posture is scored only where the script instructed a posture:

- **Within range:** `baseline_1`, `baseline_2`, `baseline_3`, `baseline_4`.
- **Deviation:** `tilt_head_mild_left`, `tilt_head_left`, `tilt_head_right`,
  `shoulder_left_down`, `shoulder_right_down`, `shoulder_left_up`, `shoulder_right_up`, `slump`,
  `sit_tall`, `head_slide_left`, `torso_twist_left`, `bend_forward`, and `bend_backward`.

Screen-facing attention is scored only where the script instructed a direction:

- **Within screen band:** the four baselines and four screen-corner poses.
- **Outside screen band:** `phone_down`, `look_up`, `turn_left`, and `turn_right`.
- **Not in frame:** `absent`.

`moderate_deviation` and `large_deviation` both count as a posture alarm.
`outside_screen_band` and `not_in_frame` both count as an attention alarm. The reference is binary
because an instructed pose does not establish that a participant reached an arm's numeric severity.
Capture-only diagnostics with null references are not converted into invented labels.

## Input availability and missing values

All three posture arms retain the current application's shared, monolithic posture gate: a Pose
packet, two iris centres with positive IPD, visibility ≥0.5 for both ears and shoulders, and valid
derived metrics. A and B could mathematically recover roll difference from Pose alone, but allowing
that only offline would evaluate a different implementation.

- Missing posture input produces no posture state and resets the smoother.
- During a scripted deviation it counts as a miss.
- During a within-range posture segment it is neither a false alarm nor a true negative; coverage is
  therefore always reported beside performance.
- Missing head-orientation matrix produces the implemented attention state `not_in_frame`, not a
  null value. It is a false alarm during an instructed on-screen pose and a correct alarm during an
  away/absent pose.
- The `absent` segment consequently has intentionally unavailable matrix input while still having a
  correct semantic attention output. Attention input coverage is not an accuracy denominator.

## Raw and 1.5-second dwell results

Every arm is evaluated twice:

1. **Raw:** the state from every recorded frame.
2. **Smoothed:** the exact state-level dwell used by the app. The first non-null state commits
   immediately; a different full state must persist for at least 1,500 ms; null resets the state.

Smoothing is applied before reducing the ordinal state to alarm/no alarm, so a change between
`moderate_deviation` and `large_deviation`, or between `outside_screen_band` and `not_in_frame`, also
restarts the dwell timer. Because preparation frames were not stored, a fresh smoother starts at the
first held frame of every segment. This avoids inventing unseen history but is not a literal
continuous replay of `/live`. The smoothed result is primary and raw is the ablation.

## Calculation and weighting

For one scored segment with `N` held frames:

- alarm-reference segment: `TP = alarm frames / N`, `FN = (N − alarm frames) / N`;
- normal-reference segment with `M` explicit classifier verdicts: `FP = alarm verdicts / M` and
  `TN = non-alarm verdicts / M`;
- false-alarm rate is FP for a normal-reference segment;
- miss rate is FN for an alarm-reference segment; and
- valid-input coverage is available input frames divided by N.

Thus an unavailable normal-posture frame cannot silently lower the false-alarm rate: it is excluded
from that conditional denominator and remains visible in coverage. A normal segment with no explicit
verdict has an undefined false-alarm rate and contributes no confusion mass. Every other eligible
segment contributes one unit of probability mass regardless of duration or FPS. For each participant
and camera condition:

- false-alarm rate is the mean across normal-reference segments;
- miss rate is the mean across alarm-reference segments;
- segment TP, FP, TN, and FN masses are summed, then precision, recall, and F1 are calculated; and
- coverage is the equal-segment mean.

The group result reports the four participant values by median and full range. Frames are not treated
as independent participants. No p-value, confidence interval, or population-generalisation claim is
made at N=4.

Paired differences are calculated within each participant and camera condition as B−A, C−B, and
calibrated−generic for false alarms, misses, precision, recall, F1, and coverage. A negative
false-alarm or miss difference is better for the left-hand arm; a positive precision, recall, or F1
difference is better. Raw and smoothed rows are retained side by side so the dwell effect is an
explicit within-arm comparison.

## Calibration parity audit

The evaluator independently rebuilds the five posture baselines and the screen-facing median from
the rounded calibration frames and reports their difference from the stored TypeScript values. Arm C
uses the stored profile because that is what the app used; the rebuild is an audit. Arm B must use the
reconstructed roll-difference baseline because that joint feature is not stored in the profile.

Landmarks and matrices in JSONL are rounded to four decimal places. Results are exact for the
exported evidence, but frames extremely close to a cutoff are not provably identical to the
unrecorded, unrounded live decision.

## Required outputs

- `segment-results.csv`: every scored segment, detector arm, and smoothing mode.
- `participant-results.csv`: the P1–P4 participant/condition unit-of-analysis table.
- `summary-results.csv`: participant median and range for every reported metric.
- `paired-differences.csv`: within-participant arm differences.
- `coverage.csv`: supporting composite posture and matrix coverage by captured segment.
- `calibration-parity.csv`: stored-versus-rebuilt calibration audit.
- `primary-comparison.svg` and `primary-comparison.png`: smoothed participant values, medians, and
  ranges for false alarms and misses.
- `run.txt`: exact commands, runtime, checksums, and row-count checks.
- `summary.md`: plain-language findings, rejected interpretations, and limitations.

## Completion rule

Step 02 is complete only when tests cover classifier boundaries, missing-input semantics, smoothing,
equal-segment aggregation, paired differences, and cohort separation; a fresh run creates every
required artifact; key totals are independently reconciled from the CSVs; and the result is reviewed
before threshold derivation or held-out Author evaluation begins.
