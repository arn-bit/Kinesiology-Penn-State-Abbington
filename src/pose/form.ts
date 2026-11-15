import type { DetectorId } from '../domain/types';
import { MIN_VISIBILITY, type Phase, type TrackingState } from './counters';
import { LM, SIDES, angle, estimateView, mid, torsoLength, vis, type Frame, type Side } from './geometry';

/**
 * Live form feedback. While someone exercises on camera, a few simple, well-understood checks look for
 * common technique slips and say so on screen (the joints are highlighted) and out loud.
 *
 * Honest limits, built into the design:
 *  - This is a single 2D camera. Angle, clothing, light and body shape change what the model sees, so every
 *    message is worded as "appears to" and offers a gentle fix, never a verdict or a medical judgement.
 *  - Thresholds are chosen to be conservative (a slip has to be clear and last about half a second) and were
 *    tuned on simulated landmarks only. They are NOT validated against coaches or motion capture.
 *  - A check only runs when every joint it needs is clearly visible, and never while tracking is unreliable.
 *  - It never nags: each tip is spoken at most twice per set, with long gaps between spoken tips.
 */

export interface FormTip {
  /** Stable id of the rule that fired. */
  id: string;
  /** On-screen text. */
  text: string;
  /** A short phrase for the voice. */
  speech: string;
  /** Landmark indices to highlight on the skeleton. */
  joints: number[];
}

export interface FormUpdate {
  /** Tips that are active right now (shown and highlighted). */
  tips: FormTip[];
  /** A tip to say out loud now, at most one, already rate-limited. */
  speak: FormTip | null;
}

interface RuleCtx {
  phase: Phase;
  side: Side;
  /** Trunk lean while at the start position, if measured yet. */
  baseTilt: number | null;
}

interface FormRule {
  id: string;
  counters: readonly DetectorId[];
  phases: readonly Phase[];
  check(f: Frame, c: RuleCtx): FormTip | null;
}

const ok = (f: Frame, idx: readonly number[]) => idx.every((i) => vis(f[i]) >= MIN_VISIBILITY);

/** Trunk lean from vertical in degrees: the line from mid-shoulder to mid-hip. */
export function trunkTilt(f: Frame): number {
  const sh = mid(f[LM.leftShoulder]!, f[LM.rightShoulder]!);
  const hp = mid(f[LM.leftHip]!, f[LM.rightHip]!);
  return (Math.atan2(Math.abs(sh.x - hp.x), Math.abs(hp.y - sh.y)) * 180) / Math.PI;
}

const TRUNK = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
const LEGS = [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];

const kneeFlex = (f: Frame, s: Side) => {
  const j = SIDES[s];
  return angle(f[j.hip]!, f[j.knee]!, f[j.ankle]!);
};

const LEG_LIFTS: readonly DetectorId[] = ['squat', 'sit_to_stand', 'step_up'];
const ARM_LIFTS: readonly DetectorId[] = ['arm_raise', 'lateral_raise', 'shoulder_press'];

