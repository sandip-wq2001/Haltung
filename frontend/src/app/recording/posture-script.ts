export const POSTURE_SCRIPT_ID = 'haltung-posture-v4';

export interface PosturePose {
  id: string;
  instruction: string;
  settleMs: number;
  captureMs: number;
  group:
    | 'baseline'
    | 'head'
    | 'shoulder'
    | 'both'
    | 'vertical'
    | 'lateral'
    | 'rotation'
    | 'distance'
    | 'bend';
}

const SETTLE_MS = 15_000;
const CAPTURE_MS = 6_000;

export const POSTURE_SCRIPT: PosturePose[] = [
  {
    id: 'rest',
    instruction: 'Sit and work normally. Do not correct your posture.',
    settleMs: SETTLE_MS,
    captureMs: 15_000,
    group: 'baseline',
  },
  {
    id: 'tilt_head_mild',
    instruction: 'Tilt your head only slightly towards one shoulder. Just a small, everyday tilt.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'tilt_head_left',
    instruction: 'Tilt your head towards your left shoulder. Keep your shoulders level.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'tilt_head_right',
    instruction: 'Tilt your head towards your right shoulder. Keep your shoulders level.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'shoulder_left_down',
    instruction: 'Drop your left shoulder. Keep your head level.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'shoulder',
  },
  {
    id: 'shoulder_right_down',
    instruction: 'Drop your right shoulder. Keep your head level.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'shoulder',
  },
  {
    id: 'lean_whole_body',
    instruction:
      'Keeping your head in line with your shoulders, lean your whole upper body to one side.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'both',
  },
  {
    id: 'slump',
    instruction: 'Slump down. Let your head sink towards your shoulders.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'vertical',
  },
  {
    id: 'sit_tall',
    instruction: 'Sit up as tall as you can. Lengthen your neck.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'vertical',
  },
  {
    id: 'head_slide',
    instruction:
      'Slide your head sideways over one shoulder. Keep your shoulders still and your head level.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'lateral',
  },
  {
    id: 'torso_twist',
    instruction: 'Twist your upper body to one side. Keep your head facing the screen.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'rotation',
  },
  {
    id: 'lean_close',
    instruction:
      'Move your whole seated position closer to the screen - scoot the chair, or shift as one rigid block. Do not bend forward.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'distance',
  },
  {
    id: 'lean_back',
    instruction:
      'Move your whole seated position back, away from the screen - scoot the chair, or shift as one rigid block. Do not bend backward.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'distance',
  },
  {
    id: 'bend_forward',
    instruction:
      'Bend forward from your waist, bringing your head closer to the screen. Keep your hips and shoulders where they are.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'bend',
  },
  {
    id: 'bend_backward',
    instruction:
      'Bend backward from your waist, moving your head away from the screen. Keep your hips and shoulders where they are.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'bend',
  },
];

export const POSTURE_TOTAL_MS = POSTURE_SCRIPT.reduce(
  (total, pose) => total + pose.settleMs + pose.captureMs,
  0,
);
