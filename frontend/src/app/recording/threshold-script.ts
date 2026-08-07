export const THRESHOLD_SCRIPT_ID = 'haltung-threshold-v1';

export interface ThresholdPose {
  id: string;
  instruction: string;
  settleMs: number;
  captureMs: number;
  group: 'head' | 'iris';
}

const SETTLE_MS = 10_000;
const CAPTURE_MS = 4_000;

export const THRESHOLD_SCRIPT: ThresholdPose[] = [
  {
    id: 'rest',
    instruction: 'Work normally, looking at your screen.',
    settleMs: SETTLE_MS,
    captureMs: 15_000,
    group: 'head',
  },
  {
    id: 'screen_top_left',
    instruction: 'Look at the top left corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'screen_top_right',
    instruction: 'Look at the top right corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'screen_bottom_left',
    instruction: 'Look at the bottom left corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'screen_bottom_right',
    instruction: 'Look at the bottom right corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'phone_down',
    instruction: 'Look down at your phone or keyboard.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'look_up',
    instruction: 'Look up at the marked object above your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'turn_left',
    instruction: 'Turn your head to look at the marked object on your left.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'turn_right',
    instruction: 'Turn your head to look at the marked object on your right.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'head',
  },
  {
    id: 'face_lost',
    instruction: 'Slowly keep turning away until your face can no longer be detected.',
    settleMs: SETTLE_MS,
    captureMs: 8_000,
    group: 'head',
  },

  {
    id: 'eyes_screen',
    instruction: 'Hold your head still facing the screen. Look at the centre of the screen.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },

  {
    id: 'eyes_top_left',
    instruction: 'Keep your head still. Move only your eyes to the top left corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'eyes_top_right',
    instruction: 'Keep your head still. Move only your eyes to the top right corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'eyes_bottom_left',
    instruction:
      'Keep your head still. Move only your eyes to the bottom left corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'eyes_bottom_right',
    instruction:
      'Keep your head still. Move only your eyes to the bottom right corner of your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },

  {
    id: 'eyes_left',
    instruction: 'Keep your head still. Move only your eyes to look at the marked object on your left.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'eyes_right',
    instruction: 'Keep your head still. Move only your eyes to look at the marked object on your right.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'eyes_up',
    instruction: 'Keep your head still. Move only your eyes to look at the marked object above your monitor.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'eyes_down',
    instruction: 'Keep your head still. Move only your eyes down to your keyboard.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
  {
    id: 'head_away_eyes_screen',
    instruction: 'Turn your head away to one side, but keep your eyes on the screen.',
    settleMs: SETTLE_MS,
    captureMs: CAPTURE_MS,
    group: 'iris',
  },
];

export const THRESHOLD_TOTAL_MS = THRESHOLD_SCRIPT.reduce(
  (total, pose) => total + pose.settleMs + pose.captureMs,
  0,
);
