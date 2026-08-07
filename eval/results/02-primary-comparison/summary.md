# Step 02 Result — Generic Versus Personally Calibrated Classification

**Status: READY FOR REVIEW.**

Participants: **4** (P1, P2, P3, P4).
Held-out pair registered separately: **Author**. It is
excluded from every result in this directory and will be evaluated only in the dedicated
held-out stage.

This is a descriptive feasibility evaluation. Values are computed per held segment, then
aggregated per participant with equal segment weight. No frame-level inference, confidence
interval, p-value, or participant-data threshold tuning is used.

Posture unavailability is reported as lost coverage and counts as a miss during a scripted
deviation. In a normal-posture segment it is excluded from the false-alarm denominator,
because it is neither a false alarm nor a true negative. Attention `not_in_frame` is an
alarm: it is correct for absence/look-away but a false alarm during an on-screen segment.
Attention coverage includes the deliberately face-absent segment, so it describes matrix
availability rather than an accuracy denominator.

## Primary results (1.5-second dwell)

| Condition | Detector | Arm | False alarm | Miss | Precision | Recall | F1 | Input coverage |
|---|---|---|---:|---:|---:|---:|---:|---:|
| A_frontal | attention | calibrated | 0.0% [0.0%, 37.5%] | 2.6% [0.0%, 60.0%] | 100.0% [62.5%, 100.0%] | 97.4% [40.0%, 100.0%] | 0.871 [0.571, 1.000] | 92.3% [92.3%, 92.3%] |
| A_frontal | attention | generic | 36.3% [0.0%, 100.0%] | 5.3% [0.0%, 20.0%] | 59.5% [38.5%, 100.0%] | 94.7% [80.0%, 100.0%] | 0.699 [0.556, 1.000] | 92.3% [92.3%, 92.3%] |
| A_frontal | posture | A_generic_roll | 27.6% [0.0%, 96.2%] | 38.5% [23.1%, 61.5%] | 88.2% [72.2%, 100.0%] | 61.5% [38.5%, 76.9%] | 0.710 [0.556, 0.768] | 100.0% [100.0%, 100.0%] |
| A_frontal | posture | B_calibrated_roll | 27.8% [1.5%, 40.8%] | 35.9% [15.4%, 46.2%] | 88.2% [87.1%, 99.1%] | 64.1% [53.8%, 84.6%] | 0.742 [0.698, 0.858] | 100.0% [100.0%, 100.0%] |
| A_frontal | posture | C_calibrated_full | 65.3% [47.4%, 99.6%] | 2.8% [0.0%, 7.7%] | 82.3% [76.5%, 87.3%] | 97.2% [92.3%, 100.0%] | 0.879 [0.860, 0.932] | 100.0% [100.0%, 100.0%] |
| B_offaxis | attention | calibrated | 18.8% [0.0%, 41.3%] | 20.0% [0.0%, 60.0%] | 69.0% [50.0%, 100.0%] | 80.0% [40.0%, 100.0%] | 0.770 [0.444, 0.909] | 84.6% [68.8%, 84.8%] |
| B_offaxis | attention | generic | 79.5% [75.4%, 87.5%] | 20.0% [0.0%, 20.0%] | 39.5% [38.1%, 41.7%] | 80.0% [80.0%, 100.0%] | 0.529 [0.516, 0.588] | 84.6% [68.8%, 84.8%] |
| B_offaxis | posture | A_generic_roll | 45.8% [3.8%, 99.3%] | 34.6% [28.3%, 56.9%] | 78.2% [70.1%, 98.3%] | 65.4% [43.1%, 71.7%] | 0.713 [0.534, 0.813] | 94.1% [87.9%, 94.5%] |
| B_offaxis | posture | B_calibrated_roll | 2.4% [1.7%, 20.1%] | 47.3% [15.4%, 66.6%] | 98.6% [85.4%, 99.3%] | 52.7% [33.4%, 84.6%] | 0.662 [0.498, 0.912] | 94.1% [87.9%, 94.5%] |
| B_offaxis | posture | C_calibrated_full | 41.8% [15.7%, 64.9%] | 18.6% [7.7%, 47.8%] | 86.2% [82.2%, 91.5%] | 81.4% [52.2%, 92.3%] | 0.820 [0.665, 0.899] | 94.1% [87.9%, 94.5%] |

## Within-participant arm differences (1.5-second dwell)

Each entry is the median [minimum, maximum] of four within-participant differences.
B−A isolates calibration on roll difference. C−B compares two calibrated but
non-nested feature sets. Attention calibrated−generic shifts only the band origin.

