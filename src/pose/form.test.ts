import { describe, expect, it } from 'vitest';
import { FORM_TIMING, FormCoach, formSupported, trunkTilt } from './form';
import { LM, type Frame, type Point } from './geometry';
import type { Phase, TrackingState } from './counters';
import { makeBody } from './testing/simulate';
import type { DetectorId } from '../domain/types';

const FRAME_MS = 33;
type Snap = { tracking: TrackingState; phase: Phase; side: 'left' | 'right' };
const snap = (phase: Phase = 'bottom', tracking: TrackingState = 'ok'): Snap => ({ tracking, phase, side: 'left' });

/** Feed `ms` of the same pose; returns every update, plus the time each one happened. */
function feed(coach: FormCoach, frame: Frame | null, ms: number, s: Snap, from = 0) {
  const out = [];
  for (let t = from; t < from + ms; t += FRAME_MS) out.push({ t, u: coach.update(frame, t, s) });
  return out;
}
const firstActive = (xs: ReturnType<typeof feed>) => xs.find((x) => x.u.tips.length > 0);
const withPoints = (f: Point[], over: Record<number, Partial<Point>>): Frame => f.map((p, i) => ({ ...p, ...(over[i] ?? {}) }));

describe('knees moving inward', () => {
  const bad = makeBody({ view: 'front', kneeAngle: 120, kneesInward: true });
  const good = makeBody({ view: 'front', kneeAngle: 120 });

  it('shows after about half a second, not before, with both knees highlighted', () => {
    const c = new FormCoach('squat');
    const xs = feed(c, bad, 2000, snap());
    const hit = firstActive(xs)!;
    expect(hit.t).toBeGreaterThanOrEqual(FORM_TIMING.holdMs);
    expect(hit.t).toBeLessThan(FORM_TIMING.holdMs + 2 * FRAME_MS);
    expect(hit.u.tips[0]!.id).toBe('knees_in');
    expect(hit.u.tips[0]!.joints).toEqual([LM.leftKnee, LM.rightKnee]);
    expect(hit.u.tips[0]!.text).toMatch(/appear/);
    expect(hit.u.tips[0]!.text).toMatch(/if comfortable/);
  });

  it('says nothing about good form', () => {
    expect(firstActive(feed(new FormCoach('squat'), good, 3000, snap()))).toBeUndefined();
  });

  it('applies to the other leg exercises too, and is silent standing straight', () => {
    expect(firstActive(feed(new FormCoach('sit_to_stand'), bad, 1500, snap()))).toBeDefined();
    expect(firstActive(feed(new FormCoach('step_up'), bad, 1500, snap()))).toBeDefined();
    const standing = makeBody({ view: 'front', kneeAngle: 175, kneesInward: true });
    expect(firstActive(feed(new FormCoach('squat'), standing, 3000, snap()))).toBeUndefined();
  });
});

describe('chest tipping forward in a squat', () => {
  it('fires for a big forward lean in side view, not for a normal one', () => {
    const lean = makeBody({ view: 'side', kneeAngle: 110, trunkLean: 72 });
    const fine = makeBody({ view: 'side', kneeAngle: 110, trunkLean: 35 });
    const hit = firstActive(feed(new FormCoach('squat'), lean, 1500, snap()))!;
    expect(hit.u.tips[0]!.id).toBe('chest_up');
    expect(firstActive(feed(new FormCoach('squat'), fine, 3000, snap()))).toBeUndefined();
  });

  it('is only for squats, and only at the bottom', () => {
    const lean = makeBody({ view: 'side', kneeAngle: 110, trunkLean: 72 });
    expect(firstActive(feed(new FormCoach('sit_to_stand'), lean, 1500, snap()))).toBeUndefined();
    expect(firstActive(feed(new FormCoach('squat'), lean, 1500, snap('ready')))).toBeUndefined();
  });
});

describe('leaning to one side', () => {
  it('fires for a clear sideways shift in front view only', () => {
    const shift = makeBody({ view: 'front', kneeAngle: 120, trunkLean: 22 });
    const straight = makeBody({ view: 'front', kneeAngle: 120, trunkLean: 4 });
    expect(firstActive(feed(new FormCoach('squat'), shift, 1500, snap()))!.u.tips.some((t) => t.id === 'side_shift')).toBe(true);
    expect(firstActive(feed(new FormCoach('squat'), straight, 3000, snap()))).toBeUndefined();
  });
});

