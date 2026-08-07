export interface HeadPose {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

const RAD2DEG = 180 / Math.PI;

export function decodeHeadPose(m: number[] | null): HeadPose | null {
  if (!m || m.length < 16) {
    return null;
  }

  const r = (col: number, row: number): number => m[col * 4 + row];

  const yaw = Math.atan2(-r(2, 0), r(2, 2));
  const pitch = Math.asin(Math.max(-1, Math.min(1, r(2, 1))));
  const roll = Math.atan2(-r(1, 0), r(1, 1));

  return {
    yawDeg: yaw * RAD2DEG,
    pitchDeg: pitch * RAD2DEG,
    rollDeg: roll * RAD2DEG,
  };
}
