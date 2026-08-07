# Step 01 Method — Separate Model-Input Coverage

## Question

For every held pose in the ten frozen final recordings, which MediaPipe output was actually
available: Pose landmarks, the required Pose visibility gate, iris/IPD, the face transformation
matrix, or the complete input required by the current posture implementation?

This is a data-quality analysis. It does not run attention or posture thresholds and does not score
classifier accuracy.

## Frozen groups

- **Primary:** P1–P4, frontal and off-axis, eight recordings.
- **Supplementary held-out:** Author, frontal and off-axis, two recordings. Author remains separate
  from P1–P4 summaries.

The exact files and checksums are those frozen in Step 00 through
`eval/evaluation-manifest.json` and `00-dataset-freeze/file-checksums.txt`.

## Unit and denominator

The primary output has one row for each canonical held segment in each recording: 30 segments × 10
recordings = 300 rows. `heldFrames` contains only frames inside the canonical capture interval after
the 20-second guidance period. Every coverage percentage uses that row's `heldFrames` as its
denominator and is written numerically on a 0–100 scale.

All segment rows are preserved, including `partial` compliance and intentional face/person-loss
actions. They are labelled so that expected absence is never described as a tracking defect.

The session summary uses only compliance-`yes` segments in which a person/face is ordinarily expected:
it excludes `turn_left`, `turn_right`, and `face_lost` (`allowFaceLoss`) and excludes `absent`
(`not_in_frame`). Each eligible segment contributes equally to the session mean, so a higher camera
frame rate cannot give one recording extra weight. This summary is descriptive; the complete segment
table remains the source of truth.

The primary result table first calculates coverage separately for each P1–P4 recording, then reports
the median and range across those participants for each condition and segment. The held-out Author is
not included in these medians and remains available as exact rows in the detailed and session tables.

## Five separate availability measures

### 1. Pose landmark availability

`poseAvailable` is true when the frame contains the complete 33-landmark Pose array. It does not
claim that every coordinate was directly observed; BlazePose may infer an occluded point.

### 2. Required Pose visibility gate

`poseVisibilityPass` is true when Pose is available and both ears (indices 7 and 8) and both
shoulders (indices 11 and 12) have MediaPipe visibility ≥ 0.5. This is the application's gate, not a
literal test of whether the point was optically visible. Per-segment minimum and median values across
these four landmarks are retained to expose high-confidence inferred coordinates.
`poseVisibilityPassGivenPosePct` is left blank when no Pose array exists, because a conditional
percentage has no denominator in that case.

### 3. Face/iris and IPD availability

`irisIpdAvailable` is true when the two stored iris centres are present, finite, and distinct, so a
positive inter-pupillary pixel distance can be calculated. The iris points are used here only for
posture normalization; gaze is not evaluated.

### 4. Head-orientation matrix availability

`faceMatrixAvailable` is true when the frame contains the finite 16-value face transformation matrix
required to decode yaw and pitch. Pose landmarks cannot substitute for this attention input.

### 5. Complete current posture input

`fullPostureAvailable` is true only when Pose is available, the four-landmark visibility gate passes,
and iris/IPD is available. This exactly represents whether the current monolithic
`computePostureMetrics` implementation can return its complete seven-metric bundle.

This fifth measure must not be described as “Pose availability.” Pose-only head tilt, shoulder tilt,
and roll difference may remain mathematically recoverable when `fullPostureAvailable` is false. No
decision about changing the runtime or performance-evaluation arms is made in Step 01.

## Calibration coverage

The session-level table also reports these same five measures over every stored calibration frame.
This checks whether the initial posture profile and screen-facing baseline had usable source input.

## Interpretation rules

- Low `poseAvailablePct` means the Pose Landmarker returned no full Pose array.
- High Pose and visibility but low iris/matrix means the separate Face Landmarker was lost.
- Low visibility with Pose still present means coordinates exist but the application's 0.5 gate
  rejects at least one required ear or shoulder.
- Low `faceMatrixAvailablePct` means head orientation is undecidable; it is not a gaze result.
- Low `fullPostureAvailablePct` describes the implemented bundle's availability, not the intrinsic
  availability of every individual posture feature.
- Face loss in `turn_left` or `turn_right` is permitted and compatible with the instruction;
  `face_lost` is a deliberate diagnostic; and `absent` expects person absence. These rows are
  reported but are not automatically called accidental tracking failures.

## Outputs

- `segment-coverage.csv`: all 300 exact participant/session/segment rows and the five separate
  measures.
- `results.csv`: P1–P4 median and range for every condition/segment (60 rows); each participant is
  weighted once.
- `session-summary.csv`: one ordinary-presence and calibration summary row per recording, including
  the held-out Author as a separate group.
- `coverage-heatmap.svg` and `coverage-heatmap.png`: the P1–P4 medians from `results.csv`; exact
  participant rows remain in the CSVs.
- `input-coverage.xlsx`: formatted convenience copy of the three CSV tables for review in Excel; the
  CSVs remain normative.
- `run.txt`: exact command, runtime, and script/checksum identity.
- `summary.md`: plain-language result and claim boundary, written after the outputs are generated.

## Post-run quality-control clarification

The five predicates, held-frame denominator, participant split, and intentional-loss exclusions were
fixed before reading these results. Post-run quality control only added the median/range presentation,
made a zero-denominator conditional percentage blank instead of `0`, clarified “permitted” versus
“expected” face loss, and made manifest group contamination fail closed. None changes an availability
classification or result percentage.