describe('body line in a push-up', () => {
  const side = makeBody({ view: 'side', kneeAngle: 178 });
  const line = (hipY: number) =>
    withPoints(side, {
      [LM.leftShoulder]: { x: 0.2, y: 0.5 },
      [LM.rightShoulder]: { x: 0.21, y: 0.5 },
      [LM.leftHip]: { x: 0.5, y: hipY },
      [LM.rightHip]: { x: 0.51, y: hipY },
      [LM.leftAnkle]: { x: 0.8, y: 0.5 },
      [LM.rightAnkle]: { x: 0.81, y: 0.5 },
    });

  it('tells a dropping hip from a high hip, and says nothing for a straight line', () => {
    expect(firstActive(feed(new FormCoach('wall_pushup'), line(0.5), 3000, snap()))).toBeUndefined();
    const sag = firstActive(feed(new FormCoach('wall_pushup'), line(0.6), 1500, snap()))!.u.tips[0]!;
    const pike = firstActive(feed(new FormCoach('wall_pushup'), line(0.4), 1500, snap()))!.u.tips[0]!;
    expect(sag.id).toBe('body_line');
    expect(sag.text).toMatch(/drop/);
    expect(pike.text).toMatch(/high/);
    expect(sag.joints).toEqual([LM.leftShoulder, LM.leftHip, LM.leftAnkle]);
  });
});

describe('arms at different heights', () => {
  const even = makeBody({ view: 'front', shoulderAngle: 120 });
  const uneven = withPoints(even, { [LM.leftWrist]: { y: even[LM.leftWrist]!.y - 0.12 } });
  it('fires at the top of a raise when one wrist is clearly higher', () => {
    expect(firstActive(feed(new FormCoach('arm_raise'), even, 3000, snap()))).toBeUndefined();
    const hit = firstActive(feed(new FormCoach('arm_raise'), uneven, 1500, snap()))!;
    expect(hit.u.tips[0]!.id).toBe('arms_uneven');
    expect(firstActive(feed(new FormCoach('lateral_raise'), uneven, 1500, snap()))).toBeDefined();
    expect(firstActive(feed(new FormCoach('arm_raise'), uneven, 1500, snap('ready')))).toBeUndefined();
  });
});

describe('leaning away from where you started', () => {
  it('measures your own start position first, then flags a clear lean', () => {
    const c = new FormCoach('arm_raise');
    const upright = makeBody({ view: 'side', trunkLean: 3 });
    const leaning = makeBody({ view: 'side', trunkLean: 24 });
    feed(c, upright, 600, snap('ready'));
    expect(firstActive(feed(c, upright, 1500, snap('bottom'), 700))).toBeUndefined();
    const hit = firstActive(feed(c, leaning, 1500, snap('bottom'), 3000))!;
    expect(hit.u.tips[0]!.id).toBe('lean');
    expect(trunkTilt(leaning) - trunkTilt(upright)).toBeGreaterThan(14);
  });

  it('does nothing until it has seen a start position', () => {
    expect(firstActive(feed(new FormCoach('biceps_curl'), makeBody({ view: 'side', trunkLean: 30 }), 2000, snap('bottom')))).toBeUndefined();
  });
});

describe('elbow swinging forward in a curl', () => {
  const side = makeBody({ view: 'side' });
  it('fires when the elbow is well in front of the shoulder', () => {
    const drift = withPoints(side, { [LM.leftElbow]: { x: side[LM.leftShoulder]!.x + 0.14, y: side[LM.leftShoulder]!.y + 0.12 } });
    const tucked = withPoints(side, { [LM.leftElbow]: { x: side[LM.leftShoulder]!.x + 0.015, y: side[LM.leftShoulder]!.y + 0.13 } });
    expect(firstActive(feed(new FormCoach('biceps_curl'), drift, 1500, snap()))!.u.tips[0]!.id).toBe('elbow_drift');
    expect(firstActive(feed(new FormCoach('biceps_curl'), tucked, 3000, snap()))).toBeUndefined();
  });
});

