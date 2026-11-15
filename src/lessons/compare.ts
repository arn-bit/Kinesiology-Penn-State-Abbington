import { LM, angle, dist, mid, type Frame, type Point } from '../pose/geometry';

/**
 * Teacher lessons: a teacher's movement is recorded as a skeleton (points only, never video), and a
 * student's attempt is compared with it. This file has no browser code, so it can be tested directly.
 *
 * How the comparison works, in plain words:
 *  1. Each frame is turned into 9 joint angles (elbows, shoulders, hips, knees, trunk lean). Angles do not
 *     depend on how tall you are or how far you stand from the camera.
 *  2. The student's angles are lined up with the teacher's in time (dynamic time warping), so starting a
 *     little late or moving a little slower does not cost points.
 *  3. Each teacher moment is scored by how close the matching student angles are. The score is the average.
 */

export const LESSON_LANDMARKS = [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle] as const;
const N = LESSON_LANDMARKS.length;
const SLOT: Record<number, number> = Object.fromEntries(LESSON_LANDMARKS.map((lm, i) => [lm, i]));

export const SAMPLE_MS = 100; // 10 frames a second is plenty for body angles
export const MAX_LESSON_MS = 60_000;
export const MIN_LESSON_MS = 3_000;
export const MIN_LANDMARK_VISIBILITY = 0.5;
/** Angle differences up to this many degrees cost nothing; beyond FULL_COST_DEG they cost everything. */
export const FREE_DEG = 6;
export const FULL_COST_DEG = 46;

/** One frame, centred on the hips and scaled by torso length: 13 landmarks × (x, y, visibility). */
export type PackedFrame = number[];