export const RULES: readonly FormRule[] = [
  {
    // Front view: knees drifting inward while bending.
    id: 'knees_in',
    counters: LEG_LIFTS,
    phases: ['ready', 'bottom'],
    check(f) {
      if (!ok(f, LEGS) || estimateView(f) !== 'front') return null;
      const flexed = Math.min(kneeFlex(f, 'left'), kneeFlex(f, 'right'));
      if (!(flexed < 150)) return null;
      const kneeGap = Math.abs(f[LM.leftKnee]!.x - f[LM.rightKnee]!.x);
      const ankleGap = Math.abs(f[LM.leftAnkle]!.x - f[LM.rightAnkle]!.x);
      if (ankleGap > 0.04 && kneeGap < ankleGap * 0.75) {
        return {
          id: 'knees_in',
          text: 'Your knees appear to move inward. Try keeping them in line with your toes, if comfortable.',
          speech: 'Keep your knees in line with your toes.',
          joints: [LM.leftKnee, LM.rightKnee],
        };
      }
      return null;
    },
  },
  {
    // Side view: chest tipping well forward in a squat.
    id: 'chest_up',
    counters: ['squat'],
    phases: ['bottom'],
    check(f, c) {
      if (!ok(f, [...TRUNK, ...sideJoints(c.side)]) || estimateView(f) !== 'side') return null;
      if (!(kneeFlex(f, c.side) < 135)) return null;
      if (trunkTilt(f) > 62) {
        return {
          id: 'chest_up',
          text: 'Your chest appears to tip well forward. Try lifting your chest a little, if comfortable.',
          speech: 'Lift your chest a little.',
          joints: [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
        };
      }
      return null;
    },
  },
  {
    // Front view: upper body drifting to one side during leg work.
    id: 'side_shift',
    counters: LEG_LIFTS,
    phases: ['ready', 'bottom'],
    check(f) {
      if (!ok(f, TRUNK) || estimateView(f) !== 'front') return null;
      const sh = mid(f[LM.leftShoulder]!, f[LM.rightShoulder]!);
      const hp = mid(f[LM.leftHip]!, f[LM.rightHip]!);
      const t = torsoLength(f);
      if (t > 0.05 && Math.abs(sh.x - hp.x) / t > 0.3) {
        return {
          id: 'side_shift',
          text: 'Your upper body appears to lean to one side. Try staying centred over your hips, if comfortable.',
          speech: 'Stay centred over your hips.',
          joints: [LM.leftShoulder, LM.rightShoulder],
        };
      }
      return null;
    },
  },
  {
    // Side view: push-up or wall press-up body line.
    id: 'body_line',
    counters: ['wall_pushup'],
    phases: ['ready', 'bottom'],
    check(f, c) {
      const j = SIDES[c.side];
      if (!ok(f, [j.shoulder, j.hip, j.ankle]) || estimateView(f) !== 'side') return null;
      const sh = f[j.shoulder]!;
      const hp = f[j.hip]!;
      const an = f[j.ankle]!;
      if (!(angle(sh, hp, an) < 155)) return null;
      const horizontal = Math.abs(sh.y - an.y) < Math.abs(sh.x - an.x);
      const joints = [j.shoulder, j.hip, j.ankle];
      if (horizontal && Math.abs(an.x - sh.x) > 0.05) {
        const lineY = sh.y + ((hp.x - sh.x) / (an.x - sh.x)) * (an.y - sh.y);
        if (hp.y > lineY) {
          return { id: 'body_line', text: 'Your hips appear to drop. Try tightening your belly and glutes to keep a straight line, if comfortable.', speech: 'Lift your hips into a straight line.', joints };
        }
        return { id: 'body_line', text: 'Your hips appear high. Try lowering them into a straight line from head to heels, if comfortable.', speech: 'Lower your hips into a straight line.', joints };
      }
      return { id: 'body_line', text: 'Your tracked hips appear out of line with your shoulders and ankles. Try keeping a straight line from head to heels, if comfortable.', speech: 'Keep a straight line from head to heels.', joints };
    },
  },
  {
    // Front view: one arm higher than the other at the top of a raise or press.
    id: 'arms_uneven',
    counters: ARM_LIFTS,
    phases: ['bottom'],
    check(f) {
      if (!ok(f, [...TRUNK, LM.leftWrist, LM.rightWrist]) || estimateView(f) !== 'front') return null;
      const t = torsoLength(f);
      if (t > 0.05 && Math.abs(f[LM.leftWrist]!.y - f[LM.rightWrist]!.y) / t > 0.22) {
        return {
          id: 'arms_uneven',
          text: 'One arm appears higher than the other. Try lifting both to the same height, if comfortable.',
          speech: 'Lift both arms to the same height.',
          joints: [LM.leftWrist, LM.rightWrist],
        };
      }
      return null;
    },
  },
  {
    // Any view: upper body leaning away from where it started during an arm exercise.
    id: 'lean',
    counters: [...ARM_LIFTS, 'biceps_curl', 'band_row'],
    phases: ['ready', 'bottom'],
    check(f, c) {
      if (c.baseTilt === null || !ok(f, TRUNK)) return null;
      if (trunkTilt(f) - c.baseTilt > 14) {
        return {
          id: 'lean',
          text: 'Your upper body appears to lean as you move. Try staying tall and using a lighter effort, if comfortable.',
          speech: 'Stay tall, try not to lean.',
          joints: [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
        };
      }
      return null;
    },
  },
  {
    // Side view: elbow swinging forward in a curl.
    id: 'elbow_drift',
    counters: ['biceps_curl'],
    phases: ['ready', 'bottom'],
    check(f, c) {
      const j = SIDES[c.side];
      if (!ok(f, [...TRUNK, j.shoulder, j.elbow]) || estimateView(f) !== 'side') return null;
      const t = torsoLength(f);
      if (t > 0.05 && Math.abs(f[j.elbow]!.x - f[j.shoulder]!.x) / t > 0.4) {
        return {
          id: 'elbow_drift',
          text: 'Your elbow appears to swing forward. Try keeping it close to your side, if comfortable.',
          speech: 'Keep your elbow by your side.',
          joints: [j.shoulder, j.elbow],
        };
      }
      return null;
    },
  },
];

function sideJoints(s: Side): number[] {
  const j = SIDES[s];
  return [j.hip, j.knee, j.ankle];
}

/** Does this exercise have any form checks? */
export function formSupported(id: DetectorId | null | undefined): boolean {
  return !!id && RULES.some((r) => r.counters.includes(id));
}

/** How long a slip must last before it is shown, and how long it must be gone before it clears. */
export const FORM_TIMING = { holdMs: 500, clearMs: 1200, speakGapMs: 8000, ruleCooldownMs: 25000, maxSpokenPerRule: 2 } as const;

interface RuleState {
  badSince: number | null;
  goodSince: number | null;
  active: boolean;
  tip: FormTip | null;
  lastSpoken: number;
  spoken: number;
}

export class FormCoach {
  private readonly rules: readonly FormRule[];
  private state = new Map<string, RuleState>();
  private tilts: number[] = [];
  private baseTilt: number | null = null;
  private lastSpeakAt = -Infinity;

  constructor(counter: DetectorId | null) {
    this.rules = counter ? RULES.filter((r) => r.counters.includes(counter)) : [];
  }

  get supported(): boolean {
    return this.rules.length > 0;
  }

  reset() {
    this.state.clear();
    this.tilts = [];
    this.baseTilt = null;
    this.lastSpeakAt = -Infinity;
  }

  update(frame: Frame | null, tMs: number, snap: { tracking: TrackingState; phase: Phase; side: Side }): FormUpdate {
    if (this.rules.length === 0) return { tips: [], speak: null };
    const reliable = !!frame && snap.tracking === 'ok';
    if (!reliable || !frame) {
      // Never carry a half-formed slip across a gap in tracking, and show nothing while unsure.
      for (const s of this.state.values()) {
        s.badSince = null;
        s.goodSince = null;
        s.active = false;
        s.tip = null;
      }
      return { tips: [], speak: null };
    }

    // Learn how upright the person starts, so "leaning" means leaning away from their own start.
    if (snap.phase === 'ready' && this.baseTilt === null && ok(frame, TRUNK)) {
      this.tilts.push(trunkTilt(frame));
      if (this.tilts.length >= 10) {
        const s = [...this.tilts].sort((a, b) => a - b);
        this.baseTilt = s[Math.floor(s.length / 2)]!;
      }
    }

    const ctx: RuleCtx = { phase: snap.phase, side: snap.side, baseTilt: this.baseTilt };
    const fresh: FormTip[] = [];
    for (const rule of this.rules) {
      const st = this.state.get(rule.id) ?? { badSince: null, goodSince: null, active: false, tip: null, lastSpoken: -Infinity, spoken: 0 };
      this.state.set(rule.id, st);
      const hit = rule.phases.includes(snap.phase) ? rule.check(frame, ctx) : null;
      if (hit) {
        st.goodSince = null;
        st.badSince ??= tMs;
        st.tip = hit;
        if (!st.active && tMs - st.badSince >= FORM_TIMING.holdMs) {
          st.active = true;
          fresh.push(hit);
        }
      } else {
        st.goodSince ??= tMs;
        if (tMs - st.goodSince > 150) st.badSince = null; // a one-frame flicker does not reset a real slip
        if (st.active && tMs - st.goodSince >= FORM_TIMING.clearMs) {
          st.active = false;
          st.tip = null;
        }
      }
    }

    let speak: FormTip | null = null;
    for (const tip of fresh) {
      const st = this.state.get(tip.id)!;
      if (st.spoken >= FORM_TIMING.maxSpokenPerRule) continue;
      if (tMs - st.lastSpoken < FORM_TIMING.ruleCooldownMs) continue;
      if (tMs - this.lastSpeakAt < FORM_TIMING.speakGapMs) continue;
      speak = tip;
      st.lastSpoken = tMs;
      st.spoken++;
      this.lastSpeakAt = tMs;
      break;
    }
    const tips = [...this.state.values()].filter((s) => s.active && s.tip).map((s) => s.tip!);
    return { tips, speak };
  }
}

export const FORM_DISCLAIMER =
  'Form tips come from a single 2D camera view. Camera angle, clothing, lighting and body differences can make them wrong, and they are not a medical assessment. Stop if anything hurts.';