describe('when to stay quiet', () => {
  const bad = makeBody({ view: 'front', kneeAngle: 120, kneesInward: true });

  it('never speaks while tracking is unreliable, and clears what it was showing', () => {
    const c = new FormCoach('squat');
    expect(firstActive(feed(c, bad, 2000, snap()))).toBeDefined();
    const lost = feed(c, bad, 500, snap('bottom', 'low_confidence'), 2100);
    expect(lost.every((x) => x.u.tips.length === 0 && x.u.speak === null)).toBe(true);
    expect(firstActive(feed(c, null, 500, snap('bottom', 'no_person'), 2700))).toBeUndefined();
  });

  it('needs every joint it uses to be clearly visible', () => {
    const hidden = makeBody({ view: 'front', kneeAngle: 120, kneesInward: true, hidden: [LM.leftKnee] });
    expect(firstActive(feed(new FormCoach('squat'), hidden, 3000, snap()))).toBeUndefined();
    const dim = makeBody({ view: 'front', kneeAngle: 120, kneesInward: true, visibility: 0.4 });
    expect(firstActive(feed(new FormCoach('squat'), dim, 3000, snap()))).toBeUndefined();
  });

  it('ignores exercises without form checks, and the idle phase', () => {
    expect(new FormCoach('march').supported).toBe(false);
    expect(new FormCoach(null).supported).toBe(false);
    expect(new FormCoach('march').update(bad, 0, snap()).tips).toEqual([]);
    expect(firstActive(feed(new FormCoach('squat'), bad, 2000, snap('idle')))).toBeUndefined();
    expect(formSupported('squat')).toBe(true);
    expect(formSupported('wall_pushup')).toBe(true);
    expect(formSupported('hold_one_leg' as DetectorId)).toBe(false);
    expect(formSupported(null)).toBe(false);
  });

  it('keeps showing a real slip through a one-frame flicker, then clears after it has really gone', () => {
    const good = makeBody({ view: 'front', kneeAngle: 120 });
    const c = new FormCoach('squat');
    let t = 0;
    feed(c, bad, 800, snap(), t);
    t += 800;
    expect(c.update(good, t, snap()).tips.length).toBe(1); // one good frame: still showing
    t += FRAME_MS;
    const b = feed(c, bad, 400, snap(), t);
    expect(b.every((x) => x.u.tips.length === 1)).toBe(true);
    t += 400;
    const gone = feed(c, good, 2000, snap(), t);
    expect(gone[0]!.u.tips.length).toBe(1);
    expect(gone.at(-1)!.u.tips.length).toBe(0);
  });
});

describe('speaking', () => {
  const bad = makeBody({ view: 'front', kneeAngle: 120, kneesInward: true });
  const good = makeBody({ view: 'front', kneeAngle: 120 });
  const spokenIn = (xs: ReturnType<typeof feed>) => xs.filter((x) => x.u.speak).map((x) => x.t);

  it('says a tip once when it first appears, with a short phrase', () => {
    const xs = feed(new FormCoach('squat'), bad, 6000, snap());
    expect(spokenIn(xs)).toHaveLength(1);
    expect(xs.find((x) => x.u.speak)!.u.speak!.speech).toBe('Keep your knees in line with your toes.');
  });

  it('repeats a tip only after a long cooldown, at most twice per set', () => {
    const c = new FormCoach('squat');
    let t = 0;
    const spokenAt: number[] = [];
    for (let round = 0; round < 5; round++) {
      spokenAt.push(...spokenIn(feed(c, bad, 2000, snap(), t)));
      t += 2000;
      feed(c, good, 2000, snap(), t); // gone for a while, then it slips again
      t += 2000 + 20000;
    }
    expect(spokenAt).toHaveLength(FORM_TIMING.maxSpokenPerRule);
    expect(spokenAt[1]! - spokenAt[0]!).toBeGreaterThanOrEqual(FORM_TIMING.ruleCooldownMs);
  });

  it('never speaks two tips close together', () => {
    // A leaning, knees-in squat can trigger two rules at once: only one is spoken.
    const both = makeBody({ view: 'front', kneeAngle: 120, kneesInward: true, trunkLean: 22 });
    const xs = feed(new FormCoach('squat'), both, 4000, snap());
    expect(xs.filter((x) => x.u.tips.length >= 2).length).toBeGreaterThan(0);
    expect(spokenIn(xs)).toHaveLength(1);
  });

  it('starts fresh for a new set', () => {
    const c = new FormCoach('squat');
    feed(c, bad, 2000, snap());
    c.reset();
    expect(spokenIn(feed(c, bad, 2000, snap(), 100000))).toHaveLength(1);
  });
});