export interface Lesson {
  v: 1;
  id: string;
  name: string;
  createdAt: string;
  durationMs: number;
  /** Milliseconds from the start for each frame. */
  t: number[];
  p: PackedFrame[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Pack a camera frame. `aspect` is video width ÷ height: it puts x and y in the same units so angles are true.
 * Returns null when the torso is not visible enough to trust.
 */
export function packFrame(frame: Frame | null, aspect: number): PackedFrame | null {
  if (!frame) return null;
  const core = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
  for (const i of core) if ((frame[i]?.visibility ?? 0) < MIN_LANDMARK_VISIBILITY) return null;
  const sq = (p: Point): Point => ({ x: p.x * aspect, y: p.y, visibility: p.visibility });
  const hip = mid(sq(frame[LM.leftHip]!), sq(frame[LM.rightHip]!));
  const sh = mid(sq(frame[LM.leftShoulder]!), sq(frame[LM.rightShoulder]!));
  const torso = dist(sh, hip);
  if (!Number.isFinite(torso) || torso < 0.04) return null;
  const out: number[] = [];
  for (const lm of LESSON_LANDMARKS) {
    const p = frame[lm];
    if (!p) {
      out.push(0, 0, 0);
      continue;
    }
    out.push(r3(((p.x * aspect) - hip.x) / torso), r3((p.y - hip.y) / torso), r3(Math.max(0, Math.min(1, p.visibility ?? 0))));
  }
  return out;
}

/** Where to draw a recorded pose on screen: the student's hips and torso size, so the ghost "stands" where they stand. */
export interface Anchor {
  cx: number; // image-normalised hip centre
  cy: number;
  torso: number; // torso length in height units
}

export function anchorOf(frame: Frame | null, aspect: number): Anchor | null {
  const p = packFrame(frame, aspect);
  if (!p || !frame) return null;
  const hip = mid(frame[LM.leftHip]!, frame[LM.rightHip]!);
  const sh = mid(frame[LM.leftShoulder]!, frame[LM.rightShoulder]!);
  return { cx: hip.x, cy: hip.y, torso: dist({ x: sh.x * aspect, y: sh.y }, { x: hip.x * aspect, y: hip.y }) };
}

/** A packed pose placed on screen as a sparse 33-point frame, ready to draw. */
export function placeGhost(p: PackedFrame, anchor: Anchor, aspect: number): Frame {
  const out: Point[] = [];
  LESSON_LANDMARKS.forEach((lm, i) => {
    out[lm] = { x: anchor.cx + (p[i * 3]! * anchor.torso) / aspect, y: anchor.cy + p[i * 3 + 1]! * anchor.torso, visibility: p[i * 3 + 2] };
  });
  return out;
}

// ---- angles ---------------------------------------------------------------------------------------------

export const FEATURES = [
  { id: 'l_elbow', label: 'Left elbow', pts: [LM.leftShoulder, LM.leftElbow, LM.leftWrist] },
  { id: 'r_elbow', label: 'Right elbow', pts: [LM.rightShoulder, LM.rightElbow, LM.rightWrist] },
  { id: 'l_shoulder', label: 'Left shoulder', pts: [LM.leftHip, LM.leftShoulder, LM.leftElbow] },
  { id: 'r_shoulder', label: 'Right shoulder', pts: [LM.rightHip, LM.rightShoulder, LM.rightElbow] },
  { id: 'l_hip', label: 'Left hip', pts: [LM.leftShoulder, LM.leftHip, LM.leftKnee] },
  { id: 'r_hip', label: 'Right hip', pts: [LM.rightShoulder, LM.rightHip, LM.rightKnee] },
  { id: 'l_knee', label: 'Left knee', pts: [LM.leftHip, LM.leftKnee, LM.leftAnkle] },
  { id: 'r_knee', label: 'Right knee', pts: [LM.rightHip, LM.rightKnee, LM.rightAnkle] },
] as const;
export const FEATURE_COUNT = FEATURES.length + 1; // the 8 joint angles plus trunk lean
const TRUNK = FEATURES.length;
export const TRUNK_LABEL = 'Trunk lean';

function pt(p: PackedFrame, lm: number): Point {
  const i = SLOT[lm]!;
  return { x: p[i * 3]!, y: p[i * 3 + 1]!, visibility: p[i * 3 + 2] };
}

/** Joint angles (degrees) for a packed frame; NaN where a joint was not seen well enough. */
export function featuresOf(p: PackedFrame): number[] {
  const out: number[] = [];
  for (const f of FEATURES) {
    const [a, b, c] = f.pts.map((lm) => pt(p, lm)) as [Point, Point, Point];
    const seen = [a, b, c].every((q) => (q.visibility ?? 0) >= MIN_LANDMARK_VISIBILITY);
    out.push(seen ? angle(a, b, c) : NaN);
  }
  const sh = mid(pt(p, LM.leftShoulder), pt(p, LM.rightShoulder));
  const hip = mid(pt(p, LM.leftHip), pt(p, LM.rightHip));
  // Angle of the trunk from straight up, 0–180 (sign is dropped so facing left or right counts the same).
  out.push((Math.atan2(Math.abs(sh.x - hip.x), hip.y - sh.y) * 180) / Math.PI);
  return out;
}

/** 1 for a perfect match, falling to 0 as the angle difference grows. */
export function matchScore(diffDeg: number): number {
  const d = Math.abs(diffDeg);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.min(1, 1 - (d - FREE_DEG) / (FULL_COST_DEG - FREE_DEG)));
}

/** Joints the teacher barely moves still count, but the joints doing the exercise count much more. */
export const STILL_WEIGHT = 0.15;
export const FULL_WEIGHT_RANGE_DEG = 60;

/** How much each joint matters, from how far the teacher moves it (10th to 90th percentile of its angle). */
export function jointWeights(T: number[][]): number[] {
  const w: number[] = [];
  for (let k = 0; k < FEATURE_COUNT; k++) {
    const v = T.map((row) => row[k]!).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (v.length < 5) {
      w.push(STILL_WEIGHT);
      continue;
    }
    const range = v[Math.floor(v.length * 0.9)]! - v[Math.floor(v.length * 0.1)]!;
    w.push(STILL_WEIGHT + Math.min(1, range / FULL_WEIGHT_RANGE_DEG));
  }
  return w;
}

/** Score of two feature rows: the weighted mean over joints the teacher showed. A joint the student hid scores 0. */
function frameMatch(t: number[], s: number[], w: number[]): number {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < FEATURE_COUNT; k++) {
    const a = t[k]!;
    if (!Number.isFinite(a)) continue;
    const b = s[k]!;
    sum += w[k]! * (Number.isFinite(b) ? matchScore(a - b) : 0);
    n += w[k]!;
  }
  return n === 0 ? 1 : sum / n;
}

// ---- comparing ------------------------------------------------------------------------------------------

export interface JointResult {
  label: string;
  /** 0–100 */
  score: number;
  /** Average student angle minus teacher angle, in degrees (negative = more bent / smaller angle). */
  meanDiff: number;
}

export interface Comparison {
  /** 0–100 */
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'keep_practising';
  joints: JointResult[];
  /** Score per slice of the teacher's lesson (about 40 slices), 0–100. */
  timeline: number[];
  /** Student pace compared with the teacher: 1 is the same, above 1 is slower. */
  pace: number;
  /** Where in the lesson (ms) the match was weakest, or null when nothing stood out. */
  weakestAtMs: number | null;
  /** Share of the student's frames where their body was clearly tracked, 0–1. */
  tracked: number;
}

export function gradeOf(score: number): Comparison['grade'] {
  return score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'keep_practising';
}

