# Worked Example — Off-Axis `tilt_head_right`

The whole row means:

> During the off-axis right-head-tilt pose, all four participants retained complete Pose landmarks
> and passed the Pose visibility gate. However, the Face Landmarker disappeared almost completely,
> so the current complete posture calculation was usually unavailable.

## Exact participant results

| Participant | Camera angle | Held frames | Pose | Visibility | Iris/IPD | Head matrix | Complete posture |
|---|---:|---:|---:|---:|---:|---:|---:|
| P1 | 42.24° | 180 | 180/180 | 180/180 | 11/180 | 11/180 | 11/180 |
| P2 | 52.44° | 180 | 180/180 | 180/180 | 0/180 | 0/180 | 0/180 |
| P3 | 39.10° | 180 | 180/180 | 180/180 | 0/180 | 0/180 | 0/180 |
| P4 | 47.26° | 180 | 180/180 | 180/180 | 0/180 | 0/180 | 0/180 |

Across P1–P4:

- Pose: 720/720 frames
- Pose visibility passed: 720/720
- Face-dependent input: 11/720 frames

## Identity and instruction fields

| Field | Value | Real-life meaning |
|---|---|---|
| `group` | `primary` | This row summarizes P1–P4, excluding the Author. |
| `condition` | `B_offaxis` | The camera was positioned to the side of the monitor. |
| `segmentIndex` | `9` | This was the ninth scripted pose. |
| `segmentId` | `tilt_head_right` | The participant tilted their head toward their right shoulder. |
| `expectedPosture` | `deviation` | This was intentionally a bad-posture example. The posture detector should eventually alarm. |
| `expectedScreenFacing` | blank | This pose was not used to judge attention or screen-facing correctness. |
| `lossInterpretation` | `ordinary` | The participant remained present and face loss was not intentionally requested. |
| `participantCount` | `4` | P1, P2, P3 and P4 contributed one result each. |

`expectedPosture = deviation` is the reference instruction. Step 01 still does not determine whether
the posture classifier correctly detected it.

## Pose availability fields

| Field | Value |
|---|---:|
| `PoseAvailableMedianPct` | 100% |
| `PoseAvailableMinPct` | 100% |
| `PoseAvailableMaxPct` | 100% |

Real-life meaning:

> MediaPipe returned all 33 Pose landmarks in every frame for every participant.

The individual percentages were:

\[
100,\ 100,\ 100,\ 100
\]

Therefore median, minimum and maximum are all 100%.

## Pose visibility fields

| Field | Value |
|---|---:|
| `PoseVisibilityPassMedianPct` | 100% |
| `PoseVisibilityPassMinPct` | 100% |
| `PoseVisibilityPassMaxPct` | 100% |

Real-life meaning:

> Both ear landmarks and both shoulder landmarks passed the application's visibility ≥ 0.5 gate in
> every frame.

The detailed minimum required visibility scores were:

- P1: 0.9980
- P2: 0.9627
- P3: 0.9936
- P4: 0.9958

All were far above the 0.5 gate.

This supports that the Pose model remained confident. It still does not prove that every landmark was
directly visible rather than inferred.

## Iris/IPD fields

| Field | Value |
|---|---:|
| `IrisIpdAvailableMedianPct` | 0% |
| `IrisIpdAvailableMinPct` | 0% |
| `IrisIpdAvailableMaxPct` | 6.11% |

The participant values were:

\[
6.11,\ 0,\ 0,\ 0
\]

Sorted:

\[
0,\ 0,\ 0,\ 6.11
\]

With four participants, the median is the average of the two middle values:

\[
\frac{0+0}{2}=0\%
\]

Real-life meaning:

> P2, P3 and P4 had no usable iris/face-mesh output during the pose. P1 had it for only 11 of 180
> frames.

## Head-matrix fields

| Field | Value |
|---|---:|
| `FaceMatrixAvailableMedianPct` | 0% |
| `FaceMatrixAvailableMinPct` | 0% |
| `FaceMatrixAvailableMaxPct` | 6.11% |

Real-life meaning:

> The head-orientation matrix disappeared together with the face mesh. Head yaw and pitch could not
> be calculated for P2–P4 and could be calculated in only 11 P1 frames.

This does not represent an attention error because `expectedScreenFacing` is blank for this posture
pose. It is an input-availability observation.

## Complete-posture fields

| Field | Value |
|---|---:|
| `FullPostureAvailableMedianPct` | 0% |
| `FullPostureAvailableMinPct` | 0% |
| `FullPostureAvailableMaxPct` | 6.11% |

The current complete posture function requires:

\[
\text{Pose}+\text{visibility pass}+\text{iris/IPD}
\]

Pose and visibility were available, but iris/IPD was not. Consequently, the current complete posture
function could not return its full bundle.

This does **not** mean every posture feature was impossible to calculate. The ear and shoulder
coordinates remained available, so Pose-only features such as head tilt and shoulder tilt were still
mathematically recoverable. The limitation is that the current monolithic function requires iris/IPD
before returning the entire bundle.

## Why the median says 0%, while the combined frame count says 1.5%

The participant median is:

\[
\operatorname{median}(6.11,\ 0,\ 0,\ 0)=0\%
\]

The pooled frame availability is:

\[
\frac{11}{720}\times100=1.53\%
\]

Both are correct but answer different questions:

- **Median 0%:** the typical participant result
- **1.53% pooled:** proportion of all recorded frames

The participant median is the primary result because each participant receives equal weight.

## Final real-world interpretation

> All four participants successfully remained tracked by the Pose model while tilting their heads
> right in the off-axis setup. The Face Landmarker was lost for nearly the entire pose, removing
> iris/IPD and the head matrix. Because the current complete posture implementation depends on
> iris/IPD, it also became unavailable, even though the Pose landmarks required to describe the head
> tilt remained present.

## Sources

- [`results.csv`](results.csv): P1–P4 median and range for the row.
- [`segment-coverage.csv`](segment-coverage.csv): exact participant frame counts and percentages.

