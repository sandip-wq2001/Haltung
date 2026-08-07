import type { ScreenFacingState } from '../classifier/attention-classifier';
import type { ScreenBaseline } from '../classifier/attention-baseline';
import type { CalibrationProfile } from '../classifier/calibration-profile';

export const RECORDING_SCHEMA_VERSION = 6;

export type Condition = 'A_frontal' | 'B_offaxis';

export interface CameraGeometry {
  heightM: number;
  eyeHeightM: number;
  distanceM: number;
  azimuthDeg: number;
  screenCentreDistanceM: number;
}

export interface ScreenGeometry {
  widthM: number;
  heightM: number;
  centreHeightM: number;
  distanceM: number;
  awayMarkerOffsetM: number;
}

export interface VideoSize {
  width: number;
  height: number;
}

export interface SessionMeta {
  schemaVersion: number;
  scriptId: string;
  sessionId: string;
  participantId: string;
  condition: Condition;
  camera: CameraGeometry;
  screen: ScreenGeometry;
  video: VideoSize;
  notes: string;
}

export type Compliance = 'yes' | 'partial' | 'no';

export type PostureReference = 'within_range' | 'deviation';

export interface SegmentCompliance {
  segmentId: string;
  compliance: Compliance;
}

export interface ScriptSegment {
  id: string;
  instruction: string;
  startMs: number;
  endMs: number;
  leadInMs: number;
  expectedPosture: PostureReference | null;
  expectedScreenFacing: ScreenFacingState | null;
  allowFaceLoss?: boolean;
}

export type RecordingPhase = 'calibration' | 'session';

export interface RecordedFrame {
  phase: RecordingPhase;
  t: number;
  seg: string;
  pose: number[][] | null;
  iris: number[][] | null;
  eye: number[][] | null;
  m: number[] | null;
}

export interface RecordingHeader {
  meta: SessionMeta;
  script: ScriptSegment[];
  compliance: SegmentCompliance[];
  profile: Omit<CalibrationProfile, 'createdAt'> | null;
  screenBaseline: Omit<ScreenBaseline, 'createdAt'> | null;
}
