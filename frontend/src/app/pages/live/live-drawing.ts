import {
  DrawingUtils,
  FaceLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';

import type { FrameResult } from '../../models/landmarks';
import { readTiltLines, type LineReading } from '../../classifier/tilt-lines';

export { readTiltLines };
export type { LineReading, TiltLines } from '../../classifier/tilt-lines';

export type LiveFocus = 'all' | 'headTilt' | 'tiltLines';

export function drawFrame(
  frame: FrameResult,
  ctx: CanvasRenderingContext2D,
  drawingUtils: DrawingUtils,
  focus: LiveFocus = 'all',
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  if (focus === 'headTilt' || focus === 'tiltLines') {
    const lines = readTiltLines(frame, width, height);
    drawTiltLine(ctx, lines.ear, '#FACC15');

    if (focus === 'tiltLines') {
      drawTiltLine(ctx, lines.shoulder, '#4ADE80');
    }

    return;
  }

  if (frame.pose) {
    drawingUtils.drawConnectors(
      frame.pose.landmarks,
      PoseLandmarker.POSE_CONNECTIONS,
      { color: '#22C55E', lineWidth: 2 },
    );
    drawingUtils.drawLandmarks(frame.pose.landmarks, {
      color: '#15803D',
      fillColor: '#FACC15',
      lineWidth: 1,
      radius: 3,
    });
  }

  if (frame.face) {
    drawingUtils.drawConnectors(
      frame.face.landmarks,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      { color: '#22D3EE', lineWidth: 0.5 },
    );
    drawingUtils.drawConnectors(
      frame.face.landmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      { color: '#F472B6', lineWidth: 1 },
    );
    drawingUtils.drawConnectors(
      frame.face.landmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      { color: '#F472B6', lineWidth: 1 },
    );

    drawingUtils.drawConnectors(
      frame.face.landmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
      { color: '#FB923C', lineWidth: 1 },
    );
    drawingUtils.drawConnectors(
      frame.face.landmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
      { color: '#FB923C', lineWidth: 1 },
    );

    const probePoints = [468, 473, 33, 133, 159, 145, 362, 263, 386, 374]
      .filter((i) => i < frame.face!.landmarks.length)
      .map((i) => frame.face!.landmarks[i]);
    drawingUtils.drawLandmarks(probePoints, {
      color: '#FACC15',
      fillColor: '#F97316',
      lineWidth: 1,
      radius: 2,
    });
  }
}

function drawTiltLine(
  ctx: CanvasRenderingContext2D,
  reading: LineReading | null,
  lineColor: string,
): void {
  if (!reading) {
    return;
  }

  const { left, right } = reading;
  const midX = (left.x + right.x) / 2;
  const midY = (left.y + right.y) / 2;
  const reach = Math.hypot(right.x - left.x, right.y - left.y) / 2 + 80;

  ctx.save();

  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(midX - reach, midY);
  ctx.lineTo(midX + reach, midY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();

  drawDot(ctx, left.x, left.y, '#F472B6');
  drawDot(ctx, right.x, right.y, '#22D3EE');

  ctx.restore();
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0F172A';
  ctx.stroke();
}
