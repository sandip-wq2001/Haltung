#!/usr/bin/env python3
"""Focused standard-library tests for the independent participant evaluator."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from evaluate_recordings import (
    ATTENTION_REFERENCES,
    POSTURE_REFERENCES,
    Baseline,
    HeadPose,
    ManifestSession,
    PostureMetrics,
    Recording,
    SegmentResult,
    StateSmoother,
    aggregate_participant_results,
    aggregate_summary,
    classify_attention_calibrated,
    classify_attention_generic,
    classify_magnitude,
    classify_posture_arm_a,
    classify_posture_arm_b,
    classify_posture_arm_c,
    decode_head_pose,
    fold_angle_deg,
    load_manifest,
    make_segment_result,
    paired_differences,
    primary_comparison_svg,
    robust_baseline,
)


def paired_sessions(participant_id: str) -> list[dict[str, str]]:
    return [
        {
            "participantId": participant_id,
            "condition": "A_frontal",
            "path": f"{participant_id}-A.jsonl",
        },
        {
            "participantId": participant_id,
            "condition": "B_offaxis",
            "path": f"{participant_id}-B.jsonl",
        },
    ]


class ManifestTests(unittest.TestCase):
    def test_primary_and_held_out_pairs_remain_separate(self) -> None:
        raw = {
            "primarySessions": paired_sessions("P1"),
            "heldOutSessions": paired_sessions("Author"),
        }
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "manifest.json"
            manifest_path.write_text(json.dumps(raw), encoding="utf-8")
            manifest = load_manifest(manifest_path, Path(directory))

        self.assertEqual(
            {session.participant_id for session in manifest.primary_sessions},
            {"P1"},
        )
        self.assertEqual(
            {session.participant_id for session in manifest.held_out_sessions},
            {"Author"},
        )

    def test_participant_cannot_be_primary_and_held_out(self) -> None:
        raw = {
            "primarySessions": paired_sessions("P1"),
            "heldOutSessions": paired_sessions("P1"),
        }
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "manifest.json"
            manifest_path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "primary and held-out"):
                load_manifest(manifest_path, Path(directory))


class GeometryTests(unittest.TestCase):
    def test_fold_angle_matches_typescript_boundaries(self) -> None:
        self.assertAlmostEqual(fold_angle_deg(120.0), -60.0)
        self.assertAlmostEqual(fold_angle_deg(-120.0), 60.0)
        self.assertAlmostEqual(fold_angle_deg(90.0), 90.0)

    def test_identity_matrix_decodes_zero_pose(self) -> None:
        pose = decode_head_pose(
            [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
        )
        self.assertIsNotNone(pose)
        assert pose is not None
        self.assertAlmostEqual(pose.yaw_deg, 0.0)
        self.assertAlmostEqual(pose.pitch_deg, 0.0)
        self.assertAlmostEqual(pose.roll_deg, 0.0)


class BaselineTests(unittest.TestCase):
    def test_robust_baseline_applies_floor(self) -> None:
        baseline = robust_baseline([1.0, 1.0, 1.0, 1.0], 0.5)
        self.assertEqual(baseline, Baseline(median=1.0, scaled_mad=0.5))

    def test_robust_baseline_scales_mad(self) -> None:
        baseline = robust_baseline([0.0, 1.0, 2.0], 0.1)
        self.assertAlmostEqual(baseline.median, 1.0)
        self.assertAlmostEqual(baseline.scaled_mad, 1.4826)


class ClassifierTests(unittest.TestCase):
    def test_thresholds_are_strictly_greater_than(self) -> None:
        self.assertEqual(classify_magnitude(3.0, 3.0, 7.0), "within_range")
        self.assertEqual(classify_magnitude(3.0001, 3.0, 7.0), "moderate_deviation")
        self.assertEqual(classify_magnitude(7.0001, 3.0, 7.0), "large_deviation")

    def test_attention_missing_face_is_not_in_frame(self) -> None:
        self.assertEqual(classify_attention_generic(None), "not_in_frame")
        self.assertEqual(classify_attention_calibrated(None, 10.0, 5.0), "not_in_frame")

    def test_calibration_shifts_only_the_attention_origin(self) -> None:
        pose = HeadPose(yaw_deg=35.0, pitch_deg=5.0, roll_deg=0.0)
        self.assertEqual(classify_attention_generic(pose), "outside_screen_band")
        self.assertEqual(classify_attention_calibrated(pose, 35.0, 5.0), "within_screen_band")

    def test_not_in_frame_is_alarm_but_not_available_input(self) -> None:
        recording = Recording(
            manifest=ManifestSession("P-test", "A_frontal", Path("fixture.jsonl")),
            header={"meta": {"camera": {"azimuthDeg": 0.0}}},
            frames=[],
        )
        result = make_segment_result(
            recording,
            "attention",
            "generic",
            "raw",
            "absent",
            "not_in_frame",
            "yes",
            ["not_in_frame"],
            [False],
        )
        self.assertEqual(result.alarm_frames, 1)
        self.assertEqual(result.available_frames, 0)
        self.assertEqual(result.unavailable_rate, 1.0)

    def test_all_posture_arms_keep_strict_boundaries(self) -> None:
        metrics = PostureMetrics(
            ipd=50.0,
            head_shoulder_offset_ratio=0.0,
            head_tilt_deg=3.0,
            shoulder_tilt_deg=0.0,
            head_shoulder_roll_diff=3.0,
            shoulder_width_ratio=2.0,
            ear_shoulder_vertical_ratio=1.0,
        )
        self.assertEqual(classify_posture_arm_a(metrics), "within_range")
        self.assertEqual(
            classify_posture_arm_b(metrics, Baseline(median=0.0, scaled_mad=1.2)),
            "within_range",
        )

        profile = {
            "headTiltDeg": Baseline(median=0.0, scaled_mad=1.2),
            "shoulderTiltDeg": Baseline(median=0.0, scaled_mad=1.0),
            "headShoulderOffsetRatio": Baseline(median=0.0, scaled_mad=1.0),
            "shoulderWidthRatio": Baseline(median=2.0, scaled_mad=1.0),
            "earShoulderVerticalRatio": Baseline(median=1.0, scaled_mad=1.0),
        }
        self.assertEqual(classify_posture_arm_c(metrics, profile), "within_range")

        above = PostureMetrics(**{**metrics.__dict__, "head_tilt_deg": 3.001})
        self.assertEqual(classify_posture_arm_c(above, profile), "moderate_deviation")

    def test_missing_normal_posture_is_excluded_from_false_alarm_denominator(self) -> None:
        recording = Recording(
            manifest=ManifestSession("P-test", "A_frontal", Path("fixture.jsonl")),
            header={"meta": {"camera": {"azimuthDeg": 0.0}}},
            frames=[],
        )
        result = make_segment_result(
            recording,
            "posture",
            "A_generic_roll",
            "raw",
            "baseline_1",
            "within_range",
            "yes",
            ["moderate_deviation", "within_range", None],
            [True, True, False],
        )
        self.assertEqual(result.false_alarm_rate, 0.5)
        self.assertEqual(result.false_positive_rate, 0.5)
        self.assertEqual(result.true_negative_rate, 0.5)
        self.assertAlmostEqual(result.unavailable_rate, 1.0 / 3.0)

    def test_missing_deviation_posture_counts_as_a_miss(self) -> None:
        recording = Recording(
            manifest=ManifestSession("P-test", "A_frontal", Path("fixture.jsonl")),
            header={"meta": {"camera": {"azimuthDeg": 0.0}}},
            frames=[],
        )
        result = make_segment_result(
            recording,
            "posture",
            "A_generic_roll",
            "raw",
            "tilt_head_left",
            "deviation",
            "yes",
            ["moderate_deviation", "within_range", None],
            [True, True, False],
        )
        self.assertAlmostEqual(result.miss_rate or 0.0, 2.0 / 3.0)


class AggregationTests(unittest.TestCase):
    def segment(self, segment_id: str, false_alarm_rate: float) -> SegmentResult:
        return SegmentResult(
            participant_id="P1",
            condition="A_frontal",
            azimuth_deg=0.0,
            detector="posture",
            arm="A_generic_roll",
            smoothing="raw",
            segment_id=segment_id,
            reference="within_range",
            reference_alarm=False,
            compliance="yes",
            frames=1_000 if segment_id == "long" else 1,
            available_frames=1_000 if segment_id == "long" else 1,
            alarm_frames=1_000 if false_alarm_rate == 1.0 else 0,
            state_counts="{}",
            false_alarm_rate=false_alarm_rate,
            miss_rate=None,
            true_positive_rate=0.0,
            false_positive_rate=false_alarm_rate,
            true_negative_rate=1.0 - false_alarm_rate,
            false_negative_rate=0.0,
            unavailable_rate=0.0,
        )

    def test_participant_aggregation_weights_segments_not_frames(self) -> None:
        rows = aggregate_participant_results(
            [self.segment("long", 1.0), self.segment("short", 0.0)]
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["falseAlarmRate"], 0.5)

    def test_summary_includes_precision_and_recall(self) -> None:
        participant_rows = [
            {
                "participantId": participant,
                "condition": "A_frontal",
                "detector": "posture",
                "arm": "A_generic_roll",
                "smoothing": "raw",
                "falseAlarmRate": value,
                "missRate": value,
                "precision": 1.0 - value,
                "recall": 1.0 - value,
                "f1": 1.0 - value,
                "validCoverage": 1.0,
            }
            for participant, value in (("P1", 0.1), ("P2", 0.2), ("P3", 0.3), ("P4", 0.4))
        ]
        summary = aggregate_summary(participant_rows, "primary")
        self.assertEqual(summary[0]["precisionMedian"], 0.75)
        self.assertEqual(summary[0]["recallMedian"], 0.75)

    def test_paired_differences_include_precision_and_recall(self) -> None:
        def row(arm: str, precision: float, recall: float) -> dict[str, object]:
            return {
                "participantId": "P1",
                "condition": "A_frontal",
                "detector": "posture",
                "arm": arm,
                "smoothing": "raw",
                "falseAlarmRate": 0.2,
                "missRate": 0.3,
                "precision": precision,
                "recall": recall,
                "f1": 0.7,
                "validCoverage": 1.0,
            }

        differences = paired_differences(
            [row("A_generic_roll", 0.6, 0.5), row("B_calibrated_roll", 0.8, 0.7)]
        )
        self.assertEqual(len(differences), 1)
        self.assertAlmostEqual(differences[0]["precisionDifference"], 0.2)
        self.assertAlmostEqual(differences[0]["recallDifference"], 0.2)


class ReferenceAndFigureTests(unittest.TestCase):
    def test_frozen_reference_counts(self) -> None:
        self.assertEqual(len(POSTURE_REFERENCES), 17)
        self.assertEqual(len(ATTENTION_REFERENCES), 13)
        self.assertEqual(
            sum(reference == "within_range" for reference in POSTURE_REFERENCES.values()),
            4,
        )
        self.assertEqual(
            sum(reference == "within_screen_band" for reference in ATTENTION_REFERENCES.values()),
            8,
        )

    def test_primary_figure_contains_all_participants(self) -> None:
        rows: list[dict[str, object]] = []
        for participant_index, participant in enumerate(("P1", "P2", "P3", "P4")):
            for condition in ("A_frontal", "B_offaxis"):
                for detector, arms in (
                    (
                        "posture",
                        ("A_generic_roll", "B_calibrated_roll", "C_calibrated_full"),
                    ),
                    ("attention", ("generic", "calibrated")),
                ):
                    for arm in arms:
                        rows.append(
                            {
                                "participantId": participant,
                                "condition": condition,
                                "detector": detector,
                                "arm": arm,
                                "smoothing": "smoothed",
                                "falseAlarmRate": participant_index / 10.0,
                                "missRate": participant_index / 10.0,
                            }
                        )
        svg = primary_comparison_svg(rows)
        self.assertIn("Primary comparison", svg)
        for participant in ("P1", "P2", "P3", "P4"):
            self.assertIn(f">{participant}</text>", svg)


class SmootherTests(unittest.TestCase):
    def test_first_state_commits_immediately_and_change_dwells(self) -> None:
        smoother: StateSmoother[str] = StateSmoother()
        self.assertEqual(smoother.update("within", 0), "within")
        self.assertEqual(smoother.update("outside", 100), "within")
        self.assertEqual(smoother.update("outside", 1_599), "within")
        self.assertEqual(smoother.update("outside", 1_600), "outside")

    def test_null_resets(self) -> None:
        smoother: StateSmoother[str] = StateSmoother()
        self.assertEqual(smoother.update("within", 0), "within")
        self.assertIsNone(smoother.update(None, 100))
        self.assertEqual(smoother.update("outside", 200), "outside")


if __name__ == "__main__":
    unittest.main()
