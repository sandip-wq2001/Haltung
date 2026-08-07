import type { ScriptSegment } from '../models/recording';

export const SESSION_SCRIPT_ID = 'haltung-session-v8';

export const SESSION_SCRIPT: ScriptSegment[] = [
  {
    id: 'baseline_1',
    instruction: 'Sit as you normally work and read the screen. Breathe normally; do not freeze.',
    startMs: 0,
    endMs: 48_000,
    leadInMs: 20_000,
    expectedPosture: 'within_range',
    expectedScreenFacing: 'within_screen_band',
  },

  {
    id: 'screen_top_left',
    instruction: 'Turn your head so your nose points to the top-left corner of the screen.',
    startMs: 48_000,
    endMs: 72_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'within_screen_band',
  },
  {
    id: 'screen_top_right',
    instruction: 'Turn your head so your nose points to the top-right corner of the screen.',
    startMs: 72_000,
    endMs: 96_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'within_screen_band',
  },
  {
    id: 'screen_bottom_left',
    instruction: 'Turn your head so your nose points to the bottom-left corner of the screen.',
    startMs: 96_000,
    endMs: 120_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'within_screen_band',
  },
  {
    id: 'screen_bottom_right',
    instruction: 'Turn your head so your nose points to the bottom-right corner of the screen.',
    startMs: 120_000,
    endMs: 144_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'within_screen_band',
  },
  {
    id: 'baseline_2',
    instruction: 'Return to your normal working position and read the screen.',
    startMs: 144_000,
    endMs: 192_000,
    leadInMs: 20_000,
    expectedPosture: 'within_range',
    expectedScreenFacing: 'within_screen_band',
  },

  {
    id: 'tilt_head_mild_left',
    instruction:
      'Keep your shoulders level and gently tilt your head toward your left shoulder. Keep facing the screen.',
    startMs: 192_000,
    endMs: 218_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'tilt_head_left',
    instruction:
      'Keep your shoulders level and tilt your head clearly toward your left shoulder. Keep facing the screen.',
    startMs: 218_000,
    endMs: 244_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'tilt_head_right',
    instruction:
      'Keep your shoulders level and tilt your head clearly toward your right shoulder. Keep facing the screen.',
    startMs: 244_000,
    endMs: 270_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'shoulder_left_down',
    instruction: 'Keep your head level and still. Drop only your left shoulder.',
    startMs: 270_000,
    endMs: 296_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'shoulder_right_down',
    instruction: 'Keep your head level and still. Drop only your right shoulder.',
    startMs: 296_000,
    endMs: 322_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'shoulder_left_up',
    instruction: 'Keep your head level and still. Raise only your left shoulder.',
    startMs: 322_000,
    endMs: 348_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'shoulder_right_up',
    instruction: 'Keep your head level and still. Raise only your right shoulder.',
    startMs: 348_000,
    endMs: 374_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'lean_whole_body_left',
    instruction:
      'Keep your head aligned with your shoulders and lean your whole upper body to the left.',
    startMs: 374_000,
    endMs: 400_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: null,
  },

  {
    id: 'slump',
    instruction: 'Slump down and let your head sink toward your shoulders.',
    startMs: 400_000,
    endMs: 426_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'sit_tall',
    instruction: 'Sit up as tall as you can and lengthen your neck.',
    startMs: 426_000,
    endMs: 452_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'head_slide_left',
    instruction:
      'Keep your shoulders still and level. Slide your whole head toward your left shoulder without tilting it.',
    startMs: 452_000,
    endMs: 478_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'torso_twist_left',
    instruction:
      'Keep your head facing forward. Rotate your shoulders so your upper body turns to the left.',
    startMs: 478_000,
    endMs: 504_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'bend_forward',
    instruction:
      'Bend forward from your waist and bring your head closer to the screen. Keep your hips in place.',
    startMs: 504_000,
    endMs: 530_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'bend_backward',
    instruction:
      'Bend backward from your waist and move your head away from the screen. Keep your hips in place.',
    startMs: 530_000,
    endMs: 556_000,
    leadInMs: 20_000,
    expectedPosture: 'deviation',
    expectedScreenFacing: null,
  },
  {
    id: 'baseline_3',
    instruction: 'Return to your normal working position and read the screen.',
    startMs: 556_000,
    endMs: 604_000,
    leadInMs: 20_000,
    expectedPosture: 'within_range',
    expectedScreenFacing: 'within_screen_band',
  },

  {
    id: 'phone_down',
    instruction: 'Lower your head and point your face toward the phone or keyboard.',
    startMs: 604_000,
    endMs: 628_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'outside_screen_band',
  },
  {
    id: 'look_up',
    instruction:
      'Tilt your head back and point your face toward the marked object above the screen.',
    startMs: 628_000,
    endMs: 652_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'outside_screen_band',
  },
  {
    id: 'turn_left',
    instruction: 'Turn your head to the marker on your left, beyond the edge of the screen.',
    startMs: 652_000,
    endMs: 676_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'outside_screen_band',
    allowFaceLoss: true,
  },
  {
    id: 'turn_right',
    instruction: 'Turn your head to the marker on your right, beyond the edge of the screen.',
    startMs: 676_000,
    endMs: 700_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'outside_screen_band',
    allowFaceLoss: true,
  },
  {
    id: 'face_lost',
    instruction: 'Slowly keep turning away until your face can no longer be detected.',
    startMs: 700_000,
    endMs: 728_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: null,
    allowFaceLoss: true,
  },
  {
    id: 'baseline_4',
    instruction: 'Return to your normal working position and read the screen.',
    startMs: 728_000,
    endMs: 776_000,
    leadInMs: 20_000,
    expectedPosture: 'within_range',
    expectedScreenFacing: 'within_screen_band',
  },

  {
    id: 'lean_close',
    instruction:
      'Move your whole seated position closer to the screen. Scoot the chair or move as one rigid block; do not bend forward.',
    startMs: 776_000,
    endMs: 802_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: null,
  },
  {
    id: 'lean_back',
    instruction:
      'Move your whole seated position farther from the screen. Scoot the chair or move as one rigid block; do not bend backward.',
    startMs: 802_000,
    endMs: 828_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: null,
  },
  {
    id: 'absent',
    instruction: 'Stand up and leave the frame.',
    startMs: 828_000,
    endMs: 868_000,
    leadInMs: 20_000,
    expectedPosture: null,
    expectedScreenFacing: 'not_in_frame',
  },
];

export const SCRIPT_DURATION_MS = SESSION_SCRIPT[SESSION_SCRIPT.length - 1].endMs;

export function segmentAt(elapsedMs: number): ScriptSegment | null {
  return (
    SESSION_SCRIPT.find((segment) => elapsedMs >= segment.startMs && elapsedMs < segment.endMs) ??
    null
  );
}
