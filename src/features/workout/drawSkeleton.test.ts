import { describe, expect, it } from 'vitest';
import { drawSkeleton } from './CameraTracker';
import { LM } from '../../pose/geometry';
import { makeBody } from '../../pose/testing/simulate';

/** A canvas stand-in that records what was drawn and in which colour. */
function recorder() {
  const rings: { x: number; y: number; r: number; color: string }[] = [];
  const lines: string[] = [];
  const ctx = {
    strokeStyle: '' as string,
    fillStyle: '' as string,
    lineWidth: 1,
    lineCap: '',
    clearRect() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {
      lines.push(String(this.strokeStyle));
    },
    arc(x: number, y: number, r: number) {
      rings.push({ x, y, r, color: String(this.strokeStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rings, lines };
}

describe('highlighting the joints a form tip points at', () => {
  const frame = makeBody({ view: 'front', kneeAngle: 120 });

  it('draws a bold orange ring on each flagged joint, and none when nothing is flagged', () => {
    const none = recorder();
    drawSkeleton(none.ctx, frame, 640, 480);
    expect(none.rings.filter((r) => r.color === '#ff7a2f')).toHaveLength(0);

    const flagged = recorder();
    drawSkeleton(flagged.ctx, frame, 640, 480, undefined, [LM.leftKnee, LM.rightKnee]);
    const orange = flagged.rings.filter((r) => r.color === '#ff7a2f');
    expect(orange).toHaveLength(2);
    const k = frame[LM.leftKnee]!;
    expect(orange.some((r) => Math.abs(r.x - k.x * 640) < 1 && Math.abs(r.y - k.y * 480) < 1)).toBe(true);
    expect(orange.every((r) => r.r >= 16)).toBe(true);
  });

  it('colours the line between two flagged joints, and skips joints that are not clearly visible', () => {
    const r = recorder();
    drawSkeleton(r.ctx, frame, 640, 480, undefined, [LM.leftHip, LM.leftKnee]);
    expect(r.lines).toContain('#ff7a2f');

    const hidden = makeBody({ view: 'front', kneeAngle: 120, hidden: [LM.leftKnee] });
    const h = recorder();
    drawSkeleton(h.ctx, hidden, 640, 480, undefined, [LM.leftKnee]);
    expect(h.rings.filter((x) => x.color === '#ff7a2f')).toHaveLength(0);
  });
});
