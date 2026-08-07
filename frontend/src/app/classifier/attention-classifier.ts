import type { HeadPose } from './head-pose';
import { isScreenBaseline, type ScreenBaseline } from './attention-baseline';

export type ScreenFacingState = 'within_screen_band' | 'outside_screen_band' | 'not_in_frame';

const YAW_FOCUSED_DEG = 29;
const PITCH_FOCUSED_DEG = 12;

export function classifyGenericAttention(pose: HeadPose | null): ScreenFacingState {
  if (!pose) {
    return 'not_in_frame';
  }

  const withinBand =
    Math.abs(pose.yawDeg) <= YAW_FOCUSED_DEG && Math.abs(pose.pitchDeg) <= PITCH_FOCUSED_DEG;

  return withinBand ? 'within_screen_band' : 'outside_screen_band';
}

export function classifyCalibratedAttention(
  pose: HeadPose | null,
  baseline: ScreenBaseline | null,
): ScreenFacingState | null {
  if (!pose) {
    return 'not_in_frame';
  }

  if (!isScreenBaseline(baseline)) {
    return null;
  }

  const withinBand =
    Math.abs(pose.yawDeg - baseline.yawMedianDeg) <= YAW_FOCUSED_DEG &&
    Math.abs(pose.pitchDeg - baseline.pitchMedianDeg) <= PITCH_FOCUSED_DEG;

  return withinBand ? 'within_screen_band' : 'outside_screen_band';
}
