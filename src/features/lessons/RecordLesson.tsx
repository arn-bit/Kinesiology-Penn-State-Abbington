import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Callout, PageHead, formatClock } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { Frame } from '../../pose/geometry';
import { MAX_LESSON_MS, MIN_LESSON_MS, Recorder, finishLesson, type Lesson } from '../../lessons/compare';
import { addLesson, loadLessons, saveLessons } from '../../lessons/store';
import { LessonCamera, type LessonCameraStatus } from './LessonCamera';
import { LessonPreview } from './LessonPreview';

type Phase = 'ready' | 'countdown' | 'recording' | 'review';
const COUNTDOWN = 5;

/** Teacher: record a movement. Only skeleton points are kept. */
export function RecordLesson() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('ready');
  const [camera, setCamera] = useState<LessonCameraStatus>('idle');
  const [count, setCount] = useState(COUNTDOWN);
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<{ lesson: Lesson; tracked: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const phaseRef = useRef<Phase>('ready');
  const recRef = useRef(new Recorder());

  const goto = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const stop = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    const rec = recRef.current;
    const lesson = finishLesson('', rec);
    phaseRef.current = 'review';
    setPhase('review');
    if (!lesson) {
      setDraft(null);
      setMessage(
        rec.elapsedMs < MIN_LESSON_MS
          ? `That was too short. A lesson needs at least ${MIN_LESSON_MS / 1000} seconds of you being tracked.`
          : 'The camera could not see your body clearly enough. Step back so your whole body fits, and try again.',
      );
      return;
    }
    setMessage(null);
    setDraft({ lesson, tracked: rec.trackedShare });
  }, []);

  const onFrame = useCallback((frame: Frame | null, now: number, aspect: number) => {
    if (phaseRef.current !== 'recording') return;
    if (!recRef.current.add(frame, now, aspect)) stop();
  }, [stop]);

  const start = () => {
    recRef.current = new Recorder();
    setDraft(null);
    setMessage(null);
    setSaveError(null);
    setCount(COUNTDOWN);
    setElapsed(0);
    goto('countdown');
  };

  const again = () => {
    setDraft(null);
    setMessage(null);
    setSaveError(null);
    goto('ready');
  };

  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(id);
          recRef.current = new Recorder();
          phaseRef.current = 'recording';
          setPhase('recording');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => setElapsed(recRef.current.elapsedMs), 200);
    return () => clearInterval(id);
  }, [phase]);

  const save = () => {
    if (!draft) return;
    const lesson = { ...draft.lesson, name: name.trim().slice(0, 60) || 'Untitled lesson' };
    const added = addLesson(loadLessons(), lesson);
    if (!added.ok) {
      setSaveError(added.reason);
      return;
    }
    if (!saveLessons(added.store)) {
      setSaveError('This browser would not store the lesson (it may be full or blocked). Try deleting an old lesson.');
      return;
    }
    navigate('/lessons');
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHead eyebrow="Teacher" title="Record a lesson">
        Show the movement once, at the pace you want students to follow. The app saves only your skeleton points, never video.
      </PageHead>

      {phase !== 'review' ? (
        <>
          <div className="lesson-stage">
            <LessonCamera onFrame={onFrame} onStatus={setCamera} />
            {phase === 'countdown' ? (
              <div className="lesson-big" aria-live="assertive">
                {count}
              </div>
            ) : null}
            {phase === 'recording' ? (
              <div className="lesson-rec" aria-live="off">
                <span className="rec-dot" aria-hidden="true" /> Recording {formatClock(Math.floor(elapsed / 1000))} / {formatClock(MAX_LESSON_MS / 1000)}
              </div>
            ) : null}
          </div>
          <ul className="small muted lesson-tips">
            <li>Stand so your whole body is in the picture, from head to feet, about 2–3 metres from the camera.</li>
            <li>Face the camera or stand side-on, and use the same view students will use.</li>
            <li>Wear clothes that show your joints, with good light in front of you.</li>
          </ul>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            {phase === 'ready' ? (
              <button className="btn btn-primary btn-lg" onClick={start} disabled={camera !== 'running'}>
                <Icon name="play" /> Start (5-second countdown)
              </button>
            ) : null}
            {phase === 'countdown' ? (
              <button className="btn btn-secondary" onClick={() => goto('ready')}>
                Cancel
              </button>
            ) : null}
            {phase === 'recording' ? (
              <button className="btn btn-primary btn-lg" onClick={stop}>
                <Icon name="check" /> Stop recording
              </button>
            ) : null}
            <Link className="btn btn-ghost" to="/lessons">
              Back
            </Link>
          </div>
        </>
      ) : (
        <div className="card stack">
          {draft ? (
            <>
              <div className="lesson-review">
                <LessonPreview lesson={draft.lesson} />
                <div className="stack-sm">
                  <label className="field">
                    <span className="label">Lesson name</span>
                    <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="For example: Bodyweight squat, 3 reps" />
                  </label>
                  <p className="small muted">
                    {formatClock(Math.round(draft.lesson.durationMs / 1000))} long · {draft.lesson.p.length} poses · your body was tracked in {Math.round(draft.tracked * 100)}% of the camera frames.
                  </p>
                </div>
              </div>
              {draft.tracked < 0.7 ? (
                <Callout tone="warn" title="The camera lost you often">
                  Students are scored against what was recorded, so gaps make the lesson less reliable. Consider re-recording with your whole body in view and better light.
                </Callout>
              ) : null}
              {saveError ? <Callout tone="danger">{saveError}</Callout> : null}
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={save}>
                  Save lesson
                </button>
                <button className="btn btn-secondary" onClick={again}>
                  Record again
                </button>
                <Link className="btn btn-ghost" to="/lessons">
                  Discard
                </Link>
              </div>
            </>
          ) : (
            <>
              <Callout tone="warn" title="Nothing saved">
                {message}
              </Callout>
              <div className="row" style={{ gap: 12 }}>
                <button className="btn btn-primary" onClick={again}>
                  Try again
                </button>
                <Link className="btn btn-ghost" to="/lessons">
                  Back
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