| Condition | Detector | Comparison | False alarm | Miss | Precision | Recall | F1 |
|---|---|---|---:|---:|---:|---:|---:|
| A_frontal | attention | calibrated_minus_generic | -36.3 pp [-62.5 pp, +0.0 pp] | +0.0 pp [-5.5 pp, +40.0 pp] | +29.7 pp [+0.0 pp, +45.6 pp] | +0.0 pp [-40.0 pp, +5.5 pp] | +0.107 [-0.076, +0.224] |
| A_frontal | posture | B_minus_A | +0.3 pp [-94.6 pp, +40.8 pp] | -2.6 pp [-46.2 pp, +23.1 pp] | +0.0 pp [-12.9 pp, +26.9 pp] | +2.6 pp [-23.1 pp, +46.2 pp] | +0.021 [-0.047, +0.303] |
| A_frontal | posture | C_minus_B | +39.0 pp [+28.7 pp, +73.0 pp] | -33.1 pp [-46.2 pp, -7.7 pp] | -9.2 pp [-11.9 pp, -4.0 pp] | +33.1 pp [+7.7 pp, +46.2 pp] | +0.136 [+0.002, +0.234] |
| B_offaxis | attention | calibrated_minus_generic | -57.9 pp [-81.2 pp, -46.2 pp] | +10.0 pp [-20.0 pp, +40.0 pp] | +28.7 pp [+10.1 pp, +61.9 pp] | -10.0 pp [-40.0 pp, +20.0 pp] | +0.217 [-0.088, +0.384] |
| B_offaxis | posture | B_minus_A | -34.3 pp [-97.3 pp, -2.1 pp] | +3.5 pp [-23.1 pp, +38.3 pp] | +14.0 pp [+0.9 pp, +28.1 pp] | -3.5 pp [-38.3 pp, +23.1 pp] | -0.012 [-0.210, +0.195] |
| B_offaxis | posture | C_minus_B | +30.3 pp [+13.7 pp, +63.2 pp] | -20.9 pp [-34.4 pp, -7.7 pp] | -9.0 pp [-17.0 pp, -0.7 pp] | +20.9 pp [+7.7 pp, +34.4 pp] | +0.110 [-0.013, +0.262] |

## Effect of the 1.5-second dwell (smoothed minus raw)

These are paired within-participant changes for the same arm. Negative false-alarm and
miss differences are reductions; positive F1 differences are increases.

| Condition | Detector | Arm | False alarm | Miss | F1 |
|---|---|---|---:|---:|---:|
| A_frontal | attention | calibrated | -0.6 pp [-3.4 pp, +0.0 pp] | -3.3 pp [-7.7 pp, +3.2 pp] | +0.024 [-0.032, +0.061] |
| A_frontal | attention | generic | -0.4 pp [-0.9 pp, +0.0 pp] | -0.7 pp [-7.7 pp, +0.0 pp] | +0.007 [+0.000, +0.044] |
| A_frontal | posture | A_generic_roll | +0.1 pp [-4.7 pp, +5.6 pp] | +2.7 pp [+0.0 pp, +8.2 pp] | -0.020 [-0.078, -0.003] |
| A_frontal | posture | B_calibrated_roll | -7.7 pp [-11.3 pp, -3.5 pp] | -0.1 pp [-2.1 pp, +2.0 pp] | +0.012 [-0.011, +0.025] |
| A_frontal | posture | C_calibrated_full | -2.8 pp [-3.1 pp, +12.4 pp] | +1.7 pp [-0.4 pp, +4.9 pp] | -0.014 [-0.022, +0.006] |
| B_offaxis | attention | calibrated | -0.7 pp [-3.6 pp, +0.0 pp] | +0.0 pp [+0.0 pp, +5.3 pp] | +0.001 [-0.041, +0.023] |
| B_offaxis | attention | generic | +0.9 pp [-0.9 pp, +4.3 pp] | +0.0 pp [-2.8 pp, +0.0 pp] | +0.000 [-0.012, +0.011] |
| B_offaxis | posture | A_generic_roll | -0.6 pp [-10.0 pp, +3.2 pp] | -0.4 pp [-2.3 pp, +1.1 pp] | +0.007 [-0.013, +0.022] |
| B_offaxis | posture | B_calibrated_roll | -2.9 pp [-11.0 pp, -0.2 pp] | -2.4 pp [-2.9 pp, +7.4 pp] | +0.024 [-0.072, +0.034] |
| B_offaxis | posture | C_calibrated_full | -0.1 pp [-4.2 pp, +3.4 pp] | -0.4 pp [-3.8 pp, +9.1 pp] | +0.002 [-0.052, +0.029] |

## Independent calibration replay

- Maximum absolute stored-vs-rebuilt profile median difference: `0.024492`.
- Maximum relative stored-vs-rebuilt scaled-MAD difference: `3.162%`.
- Maximum screen-baseline yaw difference: `0.0028°`.
- Maximum screen-baseline pitch difference: `0.0025°`.

The small non-zero residual is expected because exported landmarks are rounded to four
decimal places while the stored TypeScript profile used unrounded landmarks.

The reconstruction does not meet the metric specification's illustrative 1%
scaled-MAD parity tolerance for every metric. Primary arm C therefore uses the
stored TypeScript calibration profile; the independent replay is retained as an
explicit audit rather than represented as bit-identical reconstruction.

## Interpretation boundary

- A reduction in false alarms is not automatically a better detector if misses rise;
  both rates and the participant range must be reported together.
- B−A is the posture calibration-only comparison. C−A is not calibration alone, and
  C−B does not isolate adding one nested set of features.
- The scripted action is an instructed reference, not independently observed or clinical
  ground truth. Results measure agreement with the script.
- The study measures head orientation relative to a screen-facing band, not iris gaze,
  cognition, concentration, or productivity.
- N=4 supports a descriptive feasibility result only. The thousands of frames are not
  independent participants.
- Retaining complete off-axis sessions with direction-specific model loss is a disclosed
  post-N=4 exploratory amendment, not a preregistered choice.

## Output files

- `segment-results.csv`: auditable arm result for every scored segment.
- `participant-results.csv`: participant/condition unit-of-analysis table.
- `summary-results.csv`: median and range across participants.
- `paired-differences.csv`: within-participant arm differences.
- `coverage.csv`: model-input coverage for every captured segment.
- `calibration-parity.csv`: stored-versus-independent calibration reconstruction.
- `primary-comparison.svg/png`: participant dots with median and full range.
