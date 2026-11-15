import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Callout, EmptyState, PageHead, ProgressRing, formatClock } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { Frame } from '../../pose/geometry';
import { FORM_DISCLAIMER } from '../../pose/form';
import { GRADE_LABEL, Recorder, anchorOf, compare, jointAdvice, paceNote, placeGhost, poseAt, type Anchor, type Comparison } from '../../lessons/compare';
import { addAttempt, bestScore, loadLessons, saveLessons } from '../../lessons/store';
import { LessonCamera, type LessonCameraStatus } from './LessonCamera';

type Phase = 'ready' | 'countdown' | 'live' | 'result';
const COUNTDOWN = 5;
const GRACE_MS = 1500;

export function Timeline({ values }: { values: number[] }) {
  return (
    <div className="lesson-timeline" role="img" aria-label={`Match through the lesson, from start to end: ${values.map((v) => `${v} percent`).join(', ')}`}>
      {values.map((v, i) => (
        <span key={i} className={v >= 75 ? 'good' : v >= 55 ? 'fair' : 'low'} style={{ height: `${Math.max(6, v)}%` }} />
      ))}
    </div>
  );
}

/** Student: follow the teacher's blue ghost, then see how closely you matched. */
export function PracticeLesson() {
  const { id = '' } = useParams();
  const [store, setStore] = useState(() => loadLessons());
  const lesson = useMemo(() => store.lessons.find((l) => l.id === id) ?? null, [store, id]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [camera, setCamera] = useState<LessonCameraStatus>('idle');
  const [count, setCount] = useState(COUNTDOWN);
  const [clock, setClock] = useState(0);
  const [result, setResult] = useState<{ cmp: Comparison | null; score: number | null } | null>(null);
  const phaseRef = useRef<Phase>('ready');
  const startRef = useRef(0);
  const anchorRef = useRef<Anchor>({ cx: 0.5, cy: 0.58, torso: 0.22 });
  const gotAnchor = useRef(false);
  const recRef = useRef(new Recorder());

  const finish = useCallback(() => {
    if (phaseRef.current !== 'live' || !lesson) return;
    const rec = recRef.current;
    const cmp = compare(lesson, rec, rec.offered);
    phaseRef.current = 'result';
    setPhase('result');
    setResult({ cmp, score: cmp?.score ?? null });
    if (cmp) {
      const next = addAttempt(loadLessons(), lesson.id, cmp.score);
      saveLessons(next);
      setStore(next);
    }
  }, [lesson]);

  const onFrame = useCallback(
    (frame: Frame | null, now: number, aspect: number) => {
      const a = anchorOf(frame, aspect);
      if (a) {
        const k = gotAnchor.current ? 0.15 : 1; // follow the student gently so the ghost does not jitter
        const cur = anchorRef.current;
        anchorRef.current = { cx: cur.cx + (a.cx - cur.cx) * k, cy: cur.cy + (a.cy - cur.cy) * k, torso: cur.torso + (a.torso - cur.torso) * k };
        gotAnchor.current = true;
      }
      if (phaseRef.current !== 'live' || !lesson) return;
      const t = now - startRef.current;
      recRef.current.add(frame, now, aspect);
      if (t > lesson.durationMs + GRACE_MS) finish();
    },
    [lesson, finish],
  );

  const getGhost = useCallback(
    (_frame: Frame | null, aspect: number) => {
      if (!lesson || phaseRef.current === 'result') return null;
      const t = phaseRef.current === 'live' ? performance.now() - startRef.current : 0;
      return placeGhost(poseAt(lesson, Math.max(0, Math.min(t, lesson.durationMs))), anchorRef.current, aspect);
    },
    [lesson],
  );

  const begin = () => {
    setResult(null);
    setCount(COUNTDOWN);
    phaseRef.current = 'countdown';
    setPhase('countdown');
  };

  const retry = () => {
    setResult(null);
    phaseRef.current = 'ready';
    setPhase('ready');
  };

  useEffect(() => {
    if (phase !== 'countdown') return;
    const timer = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timer);
          recRef.current = new Recorder((lesson?.durationMs ?? 0) + GRACE_MS + 3000);
          startRef.current = performance.now();
          phaseRef.current = 'live';
          setPhase('live');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, lesson]);

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => setClock(performance.now() - startRef.current), 250);
    return () => clearInterval(timer);
  }, [phase]);

  if (!lesson) {
    return (
      <EmptyState icon="camera" title="Lesson not found" action={<Link className="btn btn-primary" to="/lessons">Back to lessons</Link>}>
        It may have been deleted, or it is stored in a different browser.
      </EmptyState>
    );
  }

  const best = bestScore(store, lesson.id);
  const cmp = result?.cmp ?? null;

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHead eyebrow="Student" title={lesson.name}>
        {phase === 'result'
          ? 'Here is how closely your movement matched the teacher’s.'
          : 'Line up with the blue figure and move with it. Your own skeleton is drawn in green.'}
      </PageHead>

      {phase !== 'result' ? (
        <>
          <div className="lesson-stage">
            <LessonCamera onFrame={onFrame} getGhost={getGhost} onStatus={setCamera} />
            {phase === 'countdown' ? (
              <div className="lesson-big" aria-live="assertive">
                {count}
              </div>
            ) : null}
            {phase === 'live' ? (
              <div className="lesson-rec" aria-live="off">
                <span className="rec-dot" aria-hidden="true" /> {formatClock(Math.min(Math.floor(clock / 1000), Math.floor(lesson.durationMs / 1000)))} / {formatClock(Math.round(lesson.durationMs / 1000))}
              </div>
            ) : null}
          </div>
          <ul className="small muted lesson-tips">
            <li>Stand so your whole body is in view, the same way the teacher did. The blue figure shows the first pose while you get ready.</li>
            <li>You do not need to match the speed exactly. The score cares about the shape of each movement.</li>
          </ul>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {phase === 'ready' ? (
              <button className="btn btn-primary btn-lg" onClick={begin} disabled={camera !== 'running'}>
                <Icon name="play" /> Start (5-second countdown)
              </button>
            ) : null}
            {phase === 'countdown' ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  phaseRef.current = 'ready';
                  setPhase('ready');
                }}
              >
                Cancel
              </button>
            ) : null}
            {phase === 'live' ? (
              <button className="btn btn-primary" onClick={finish}>
                <Icon name="check" /> I’m finished
              </button>
            ) : null}
            <Link className="btn btn-ghost" to="/lessons">
              Back
            </Link>
          </div>
          {best !== null && phase === 'ready' ? <p className="small muted">Your best score on this lesson: {best}</p> : null}
        </>
      ) : cmp ? (
        <div className="card stack">
          <div className="lesson-score">
            <ProgressRing value={cmp.score} max={100} size={150} stroke={14} label={<span className="lesson-score-num">{cmp.score}</span>} sub="out of 100" />
            <div className="stack-sm">
              <h2 style={{ margin: 0 }}>{GRADE_LABEL[cmp.grade]}</h2>
              <p className="small muted">{paceNote(cmp.pace)}</p>
              {best !== null ? <p className="small muted">Best so far: {best}</p> : null}
            </div>
          </div>
          <div className="stack-sm">
            <h3>Through the lesson</h3>
            <Timeline values={cmp.timeline} />
            <div className="row-between tiny muted">
              <span>Start</span>
              <span>End</span>
            </div>
            {cmp.weakestAtMs !== null ? <p className="small">Your weakest moment was around {formatClock(Math.round(cmp.weakestAtMs / 1000))}.</p> : null}
          </div>
          <div className="stack-sm">
            <h3>{cmp.joints[0] && cmp.joints[0].score < 80 ? 'What to work on' : 'Joint by joint'}</h3>
            <ul className="lesson-joints">
              {cmp.joints.map((j) => (
                <li key={j.label}>
                  <span>{j.label}</span>
                  <span className="lesson-bar" aria-hidden="true">
                    <span style={{ width: `${j.score}%` }} />
                  </span>
                  <strong>{j.score}</strong>
                </li>
              ))}
            </ul>
            {cmp.joints.filter((j) => j.score < 80).slice(0, 3).map((j) => (
              <p key={j.label} className="small">
                {jointAdvice(j)}
              </p>
            ))}
          </div>
          {cmp.tracked < 0.7 ? (
            <Callout tone="warn" title="The camera lost you at times">
              Gaps in tracking lower the score. Try again with your whole body in view and good light.
            </Callout>
          ) : null}
          <p className="tiny muted">
            {FORM_DISCLAIMER} The score compares joint angles in 2D from one camera with the teacher’s recording. It is a practice guide, not a measure of safety.
          </p>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={retry}>
              Try again
            </button>
            <Link className="btn btn-ghost" to="/lessons">
              Back to lessons
            </Link>
          </div>
        </div>
      ) : (
        <div className="card stack">
          <Callout tone="warn" title="Not enough to score">
            The camera could not see your body clearly for long enough. Step back so your whole body fits in the picture, check the light, and try again.
          </Callout>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-primary" onClick={retry}>
              Try again
            </button>
            <Link className="btn btn-ghost" to="/lessons">
              Back to lessons
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
