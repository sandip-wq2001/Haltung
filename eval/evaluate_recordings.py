#!/usr/bin/env python3
"""Replay the frozen posture and screen-facing classifiers over participant JSONL recordings.

This evaluator is deliberately dependency-free. It implements the frozen rules directly: it does
not import the Angular classifiers or trust classifier states from a recording. It emits
segment-level evidence first, then aggregates with equal segment weight so video frames are never
treated as independent participants.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Generic, Iterable, Sequence, TypeVar


# JSON necessarily crosses an untyped boundary. Every value used below is validated/coerced locally.
JsonObject = dict[str, Any]
StateT = TypeVar("StateT")

SCHEMA_VERSION = 6
SCRIPT_ID = "haltung-session-v8"
MAD_NORMAL_SCALE = 1.4826
STATE_COMMIT_MS = 1_500
YAW_FOCUSED_DEG = 29.0
PITCH_FOCUSED_DEG = 12.0
ROLL_DIFF_BAD_DEG = 3.0
ROLL_DIFF_VERY_BAD_DEG = 7.0
Z_BAD = 2.5
Z_VERY_BAD = 3.5
MIN_SCALED_MAD_ROLL_DIFF = 0.5

MIN_SCALED_MAD: dict[str, float] = {
    "headTiltDeg": 0.5,
    "shoulderTiltDeg": 0.2,
    "headShoulderOffsetRatio": 0.04,
    "shoulderWidthRatio": 0.06,
    "earShoulderVerticalRatio": 0.05,
}

PROFILE_METRICS = tuple(MIN_SCALED_MAD.keys())

# Independent frozen reference labels. Null-labelled capture-only poses are intentionally absent.
POSTURE_REFERENCES: dict[str, str] = {
    "baseline_1": "within_range",
    "baseline_2": "within_range",
    "baseline_3": "within_range",
    "baseline_4": "within_range",
    "tilt_head_mild_left": "deviation",
    "tilt_head_left": "deviation",
    "tilt_head_right": "deviation",
    "shoulder_left_down": "deviation",
    "shoulder_right_down": "deviation",
    "shoulder_left_up": "deviation",
    "shoulder_right_up": "deviation",
    "slump": "deviation",
    "sit_tall": "deviation",
    "head_slide_left": "deviation",
    "torso_twist_left": "deviation",
    "bend_forward": "deviation",
    "bend_backward": "deviation",
}

ATTENTION_REFERENCES: dict[str, str] = {
    "baseline_1": "within_screen_band",
    "screen_top_left": "within_screen_band",
    "screen_top_right": "within_screen_band",
    "screen_bottom_left": "within_screen_band",
    "screen_bottom_right": "within_screen_band",
    "baseline_2": "within_screen_band",
    "baseline_3": "within_screen_band",
    "phone_down": "outside_screen_band",
    "look_up": "outside_screen_band",
    "turn_left": "outside_screen_band",
    "turn_right": "outside_screen_band",
    "baseline_4": "within_screen_band",
    "absent": "not_in_frame",
}


@dataclass(frozen=True)
class ManifestSession:
    participant_id: str
    condition: str
    path: Path


@dataclass(frozen=True)
class EvaluationManifest:
    primary_sessions: list[ManifestSession]
    held_out_sessions: list[ManifestSession]


@dataclass(frozen=True)
class Recording:
    manifest: ManifestSession
    header: JsonObject
    frames: list[JsonObject]


@dataclass(frozen=True)
class PostureMetrics:
    ipd: float
    head_shoulder_offset_ratio: float
    head_tilt_deg: float
    shoulder_tilt_deg: float
    head_shoulder_roll_diff: float
    shoulder_width_ratio: float
    ear_shoulder_vertical_ratio: float

    def profile_value(self, name: str) -> float:
        values = {
            "headTiltDeg": self.head_tilt_deg,
            "shoulderTiltDeg": self.shoulder_tilt_deg,
            "headShoulderOffsetRatio": self.head_shoulder_offset_ratio,
            "shoulderWidthRatio": self.shoulder_width_ratio,
            "earShoulderVerticalRatio": self.ear_shoulder_vertical_ratio,
        }
        return values[name]


@dataclass(frozen=True)
class HeadPose:
    yaw_deg: float
    pitch_deg: float
    roll_deg: float


@dataclass(frozen=True)
class Baseline:
    median: float
    scaled_mad: float


@dataclass(frozen=True)
class SegmentResult:
    participant_id: str
    condition: str
    azimuth_deg: float
    detector: str
    arm: str
    smoothing: str
    segment_id: str
    reference: str
    reference_alarm: bool
    compliance: str
    frames: int
    available_frames: int
    alarm_frames: int
    state_counts: str
    false_alarm_rate: float | None
    miss_rate: float | None
    true_positive_rate: float
    false_positive_rate: float | None
    true_negative_rate: float | None
    false_negative_rate: float
    unavailable_rate: float


@dataclass(frozen=True)
class CoverageResult:
    participant_id: str
    condition: str
    azimuth_deg: float
    segment_id: str
    compliance: str
    frames: int
    posture_coverage: float
    attention_coverage: float


class StateSmoother(Generic[StateT]):
    """Exact Python port of frontend state-smoother.ts."""

    def __init__(self) -> None:
        self.committed: StateT | None = None
        self.candidate: StateT | None = None
        self.candidate_since = 0

    def update(self, raw: StateT | None, timestamp_ms: int) -> StateT | None:
        if raw is None:
            self.committed = None
            self.candidate = None
            return None

        if self.committed is None or raw == self.committed:
            self.committed = raw
            self.candidate = None
            return self.committed

        if raw != self.candidate:
            self.candidate = raw
            self.candidate_since = timestamp_ms

        if timestamp_ms - self.candidate_since >= STATE_COMMIT_MS:
            self.committed = raw
            self.candidate = None

        return self.committed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("eval/evaluation-manifest.json"),
        help="explicit participant/session manifest",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("eval/results"),
        help="directory for derived CSV and Markdown results",
    )
    return parser.parse_args()


def manifest_sessions(
    raw: JsonObject,
    key: str,
    repository_root: Path,
) -> list[ManifestSession]:
    sessions: list[ManifestSession] = []
    for item in raw.get(key, []):
        participant_id = str(item["participantId"])
        condition = str(item["condition"])
        relative_path = Path(str(item["path"]))
        sessions.append(
            ManifestSession(
                participant_id=participant_id,
                condition=condition,
                path=repository_root / relative_path,
            )
        )
    return sessions


def validate_complete_pairs(sessions: Sequence[ManifestSession], group_name: str) -> None:
    keys = [(session.participant_id, session.condition) for session in sessions]
    if len(keys) != len(set(keys)):
        raise ValueError(f"{group_name} contains duplicate participant/condition entries")

    expected_conditions = {"A_frontal", "B_offaxis"}
    participants = {session.participant_id for session in sessions}
    for participant_id in participants:
        actual_conditions = {
            session.condition for session in sessions if session.participant_id == participant_id
        }
        if actual_conditions != expected_conditions:
            raise ValueError(
                f"{group_name} participant {participant_id} must have one frontal and one "
                "off-axis session"
            )


def load_manifest(path: Path, repository_root: Path) -> EvaluationManifest:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if "authorParticipantId" in raw or "sessions" in raw:
        raise ValueError(
            "manifest uses the superseded mixed-cohort format; use primarySessions and "
            "heldOutSessions"
        )

    primary_sessions = manifest_sessions(raw, "primarySessions", repository_root)
    held_out_sessions = manifest_sessions(raw, "heldOutSessions", repository_root)
    if not primary_sessions:
        raise ValueError(f"manifest contains no primary sessions: {path}")
    if not held_out_sessions:
        raise ValueError(f"manifest contains no held-out sessions: {path}")

    validate_complete_pairs(primary_sessions, "primarySessions")
    validate_complete_pairs(held_out_sessions, "heldOutSessions")

    primary_ids = {session.participant_id for session in primary_sessions}
    held_out_ids = {session.participant_id for session in held_out_sessions}
    overlap = sorted(primary_ids & held_out_ids)
    if overlap:
        raise ValueError(f"participants appear in primary and held-out groups: {overlap}")

    return EvaluationManifest(
        primary_sessions=primary_sessions,
        held_out_sessions=held_out_sessions,
    )


def load_recording(session: ManifestSession) -> Recording:
    lines = session.path.read_text(encoding="utf-8").splitlines()
    if len(lines) < 2:
        raise ValueError(f"recording is empty or has no frames: {session.path}")

    header = json.loads(lines[0])
    # Parsing line-by-line makes a malformed source line fail with its exact location.
    frames: list[JsonObject] = []
    for line_number, line in enumerate(lines[1:], start=2):
        try:
            frames.append(json.loads(line))
        except json.JSONDecodeError as error:
            raise ValueError(f"{session.path}:{line_number}: {error}") from error

    meta = header.get("meta", {})
    if meta.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{session.path}: expected schema {SCHEMA_VERSION}")
    if meta.get("scriptId") != SCRIPT_ID:
        raise ValueError(f"{session.path}: expected script {SCRIPT_ID}")
    if meta.get("condition") != session.condition:
        raise ValueError(f"{session.path}: manifest/header condition mismatch")

    return Recording(manifest=session, header=header, frames=frames)


def finite_number(value: Any) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"expected a finite number, got {value!r}")
    return number


def point_distance(a: Sequence[float], b: Sequence[float]) -> float:
    return math.hypot(finite_number(b[0]) - finite_number(a[0]), finite_number(b[1]) - finite_number(a[1]))


def fold_angle_deg(angle: float) -> float:
    if angle > 90.0:
        return angle - 180.0
    if angle < -90.0:
        return angle + 180.0
    return angle


def folded_tilt_deg(a: Sequence[float], b: Sequence[float]) -> float:
    angle = math.atan2(finite_number(b[1]) - finite_number(a[1]), finite_number(b[0]) - finite_number(a[0]))
    return fold_angle_deg(math.degrees(angle))


def compute_posture_metrics(frame: JsonObject, width: int, height: int) -> PostureMetrics | None:
    pose = frame.get("pose")
    iris = frame.get("iris")
    if not isinstance(pose, list) or not isinstance(iris, list):
        return None
    if len(pose) <= 12 or len(iris) != 2:
        return None

    indices = (7, 8, 11, 12)
    for index in indices:
        landmark = pose[index]
        if not isinstance(landmark, list) or len(landmark) < 4 or finite_number(landmark[3]) < 0.5:
            return None

    def pixel_point(point: Sequence[float]) -> tuple[float, float]:
        return finite_number(point[0]) * width, finite_number(point[1]) * height

    left_ear = pixel_point(pose[7])
    right_ear = pixel_point(pose[8])
    left_shoulder = pixel_point(pose[11])
    right_shoulder = pixel_point(pose[12])
    iris_a = pixel_point(iris[0])
    iris_b = pixel_point(iris[1])
    ipd = point_distance(iris_a, iris_b)
    if ipd <= 0.0:
        return None

    ear_midpoint = ((left_ear[0] + right_ear[0]) / 2.0, (left_ear[1] + right_ear[1]) / 2.0)
    shoulder_midpoint = (
        (left_shoulder[0] + right_shoulder[0]) / 2.0,
        (left_shoulder[1] + right_shoulder[1]) / 2.0,
    )
    head_tilt_deg = folded_tilt_deg(left_ear, right_ear)
    shoulder_tilt_deg = folded_tilt_deg(left_shoulder, right_shoulder)

    return PostureMetrics(
        ipd=ipd,
        head_shoulder_offset_ratio=(ear_midpoint[0] - shoulder_midpoint[0]) / ipd,
        head_tilt_deg=head_tilt_deg,
        shoulder_tilt_deg=shoulder_tilt_deg,
        head_shoulder_roll_diff=fold_angle_deg(head_tilt_deg - shoulder_tilt_deg),
        shoulder_width_ratio=point_distance(left_shoulder, right_shoulder) / ipd,
        ear_shoulder_vertical_ratio=(shoulder_midpoint[1] - ear_midpoint[1]) / ipd,
    )


def decode_head_pose(matrix: Any) -> HeadPose | None:
    if not isinstance(matrix, list) or len(matrix) < 16:
        return None

    values = [finite_number(value) for value in matrix]

    def matrix_value(column: int, row: int) -> float:
        return values[column * 4 + row]

    yaw = math.atan2(-matrix_value(2, 0), matrix_value(2, 2))
    pitch_input = max(-1.0, min(1.0, matrix_value(2, 1)))
    pitch = math.asin(pitch_input)
    roll = math.atan2(-matrix_value(1, 0), matrix_value(1, 1))
    return HeadPose(math.degrees(yaw), math.degrees(pitch), math.degrees(roll))


def robust_baseline(values: Sequence[float], minimum_scaled_mad: float) -> Baseline:
    if not values:
        raise ValueError("cannot build a baseline from no values")
    median_value = float(statistics.median(values))
    deviations = [abs(value - median_value) for value in values]
    scaled_mad = max(float(statistics.median(deviations)) * MAD_NORMAL_SCALE, minimum_scaled_mad)
    return Baseline(median=median_value, scaled_mad=scaled_mad)


def calibration_metrics(recording: Recording) -> list[PostureMetrics]:
    video = recording.header["meta"]["video"]
    width = int(video["width"])
    height = int(video["height"])
    metrics: list[PostureMetrics] = []
    for frame in recording.frames:
        if frame.get("phase") != "calibration":
            continue
        value = compute_posture_metrics(frame, width, height)
        if value is not None:
            metrics.append(value)
    return metrics


def reconstructed_profile(metrics: Sequence[PostureMetrics]) -> dict[str, Baseline]:
    if len(metrics) < 30:
        raise ValueError(f"only {len(metrics)} valid posture calibration samples")
    return {
        name: robust_baseline([metric.profile_value(name) for metric in metrics], MIN_SCALED_MAD[name])
        for name in PROFILE_METRICS
    }


def stored_profile(recording: Recording) -> dict[str, Baseline]:
    raw_metrics = recording.header["profile"]["metrics"]
    return {
        name: Baseline(
            median=finite_number(raw_metrics[name]["median"]),
            scaled_mad=finite_number(raw_metrics[name]["scaledMad"]),
        )
        for name in PROFILE_METRICS
    }


def reconstructed_screen_baseline(recording: Recording) -> tuple[float, float]:
    poses: list[HeadPose] = []
    for frame in recording.frames:
        if frame.get("phase") != "calibration":
            continue
        pose = decode_head_pose(frame.get("m"))
        if pose is not None:
            poses.append(pose)
    if len(poses) < 30:
        raise ValueError(f"only {len(poses)} valid screen-baseline samples")
    return (
        float(statistics.median([pose.yaw_deg for pose in poses])),
        float(statistics.median([pose.pitch_deg for pose in poses])),
    )


def classify_magnitude(value: float, bad: float, very_bad: float) -> str:
    magnitude = abs(value)
    if magnitude > very_bad:
        return "large_deviation"
    if magnitude > bad:
        return "moderate_deviation"
    return "within_range"


def classify_posture_arm_a(metrics: PostureMetrics | None) -> str | None:
    if metrics is None:
        return None
    return classify_magnitude(metrics.head_shoulder_roll_diff, ROLL_DIFF_BAD_DEG, ROLL_DIFF_VERY_BAD_DEG)


def classify_posture_arm_b(metrics: PostureMetrics | None, baseline: Baseline) -> str | None:
    if metrics is None:
        return None
    robust_z = (metrics.head_shoulder_roll_diff - baseline.median) / baseline.scaled_mad
    return classify_magnitude(robust_z, Z_BAD, Z_VERY_BAD)


def classify_posture_arm_c(
    metrics: PostureMetrics | None,
    profile: dict[str, Baseline],
) -> str | None:
    if metrics is None:
        return None
    largest_z = max(
        abs((metrics.profile_value(name) - profile[name].median) / profile[name].scaled_mad)
        for name in PROFILE_METRICS
    )
    return classify_magnitude(largest_z, Z_BAD, Z_VERY_BAD)


def classify_attention_generic(pose: HeadPose | None) -> str:
    if pose is None:
        return "not_in_frame"
    within = abs(pose.yaw_deg) <= YAW_FOCUSED_DEG and abs(pose.pitch_deg) <= PITCH_FOCUSED_DEG
    return "within_screen_band" if within else "outside_screen_band"


def classify_attention_calibrated(
    pose: HeadPose | None,
    yaw_median_deg: float,
    pitch_median_deg: float,
) -> str:
    if pose is None:
        return "not_in_frame"
    within = (
        abs(pose.yaw_deg - yaw_median_deg) <= YAW_FOCUSED_DEG
        and abs(pose.pitch_deg - pitch_median_deg) <= PITCH_FOCUSED_DEG
    )
    return "within_screen_band" if within else "outside_screen_band"


def is_alarm(detector: str, state: str | None) -> bool | None:
    if state is None:
        return None
    if detector == "posture":
        return state != "within_range"
    return state != "within_screen_band"


def compliance_by_segment(recording: Recording) -> dict[str, str]:
    return {
        str(item["segmentId"]): str(item["compliance"])
        for item in recording.header.get("compliance", [])
    }


def session_frames_by_segment(recording: Recording) -> dict[str, list[JsonObject]]:
    grouped: dict[str, list[JsonObject]] = {}
    for frame in recording.frames:
        if frame.get("phase") != "session":
            continue
        grouped.setdefault(str(frame.get("seg")), []).append(frame)
    return grouped


def smooth_states(states: Sequence[str | None], timestamps: Sequence[int]) -> list[str | None]:
    smoother: StateSmoother[str] = StateSmoother()
    return [smoother.update(state, timestamp) for state, timestamp in zip(states, timestamps)]


def make_segment_result(
    recording: Recording,
    detector: str,
    arm: str,
    smoothing: str,
    segment_id: str,
    reference: str,
    compliance: str,
    predictions: Sequence[str | None],
    input_available: Sequence[bool],
) -> SegmentResult:
    reference_alarm = reference in {"deviation", "outside_screen_band", "not_in_frame"}
    alarms = [is_alarm(detector, state) for state in predictions]
    total = len(alarms)
    if total == 0:
        raise ValueError(f"{recording.manifest.path}: no frames for scored segment {segment_id}")
    if len(input_available) != total:
        raise ValueError(f"{recording.manifest.path}: availability/prediction length mismatch")

    # Input coverage and classifier output are deliberately separate. Attention emits the
    # meaningful alarm `not_in_frame` when head pose is absent, but the underlying face-matrix
    # coverage for that frame is still unavailable and must not be reported as 100% coverage.
    available = sum(input_available)
    alarm_count = sum(alarm is True for alarm in alarms)
    non_alarm_count = sum(alarm is False for alarm in alarms)
    explicit_verdicts = alarm_count + non_alarm_count
    unavailable = total - available
    state_counts = {
        str(state): sum(candidate == state for candidate in predictions)
        for state in sorted({candidate for candidate in predictions if candidate is not None})
    }
    if any(state is None for state in predictions):
        state_counts["unavailable"] = sum(state is None for state in predictions)

    if reference_alarm:
        true_positive = alarm_count / total
        false_negative = (total - alarm_count) / total  # Unavailable posture is failure to detect.
        false_positive = 0.0
        true_negative = 0.0
        false_alarm_rate = None
        miss_rate = false_negative
    else:
        true_positive = 0.0
        false_negative = 0.0
        # A missing posture verdict is neither a false alarm nor a true negative. Use only explicit
        # classifier verdicts here, and expose missing input separately through unavailable_rate.
        # Attention always emits an explicit state, including `not_in_frame`, so its denominator
        # remains every held frame.
        false_positive = alarm_count / explicit_verdicts if explicit_verdicts > 0 else None
        true_negative = non_alarm_count / explicit_verdicts if explicit_verdicts > 0 else None
        false_alarm_rate = false_positive
        miss_rate = None

    meta = recording.header["meta"]
    return SegmentResult(
        participant_id=recording.manifest.participant_id,
        condition=recording.manifest.condition,
        azimuth_deg=finite_number(meta["camera"]["azimuthDeg"]),
        detector=detector,
        arm=arm,
        smoothing=smoothing,
        segment_id=segment_id,
        reference=reference,
        reference_alarm=reference_alarm,
        compliance=compliance,
        frames=total,
        available_frames=available,
        alarm_frames=alarm_count,
        state_counts=json.dumps(state_counts, sort_keys=True, separators=(",", ":")),
        false_alarm_rate=false_alarm_rate,
        miss_rate=miss_rate,
        true_positive_rate=true_positive,
        false_positive_rate=false_positive,
        true_negative_rate=true_negative,
        false_negative_rate=false_negative,
        unavailable_rate=unavailable / total,
    )


def evaluate_recording(recording: Recording) -> tuple[list[SegmentResult], list[CoverageResult], JsonObject]:
    metrics_calibration = calibration_metrics(recording)
    rebuilt_profile = reconstructed_profile(metrics_calibration)
    profile = stored_profile(recording)
    roll_baseline = robust_baseline(
        [metric.head_shoulder_roll_diff for metric in metrics_calibration],
        MIN_SCALED_MAD_ROLL_DIFF,
    )
    rebuilt_yaw, rebuilt_pitch = reconstructed_screen_baseline(recording)
    screen_baseline = recording.header["screenBaseline"]
    stored_yaw = finite_number(screen_baseline["yawMedianDeg"])
    stored_pitch = finite_number(screen_baseline["pitchMedianDeg"])

    median_differences = [abs(rebuilt_profile[name].median - profile[name].median) for name in PROFILE_METRICS]
    mad_relative_differences = [
        abs(rebuilt_profile[name].scaled_mad - profile[name].scaled_mad) / profile[name].scaled_mad
        for name in PROFILE_METRICS
    ]
    parity: JsonObject = {
        "participantId": recording.manifest.participant_id,
        "condition": recording.manifest.condition,
        "calibrationSamples": len(metrics_calibration),
        "maxProfileMedianAbsDifference": max(median_differences),
        "maxProfileScaledMadRelativeDifference": max(mad_relative_differences),
        "screenYawAbsDifference": abs(rebuilt_yaw - stored_yaw),
        "screenPitchAbsDifference": abs(rebuilt_pitch - stored_pitch),
        "rollDiffMedian": roll_baseline.median,
        "rollDiffScaledMad": roll_baseline.scaled_mad,
    }
    for name in PROFILE_METRICS:
        parity[f"{name}MedianAbsDifference"] = abs(rebuilt_profile[name].median - profile[name].median)
        parity[f"{name}ScaledMadRelativeDifference"] = (
            abs(rebuilt_profile[name].scaled_mad - profile[name].scaled_mad)
            / profile[name].scaled_mad
        )

    video = recording.header["meta"]["video"]
    width = int(video["width"])
    height = int(video["height"])
    compliance = compliance_by_segment(recording)
    grouped_frames = session_frames_by_segment(recording)
    required_segments = set(POSTURE_REFERENCES) | set(ATTENTION_REFERENCES)
    missing_segments = sorted(required_segments - set(grouped_frames))
    if missing_segments:
        raise ValueError(
            f"{recording.manifest.path}: missing scored segments: {', '.join(missing_segments)}"
        )
    invalid_compliance = {
        segment_id: compliance.get(segment_id, "missing")
        for segment_id in required_segments
        if compliance.get(segment_id) not in {"yes", "partial", "no"}
    }
    if invalid_compliance:
        raise ValueError(
            f"{recording.manifest.path}: missing/invalid compliance: {invalid_compliance}"
        )
    results: list[SegmentResult] = []
    coverage: list[CoverageResult] = []

    for segment_id, frames in grouped_frames.items():
        segment_compliance = compliance.get(segment_id, "missing")
        metrics = [compute_posture_metrics(frame, width, height) for frame in frames]
        poses = [decode_head_pose(frame.get("m")) for frame in frames]
        coverage.append(
            CoverageResult(
                participant_id=recording.manifest.participant_id,
                condition=recording.manifest.condition,
                azimuth_deg=finite_number(recording.header["meta"]["camera"]["azimuthDeg"]),
                segment_id=segment_id,
                compliance=segment_compliance,
                frames=len(frames),
                posture_coverage=sum(metric is not None for metric in metrics) / len(frames),
                attention_coverage=sum(pose is not None for pose in poses) / len(frames),
            )
        )

        if segment_compliance != "yes":
            continue

        timestamps = [int(frame["t"]) for frame in frames]
        classifiers: list[tuple[str, str, str | None, list[str | None], list[bool]]] = []

        if segment_id in POSTURE_REFERENCES:
            classifiers.extend(
                [
                    (
                        "posture",
                        "A_generic_roll",
                        POSTURE_REFERENCES[segment_id],
                        [classify_posture_arm_a(value) for value in metrics],
                        [value is not None for value in metrics],
                    ),
                    (
                        "posture",
                        "B_calibrated_roll",
                        POSTURE_REFERENCES[segment_id],
                        [classify_posture_arm_b(value, roll_baseline) for value in metrics],
                        [value is not None for value in metrics],
                    ),
                    (
                        "posture",
                        "C_calibrated_full",
                        POSTURE_REFERENCES[segment_id],
                        [classify_posture_arm_c(value, profile) for value in metrics],
                        [value is not None for value in metrics],
                    ),
                ]
            )

        if segment_id in ATTENTION_REFERENCES:
            classifiers.extend(
                [
                    (
                        "attention",
                        "generic",
                        ATTENTION_REFERENCES[segment_id],
                        [classify_attention_generic(value) for value in poses],
                        [value is not None for value in poses],
                    ),
                    (
                        "attention",
                        "calibrated",
                        ATTENTION_REFERENCES[segment_id],
                        [classify_attention_calibrated(value, stored_yaw, stored_pitch) for value in poses],
                        [value is not None for value in poses],
                    ),
                ]
            )

        for detector, arm, reference, raw_states, input_available in classifiers:
            if reference is None:
                continue
            results.append(
                make_segment_result(
                    recording,
                    detector,
                    arm,
                    "raw",
                    segment_id,
                    reference,
                    segment_compliance,
                    raw_states,
                    input_available,
                )
            )
            results.append(
                make_segment_result(
                    recording,
                    detector,
                    arm,
                    "smoothed",
                    segment_id,
                    reference,
                    segment_compliance,
                    smooth_states(raw_states, timestamps),
                    input_available,
                )
            )

    return results, coverage, parity


def mean_optional(values: Iterable[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return statistics.fmean(present) if present else None


def aggregate_participant_results(segment_results: Sequence[SegmentResult]) -> list[JsonObject]:
    grouped: dict[tuple[str, str, str, str, str], list[SegmentResult]] = {}
    for row in segment_results:
        key = (row.participant_id, row.condition, row.detector, row.arm, row.smoothing)
        grouped.setdefault(key, []).append(row)

    output: list[JsonObject] = []
    for key, rows in sorted(grouped.items()):
        participant_id, condition, detector, arm, smoothing = key
        # Each segment contributes a total probability mass of one, regardless of held duration.
        tp = sum(row.true_positive_rate for row in rows)
        fp = sum(
            value
            for value in (row.false_positive_rate for row in rows)
            if value is not None
        )
        tn = sum(
            value
            for value in (row.true_negative_rate for row in rows)
            if value is not None
        )
        fn = sum(row.false_negative_rate for row in rows)
        precision = tp / (tp + fp) if tp + fp > 0 else None
        recall = tp / (tp + fn) if tp + fn > 0 else None
        f1 = (
            2.0 * precision * recall / (precision + recall)
            if precision is not None and recall is not None and precision + recall > 0
            else None
        )
        output.append(
            {
                "participantId": participant_id,
                "condition": condition,
                "azimuthDeg": rows[0].azimuth_deg,
                "detector": detector,
                "arm": arm,
                "smoothing": smoothing,
                "scoredSegments": len(rows),
                "falseAlarmRate": mean_optional(row.false_alarm_rate for row in rows),
                "missRate": mean_optional(row.miss_rate for row in rows),
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "validCoverage": statistics.fmean(1.0 - row.unavailable_rate for row in rows),
                "unavailableRate": statistics.fmean(row.unavailable_rate for row in rows),
                "tpMass": tp,
                "fpMass": fp,
                "tnMass": tn,
                "fnMass": fn,
            }
        )
    return output


def aggregate_summary(
    participant_results: Sequence[JsonObject],
    cohort: str,
) -> list[JsonObject]:
    grouped: dict[tuple[str, str, str, str], list[JsonObject]] = {}
    for row in participant_results:
        key = (str(row["condition"]), str(row["detector"]), str(row["arm"]), str(row["smoothing"]))
        grouped.setdefault(key, []).append(row)

    metrics = (
        "falseAlarmRate",
        "missRate",
        "precision",
        "recall",
        "f1",
        "validCoverage",
    )
    output: list[JsonObject] = []
    for key, rows in sorted(grouped.items()):
        condition, detector, arm, smoothing = key
        result: JsonObject = {
            "cohort": cohort,
            "condition": condition,
            "detector": detector,
            "arm": arm,
            "smoothing": smoothing,
            "participants": len(rows),
        }
        for metric in metrics:
            values = [finite_number(row[metric]) for row in rows if row[metric] is not None]
            result[f"{metric}Median"] = float(statistics.median(values)) if values else None
            result[f"{metric}Min"] = min(values) if values else None
            result[f"{metric}Max"] = max(values) if values else None
        output.append(result)
    return output


def paired_differences(participant_results: Sequence[JsonObject]) -> list[JsonObject]:
    by_key = {
        (
            str(row["participantId"]),
            str(row["condition"]),
            str(row["detector"]),
            str(row["arm"]),
            str(row["smoothing"]),
        ): row
        for row in participant_results
    }
    comparisons = (
        ("posture", "B_minus_A", "B_calibrated_roll", "A_generic_roll"),
        ("posture", "C_minus_B", "C_calibrated_full", "B_calibrated_roll"),
        ("attention", "calibrated_minus_generic", "calibrated", "generic"),
    )
    participants = sorted({str(row["participantId"]) for row in participant_results})
    conditions = sorted({str(row["condition"]) for row in participant_results})
    smoothing_modes = sorted({str(row["smoothing"]) for row in participant_results})
    output: list[JsonObject] = []

    for participant_id in participants:
        for condition in conditions:
            for smoothing in smoothing_modes:
                for detector, comparison, left_arm, right_arm in comparisons:
                    left = by_key.get((participant_id, condition, detector, left_arm, smoothing))
                    right = by_key.get((participant_id, condition, detector, right_arm, smoothing))
                    if left is None or right is None:
                        continue
                    output.append(
                        {
                            "participantId": participant_id,
                            "condition": condition,
                            "detector": detector,
                            "comparison": comparison,
                            "smoothing": smoothing,
                            "falseAlarmRateDifference": finite_number(left["falseAlarmRate"])
                            - finite_number(right["falseAlarmRate"]),
                            "missRateDifference": finite_number(left["missRate"])
                            - finite_number(right["missRate"]),
                            "precisionDifference": finite_number(left["precision"])
                            - finite_number(right["precision"]),
                            "recallDifference": finite_number(left["recall"])
                            - finite_number(right["recall"]),
                            "f1Difference": finite_number(left["f1"]) - finite_number(right["f1"]),
                            "coverageDifference": finite_number(left["validCoverage"])
                            - finite_number(right["validCoverage"]),
                        }
                    )
    return output


def csv_value(value: Any) -> Any:
    if isinstance(value, float):
        return f"{value:.8f}"
    return "" if value is None else value


def write_dict_csv(path: Path, rows: Sequence[JsonObject]) -> None:
    if not rows:
        raise ValueError(f"refusing to write empty result: {path}")
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({name: csv_value(row.get(name)) for name in fieldnames})


def segment_result_dict(row: SegmentResult) -> JsonObject:
    return {
        "participantId": row.participant_id,
        "condition": row.condition,
        "azimuthDeg": row.azimuth_deg,
        "detector": row.detector,
        "arm": row.arm,
        "smoothing": row.smoothing,
        "segmentId": row.segment_id,
        "reference": row.reference,
        "referenceAlarm": row.reference_alarm,
        "compliance": row.compliance,
        "frames": row.frames,
        "availableFrames": row.available_frames,
        "alarmFrames": row.alarm_frames,
        "stateCounts": row.state_counts,
        "falseAlarmRate": row.false_alarm_rate,
        "missRate": row.miss_rate,
        "truePositiveRate": row.true_positive_rate,
        "falsePositiveRate": row.false_positive_rate,
        "trueNegativeRate": row.true_negative_rate,
        "falseNegativeRate": row.false_negative_rate,
        "unavailableRate": row.unavailable_rate,
    }


def coverage_result_dict(row: CoverageResult) -> JsonObject:
    return {
        "participantId": row.participant_id,
        "condition": row.condition,
        "azimuthDeg": row.azimuth_deg,
        "segmentId": row.segment_id,
        "compliance": row.compliance,
        "frames": row.frames,
        "postureCoverage": row.posture_coverage,
        "attentionCoverage": row.attention_coverage,
    }


def percent(value: Any) -> str:
    return "—" if value is None else f"{100.0 * finite_number(value):.1f}%"


def format_range(
    row: JsonObject,
    metric: str,
    formatter: Callable[[Any], str],
) -> str:
    return (
        f"{formatter(row[f'{metric}Median'])} "
        f"[{formatter(row[f'{metric}Min'])}, {formatter(row[f'{metric}Max'])}]"
    )


def signed_percent(value: Any) -> str:
    if value is None:
        return "—"
    return f"{100.0 * finite_number(value):+.1f} pp"


def median_range(values: Sequence[float]) -> tuple[float, float, float]:
    if not values:
        raise ValueError("cannot summarize an empty value sequence")
    return float(statistics.median(values)), min(values), max(values)


def primary_comparison_svg(participant_results: Sequence[JsonObject]) -> str:
    """Render participant dots plus median/range for the primary smoothed comparison."""

    smoothed = [row for row in participant_results if row["smoothing"] == "smoothed"]
    participants = sorted({str(row["participantId"]) for row in smoothed})
    participant_colours = {
        "P1": "#0072B2",
        "P2": "#E69F00",
        "P3": "#009E73",
        "P4": "#CC79A7",
    }
    arm_labels = {
        "A_generic_roll": "A roll",
        "B_calibrated_roll": "B roll",
        "C_calibrated_full": "C full",
        "generic": "Generic",
        "calibrated": "Calibrated",
    }
    detector_arms = {
        "posture": ["A_generic_roll", "B_calibrated_roll", "C_calibrated_full"],
        "attention": ["generic", "calibrated"],
    }
    conditions = [("A_frontal", "Frontal"), ("B_offaxis", "Off-axis")]
    panels = [
        ("posture", "falseAlarmRate", "Posture — false-alarm rate"),
        ("posture", "missRate", "Posture — miss rate"),
        ("attention", "falseAlarmRate", "Screen-facing — false-alarm rate"),
        ("attention", "missRate", "Screen-facing — miss rate"),
    ]
    row_lookup = {
        (
            str(row["participantId"]),
            str(row["condition"]),
            str(row["detector"]),
            str(row["arm"]),
        ): row
        for row in smoothed
    }

    width = 1480
    height = 940
    panel_width = 680
    panel_height = 330
    panel_positions = [(50, 130), (750, 130), (50, 500), (750, 500)]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" '
        'aria-labelledby="title description">',
        '<title id="title">Primary generic versus calibrated comparison</title>',
        '<desc id="description">Participant-level false-alarm and miss rates for posture and '
        'screen-facing classification in frontal and off-axis conditions.</desc>',
        '<rect width="100%" height="100%" fill="#FFFFFF"/>',
        '<style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#17202A}'
        '.panel-title{font-size:20px;font-weight:700}.tick{font-size:12px;fill:#4B5563}'
        '.xlabel{font-size:12px;font-weight:600}.note{font-size:13px;fill:#4B5563}'
        '.legend{font-size:13px}</style>',
        '<text x="50" y="48" font-size="28" font-weight="750">Primary comparison '
        '(1.5-second dwell, N=4)</text>',
        '<text x="50" y="76" class="note">Each dot is one participant; the black diamond is '
        'the median and the vertical line is the full P1–P4 range.</text>',
    ]

    legend_x = 850
    for index, participant in enumerate(participants):
        x = legend_x + index * 105
        colour = participant_colours.get(participant, "#6B7280")
        parts.append(f'<circle cx="{x}" cy="67" r="5" fill="{colour}"/>')
        parts.append(
            f'<text x="{x + 10}" y="72" class="legend">{html.escape(participant)}</text>'
        )
    parts.extend(
        [
            '<polygon points="1290,61 1296,67 1290,73 1284,67" fill="#111827"/>',
            '<text x="1302" y="72" class="legend">median</text>',
        ]
    )

    participant_jitter = {
        participant: -15 + index * (30 / max(1, len(participants) - 1))
        for index, participant in enumerate(participants)
    }

    for panel_index, (detector, metric, title) in enumerate(panels):
        panel_x, panel_y = panel_positions[panel_index]
        plot_left = panel_x + 58
        plot_top = panel_y + 44
        plot_width = panel_width - 78
        plot_height = panel_height - 112
        parts.append(
            f'<rect x="{panel_x}" y="{panel_y}" width="{panel_width}" height="{panel_height}" '
            'rx="10" fill="#FAFBFC" stroke="#D9E0E7"/>'
        )
        parts.append(
            f'<text x="{panel_x + 20}" y="{panel_y + 29}" class="panel-title">'
            f'{html.escape(title)}</text>'
        )

        for tick in (0.0, 0.25, 0.5, 0.75, 1.0):
            y = plot_top + plot_height * (1.0 - tick)
            parts.append(
                f'<line x1="{plot_left}" y1="{y:.2f}" x2="{plot_left + plot_width}" '
                f'y2="{y:.2f}" stroke="#E2E8F0"/>'
            )
            parts.append(
                f'<text x="{plot_left - 9}" y="{y + 4:.2f}" text-anchor="end" class="tick">'
                f'{int(tick * 100)}%</text>'
            )

        groups: list[tuple[str, str, str]] = []
        for condition, condition_label in conditions:
            for arm in detector_arms[detector]:
                groups.append((condition, condition_label, arm))

        group_width = plot_width / len(groups)
        for group_index, (condition, condition_label, arm) in enumerate(groups):
            centre_x = plot_left + group_width * (group_index + 0.5)
            values: list[float] = []
            for participant in participants:
                row = row_lookup[(participant, condition, detector, arm)]
                values.append(finite_number(row[metric]))
            median_value, minimum, maximum = median_range(values)

            def value_y(value: float) -> float:
                bounded = min(1.0, max(0.0, value))
                return plot_top + plot_height * (1.0 - bounded)

            minimum_y = value_y(minimum)
            maximum_y = value_y(maximum)
            parts.append(
                f'<line x1="{centre_x:.2f}" y1="{maximum_y:.2f}" x2="{centre_x:.2f}" '
                f'y2="{minimum_y:.2f}" stroke="#111827" stroke-width="1.5"/>'
            )
            parts.append(
                f'<line x1="{centre_x - 5:.2f}" y1="{maximum_y:.2f}" '
                f'x2="{centre_x + 5:.2f}" y2="{maximum_y:.2f}" stroke="#111827"/>'
            )
            parts.append(
                f'<line x1="{centre_x - 5:.2f}" y1="{minimum_y:.2f}" '
                f'x2="{centre_x + 5:.2f}" y2="{minimum_y:.2f}" stroke="#111827"/>'
            )
            for participant, value in zip(participants, values):
                x = centre_x + participant_jitter[participant]
                y = value_y(value)
                colour = participant_colours.get(participant, "#6B7280")
                parts.append(
                    f'<circle cx="{x:.2f}" cy="{y:.2f}" r="5.5" fill="{colour}" '
                    'stroke="#FFFFFF" stroke-width="1.5"/>'
                )
            median_y = value_y(median_value)
            parts.append(
                f'<polygon points="{centre_x:.2f},{median_y - 7:.2f} '
                f'{centre_x + 7:.2f},{median_y:.2f} {centre_x:.2f},{median_y + 7:.2f} '
                f'{centre_x - 7:.2f},{median_y:.2f}" fill="#111827"/>'
            )

            label_y = plot_top + plot_height + 24
            parts.append(
                f'<text x="{centre_x:.2f}" y="{label_y:.2f}" text-anchor="middle" '
                'class="xlabel">'
                f'<tspan x="{centre_x:.2f}">{html.escape(arm_labels[arm])}</tspan>'
                f'<tspan x="{centre_x:.2f}" dy="16" class="tick">'
                f'{html.escape(condition_label)}</tspan></text>'
            )

    parts.extend(
        [
            '<text x="50" y="894" class="note">False-alarm rates condition on an explicit '
            'normal-segment verdict; missing posture input remains visible in the coverage tables.</text>',
            '<text x="50" y="918" class="note">Thresholds are frozen engineering values. '
            'Scripted instructions are reference labels, not clinical or independently observed '
            'ground truth.</text>',
            '</svg>',
        ]
    )
    return "\n".join(parts)


def grouped_difference_rows(
    differences: Sequence[JsonObject],
    smoothing: str,
) -> list[JsonObject]:
    grouped: dict[tuple[str, str, str], list[JsonObject]] = {}
    for row in differences:
        if row["smoothing"] != smoothing:
            continue
        key = (str(row["condition"]), str(row["detector"]), str(row["comparison"]))
        grouped.setdefault(key, []).append(row)

    metrics = (
        "falseAlarmRateDifference",
        "missRateDifference",
        "precisionDifference",
        "recallDifference",
        "f1Difference",
    )
    output: list[JsonObject] = []
    for key, rows in sorted(grouped.items()):
        condition, detector, comparison = key
        result: JsonObject = {
            "condition": condition,
            "detector": detector,
            "comparison": comparison,
        }
        for metric in metrics:
            values = [finite_number(row[metric]) for row in rows]
            median_value, minimum, maximum = median_range(values)
            result[f"{metric}Median"] = median_value
            result[f"{metric}Min"] = minimum
            result[f"{metric}Max"] = maximum
        output.append(result)
    return output


def smoothing_difference_rows(participant_results: Sequence[JsonObject]) -> list[JsonObject]:
    by_key = {
        (
            str(row["participantId"]),
            str(row["condition"]),
            str(row["detector"]),
            str(row["arm"]),
            str(row["smoothing"]),
        ): row
        for row in participant_results
    }
    grouped: dict[tuple[str, str, str], list[JsonObject]] = {}
    for key, smoothed in by_key.items():
        participant_id, condition, detector, arm, smoothing = key
        if smoothing != "smoothed":
            continue
        raw = by_key[(participant_id, condition, detector, arm, "raw")]
        grouped.setdefault((condition, detector, arm), []).append(
            {
                "falseAlarmRateDifference": finite_number(smoothed["falseAlarmRate"])
                - finite_number(raw["falseAlarmRate"]),
                "missRateDifference": finite_number(smoothed["missRate"])
                - finite_number(raw["missRate"]),
                "f1Difference": finite_number(smoothed["f1"]) - finite_number(raw["f1"]),
            }
        )

    output: list[JsonObject] = []
    for key, rows in sorted(grouped.items()):
        condition, detector, arm = key
        result: JsonObject = {"condition": condition, "detector": detector, "arm": arm}
        for metric in ("falseAlarmRateDifference", "missRateDifference", "f1Difference"):
            values = [finite_number(row[metric]) for row in rows]
            median_value, minimum, maximum = median_range(values)
            result[f"{metric}Median"] = median_value
            result[f"{metric}Min"] = minimum
            result[f"{metric}Max"] = maximum
        output.append(result)
    return output


def summary_markdown(
    summary: Sequence[JsonObject],
    participant_results: Sequence[JsonObject],
    differences: Sequence[JsonObject],
    parity_rows: Sequence[JsonObject],
    held_out_participant_ids: Sequence[str],
) -> str:
    primary = [
        row
        for row in summary
        if row["smoothing"] == "smoothed" and row["cohort"] == "primary"
    ]
    participant_ids = sorted({str(row["participantId"]) for row in participant_results})
    lines = [
        "# Step 02 Result — Generic Versus Personally Calibrated Classification",
        "",
        "**Status: READY FOR REVIEW.**",
        "",
        f"Participants: **{len(participant_ids)}** ({', '.join(participant_ids)}).",
        f"Held-out pair registered separately: **{', '.join(held_out_participant_ids)}**. It is",
        "excluded from every result in this directory and will be evaluated only in the dedicated",
        "held-out stage.",
        "",
        "This is a descriptive feasibility evaluation. Values are computed per held segment, then",
        "aggregated per participant with equal segment weight. No frame-level inference, confidence",
        "interval, p-value, or participant-data threshold tuning is used.",
        "",
        "Posture unavailability is reported as lost coverage and counts as a miss during a scripted",
        "deviation. In a normal-posture segment it is excluded from the false-alarm denominator,",
        "because it is neither a false alarm nor a true negative. Attention `not_in_frame` is an",
        "alarm: it is correct for absence/look-away but a false alarm during an on-screen segment.",
        "Attention coverage includes the deliberately face-absent segment, so it describes matrix",
        "availability rather than an accuracy denominator.",
        "",
        "## Primary results (1.5-second dwell)",
        "",
        "| Condition | Detector | Arm | False alarm | Miss | Precision | Recall | F1 | Input coverage |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in primary:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row["condition"]),
                    str(row["detector"]),
                    str(row["arm"]),
                    format_range(row, "falseAlarmRate", percent),
                    format_range(row, "missRate", percent),
                    format_range(row, "precision", percent),
                    format_range(row, "recall", percent),
                    format_range(row, "f1", lambda value: f"{finite_number(value):.3f}"),
                    format_range(row, "validCoverage", percent),
                ]
            )
            + " |"
        )

    paired_summary = grouped_difference_rows(differences, "smoothed")
    lines.extend(
        [
            "",
            "## Within-participant arm differences (1.5-second dwell)",
            "",
            "Each entry is the median [minimum, maximum] of four within-participant differences.",
            "B−A isolates calibration on roll difference. C−B compares two calibrated but",
            "non-nested feature sets. Attention calibrated−generic shifts only the band origin.",
            "",
            "| Condition | Detector | Comparison | False alarm | Miss | Precision | Recall | F1 |",
            "|---|---|---|---:|---:|---:|---:|---:|",
        ]
    )
    for row in paired_summary:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row["condition"]),
                    str(row["detector"]),
                    str(row["comparison"]),
                    format_range(row, "falseAlarmRateDifference", signed_percent),
                    format_range(row, "missRateDifference", signed_percent),
                    format_range(row, "precisionDifference", signed_percent),
                    format_range(row, "recallDifference", signed_percent),
                    format_range(row, "f1Difference", lambda value: f"{finite_number(value):+.3f}"),
                ]
            )
            + " |"
        )

    smoothing_summary = smoothing_difference_rows(participant_results)
    lines.extend(
        [
            "",
            "## Effect of the 1.5-second dwell (smoothed minus raw)",
            "",
            "These are paired within-participant changes for the same arm. Negative false-alarm and",
            "miss differences are reductions; positive F1 differences are increases.",
            "",
            "| Condition | Detector | Arm | False alarm | Miss | F1 |",
            "|---|---|---|---:|---:|---:|",
        ]
    )
    for row in smoothing_summary:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row["condition"]),
                    str(row["detector"]),
                    str(row["arm"]),
                    format_range(row, "falseAlarmRateDifference", signed_percent),
                    format_range(row, "missRateDifference", signed_percent),
                    format_range(row, "f1Difference", lambda value: f"{finite_number(value):+.3f}"),
                ]
            )
            + " |"
        )

    max_median = max(finite_number(row["maxProfileMedianAbsDifference"]) for row in parity_rows)
    max_mad_relative = max(finite_number(row["maxProfileScaledMadRelativeDifference"]) for row in parity_rows)
    max_yaw = max(finite_number(row["screenYawAbsDifference"]) for row in parity_rows)
    max_pitch = max(finite_number(row["screenPitchAbsDifference"]) for row in parity_rows)
    lines.extend(
        [
            "",
            "## Independent calibration replay",
            "",
            f"- Maximum absolute stored-vs-rebuilt profile median difference: `{max_median:.6f}`.",
            f"- Maximum relative stored-vs-rebuilt scaled-MAD difference: `{100.0 * max_mad_relative:.3f}%`.",
            f"- Maximum screen-baseline yaw difference: `{max_yaw:.4f}°`.",
            f"- Maximum screen-baseline pitch difference: `{max_pitch:.4f}°`.",
            "",
            "The small non-zero residual is expected because exported landmarks are rounded to four",
            "decimal places while the stored TypeScript profile used unrounded landmarks.",
            "",
        ]
    )
    if max_mad_relative > 0.01:
        lines.extend(
            [
                "The reconstruction does not meet the metric specification's illustrative 1%",
                "scaled-MAD parity tolerance for every metric. Primary arm C therefore uses the",
                "stored TypeScript calibration profile; the independent replay is retained as an",
            "explicit audit rather than represented as bit-identical reconstruction.",
            "",
        ]
    )
    lines.extend(
        [
            "## Interpretation boundary",
            "",
            "- A reduction in false alarms is not automatically a better detector if misses rise;",
            "  both rates and the participant range must be reported together.",
            "- B−A is the posture calibration-only comparison. C−A is not calibration alone, and",
            "  C−B does not isolate adding one nested set of features.",
            "- The scripted action is an instructed reference, not independently observed or clinical",
            "  ground truth. Results measure agreement with the script.",
            "- The study measures head orientation relative to a screen-facing band, not iris gaze,",
            "  cognition, concentration, or productivity.",
            "- N=4 supports a descriptive feasibility result only. The thousands of frames are not",
            "  independent participants.",
            "- Retaining complete off-axis sessions with direction-specific model loss is a disclosed",
            "  post-N=4 exploratory amendment, not a preregistered choice.",
            "",
            "## Output files",
            "",
            "- `segment-results.csv`: auditable arm result for every scored segment.",
            "- `participant-results.csv`: participant/condition unit-of-analysis table.",
            "- `summary-results.csv`: median and range across participants.",
            "- `paired-differences.csv`: within-participant arm differences.",
            "- `coverage.csv`: model-input coverage for every captured segment.",
            "- `calibration-parity.csv`: stored-versus-independent calibration reconstruction.",
            "- `primary-comparison.svg/png`: participant dots with median and full range.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    repository_root = Path(__file__).resolve().parent.parent
    manifest_path = args.manifest if args.manifest.is_absolute() else repository_root / args.manifest
    output_path = args.output if args.output.is_absolute() else repository_root / args.output
    output_path.mkdir(parents=True, exist_ok=True)

    manifest = load_manifest(manifest_path, repository_root)
    sessions = manifest.primary_sessions
    # Registration is validated now, but held-out outcomes are deliberately not computed here.
    for held_out_session in manifest.held_out_sessions:
        load_recording(held_out_session)
    all_segment_results: list[SegmentResult] = []
    all_coverage: list[CoverageResult] = []
    all_parity: list[JsonObject] = []

    for session in sessions:
        recording = load_recording(session)
        segment_results, coverage, parity = evaluate_recording(recording)
        all_segment_results.extend(segment_results)
        all_coverage.extend(coverage)
        all_parity.append(parity)

    participant_results = aggregate_participant_results(all_segment_results)
    summary_results = aggregate_summary(participant_results, "primary")
    differences = paired_differences(participant_results)

    write_dict_csv(output_path / "segment-results.csv", [segment_result_dict(row) for row in all_segment_results])
    write_dict_csv(output_path / "participant-results.csv", participant_results)
    write_dict_csv(output_path / "summary-results.csv", summary_results)
    write_dict_csv(output_path / "paired-differences.csv", differences)
    write_dict_csv(output_path / "coverage.csv", [coverage_result_dict(row) for row in all_coverage])
    write_dict_csv(output_path / "calibration-parity.csv", all_parity)
    (output_path / "primary-comparison.svg").write_text(
        primary_comparison_svg(participant_results),
        encoding="utf-8",
    )
    (output_path / "summary.md").write_text(
        summary_markdown(
            summary_results,
            participant_results,
            differences,
            all_parity,
            sorted({session.participant_id for session in manifest.held_out_sessions}),
        ),
        encoding="utf-8",
    )

    participant_count = len({session.participant_id for session in sessions})
    print(f"evaluated {len(sessions)} sessions for {participant_count} participants")
    held_out_ids = sorted({session.participant_id for session in manifest.held_out_sessions})
    print(f"registered held-out pair(s), excluded from primary results: {', '.join(held_out_ids)}")
    print(f"wrote results to {output_path}")


if __name__ == "__main__":
    main()