export const GRADE_LABEL: Record<Comparison['grade'], string> = {
  excellent: 'Excellent match',
  good: 'Good match',
  fair: 'Fair match',
  keep_practising: 'Keep practising',
};

/** Compare a student's recorded frames with the teacher's lesson. Null when there is too little to compare. */
export function compare(lesson: Pick<Lesson, 't' | 'p'>, student: { t: number[]; p: PackedFrame[] }, attempted = student.p.length): Comparison | null {
  const n = lesson.p.length;
  const m = student.p.length;
  if (n < 5 || m < 5) return null;
  const T = lesson.p.map(featuresOf);
  const S = student.p.map(featuresOf);
  const W8 = jointWeights(T);

  // Dynamic time warping with a band, so a student can start late or run slower but not wander off.
  const band = Math.max(Math.abs(n - m), Math.ceil(0.35 * Math.max(n, m))) + 2;
  const INF = 1e9;
  const cost = new Float32Array((n + 1) * (m + 1)).fill(INF);
  const W = m + 1;
  cost[0] = 0;
  for (let i = 1; i <= n; i++) {
    const centre = (i * m) / n;
    const lo = Math.max(1, Math.floor(centre - band));
    const hi = Math.min(m, Math.ceil(centre + band));
    for (let j = lo; j <= hi; j++) {
      const d = 1 - frameMatch(T[i - 1]!, S[j - 1]!, W8);
      const best = Math.min(cost[(i - 1) * W + j]!, cost[i * W + j - 1]!, cost[(i - 1) * W + j - 1]!);
      cost[i * W + j] = d + best;
    }
  }
  if (cost[n * W + m]! >= INF) return null;

  // Walk back along the cheapest path.
  const path: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const diag = cost[(i - 1) * W + j - 1]!;
    const up = cost[(i - 1) * W + j]!;
    const left = cost[i * W + j - 1]!;
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up <= left) i--;
    else j--;
  }
  path.reverse();

  // Per teacher frame: the best match among the student frames lined up with it.
  const perT: number[] = new Array(n).fill(0);
  const hit: number[] = new Array(n).fill(0);
  const jointSum: number[] = new Array(FEATURE_COUNT).fill(0);
  const jointN: number[] = new Array(FEATURE_COUNT).fill(0);
  const jointDiff: number[] = new Array(FEATURE_COUNT).fill(0);
  const jointDiffN: number[] = new Array(FEATURE_COUNT).fill(0);
  const firstJ: number[] = new Array(n).fill(-1);
  for (const [a, b] of path) {
    const s = frameMatch(T[a]!, S[b]!, W8);
    perT[a] = hit[a] ? Math.max(perT[a]!, s) : s;
    hit[a] = 1;
    if (firstJ[a]! < 0) firstJ[a] = b;
    for (let k = 0; k < FEATURE_COUNT; k++) {
      const ta = T[a]![k]!;
      if (!Number.isFinite(ta)) continue;
      const sb = S[b]![k]!;
      jointSum[k] = jointSum[k]! + (Number.isFinite(sb) ? matchScore(ta - sb) : 0);
      jointN[k] = jointN[k]! + 1;
      if (Number.isFinite(sb)) {
        jointDiff[k] = jointDiff[k]! + (sb - ta);
        jointDiffN[k] = jointDiffN[k]! + 1;
      }
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const score = Math.round(mean(perT) * 100);

  const joints: JointResult[] = [];
  for (let k = 0; k < FEATURE_COUNT; k++) {
    if (!jointN[k]) continue;
    joints.push({
      label: k === TRUNK ? TRUNK_LABEL : FEATURES[k]!.label,
      score: Math.round((jointSum[k]! / jointN[k]!) * 100),
      meanDiff: jointDiffN[k] ? Math.round((jointDiff[k]! / jointDiffN[k]!) * 10) / 10 : 0,
    });
  }
  joints.sort((a, b) => a.score - b.score);

  const slices = Math.min(40, n);
  const timeline: number[] = [];
  for (let s = 0; s < slices; s++) {
    const from = Math.floor((s * n) / slices);
    const to = Math.max(from + 1, Math.floor(((s + 1) * n) / slices));
    timeline.push(Math.round(mean(perT.slice(from, to)) * 100));
  }
  let weakest = 0;
  for (let s = 1; s < timeline.length; s++) if (timeline[s]! < timeline[weakest]!) weakest = s;
  const weakestAtMs = timeline[weakest]! < 60 && timeline[weakest]! < score - 10 ? Math.round(lesson.t[Math.floor(((weakest + 0.5) * n) / slices)] ?? 0) : null;

  // Pace: how many student frames the path spends per teacher frame, over the middle of the lesson.
  const a0 = Math.floor(n * 0.1);
  const a1 = Math.ceil(n * 0.9) - 1;
  const j0 = firstJ[a0]! >= 0 ? firstJ[a0]! : 0;
  const j1 = firstJ[a1]! >= 0 ? firstJ[a1]! : m - 1;
  const pace = a1 > a0 ? Math.max(0.2, Math.min(5, (j1 - j0) / (a1 - a0))) : 1;

  return { score, grade: gradeOf(score), joints, timeline, pace: Math.round(pace * 100) / 100, weakestAtMs, tracked: attempted > 0 ? Math.min(1, m / attempted) : 1 };
}

/** One plain sentence about a joint that was off. */
export function jointAdvice(j: JointResult): string {
  if (j.label === TRUNK_LABEL) return `Your upper body tilted differently from the teacher's (${Math.abs(Math.round(j.meanDiff))}° on average).`;
  const how = j.meanDiff < 0 ? 'more bent' : 'straighter';
  return `${j.label}: about ${Math.abs(Math.round(j.meanDiff))}° ${how} than the teacher's on average.`;
}

export function paceNote(pace: number): string {
  if (pace > 1.25) return 'You moved slower than the teacher. That is fine while learning; speed up once the shape feels right.';
  if (pace < 0.8) return 'You moved faster than the teacher. Slowing down usually helps the shape.';
  return 'Your pace matched the teacher well.';
}

// ---- recording ------------------------------------------------------------------------------------------

/** Collects a recording at a steady rate. Feed it every camera frame; it keeps about one every SAMPLE_MS. */
export class Recorder {
  readonly t: number[] = [];
  readonly p: PackedFrame[] = [];
  private startAt: number | null = null;
  private lastAt = -Infinity;
  /** Camera frames offered after the start, tracked or not. */
  offered = 0;

  constructor(private readonly maxMs = MAX_LESSON_MS) {}

  get elapsedMs() {
    return this.t.length ? this.t[this.t.length - 1]! : 0;
  }

  /** Returns false once the time limit has been reached. */
  add(frame: Frame | null, nowMs: number, aspect: number): boolean {
    if (this.startAt === null) this.startAt = nowMs;
    const t = nowMs - this.startAt;
    if (t > this.maxMs) return false;
    if (nowMs - this.lastAt < SAMPLE_MS) return true;
    this.lastAt = nowMs;
    this.offered++;
    const p = packFrame(frame, aspect);
    if (p) {
      this.t.push(Math.round(t));
      this.p.push(p);
    }
    return true;
  }

  get trackedShare() {
    return this.offered ? this.p.length / this.offered : 0;
  }
}

// ---- saving and sharing ---------------------------------------------------------------------------------

export function finishLesson(name: string, rec: Pick<Recorder, 't' | 'p'>, now = new Date()): Lesson | null {
  if (rec.p.length < 20) return null;
  const durationMs = rec.t[rec.t.length - 1]! - rec.t[0]!;
  if (durationMs < MIN_LESSON_MS) return null;
  const t0 = rec.t[0]!;
  return {
    v: 1,
    id: `l${now.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    name: name.trim().slice(0, 60) || 'Untitled lesson',
    createdAt: now.toISOString(),
    durationMs,
    t: rec.t.map((x) => x - t0),
    p: rec.p,
  };
}

/** Check a lesson from a file or from storage. Returns null for anything that is not a well-formed lesson. */
export function parseLesson(raw: unknown): Lesson | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id) || typeof o.name !== 'string' || typeof o.createdAt !== 'string') return null;
  if (!Array.isArray(o.t) || !Array.isArray(o.p) || o.t.length !== o.p.length || o.p.length < 20 || o.p.length > 700) return null;
  let last = -1;
  for (const x of o.t) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < last || x > MAX_LESSON_MS + 5000) return null;
    last = x;
  }
  for (const f of o.p) {
    if (!Array.isArray(f) || f.length !== N * 3) return null;
    for (const x of f) if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 20) return null;
  }
  const durationMs = (o.t as number[])[o.t.length - 1]! - (o.t as number[])[0]!;
  if (durationMs < MIN_LESSON_MS) return null;
  return { v: 1, id: o.id, name: o.name.slice(0, 60), createdAt: o.createdAt.slice(0, 40), durationMs, t: o.t as number[], p: o.p as PackedFrame[] };
}

/** The pose to show at time `ms` in a lesson (the latest recorded frame at or before it). */
export function poseAt(lesson: Pick<Lesson, 't' | 'p'>, ms: number): PackedFrame {
  let lo = 0;
  let hi = lesson.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lesson.t[mid]! <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lesson.p[lo]!;
}
