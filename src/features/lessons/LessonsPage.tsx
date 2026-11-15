import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Callout, EmptyState, PageHead, formatClock } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { addLesson, bestScore, exportLessonText, importLessonText, loadLessons, removeLesson, saveLessons, MAX_FILE_BYTES, MAX_LESSONS } from '../../lessons/store';
import type { Lesson } from '../../lessons/compare';

function download(lesson: Lesson) {
  const blob = new Blob([exportLessonText(lesson)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${lesson.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'lesson'}.verimove-lesson.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Teacher lessons: record a movement once, and let students practise against it and get a score. */
export function LessonsPage() {
  const [store, setStore] = useState(() => loadLessons());
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const commit = (next: typeof store) => {
    if (!saveLessons(next)) {
      setNote({ tone: 'warn', text: 'This browser would not store that (it may be full or blocked).' });
      return false;
    }
    setStore(next);
    return true;
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNote({ tone: 'warn', text: 'That file is too large to be a lesson.' });
      return;
    }
    const res = importLessonText(await file.text());
    if (!res.ok) {
      setNote({ tone: 'warn', text: res.reason });
      return;
    }
    const added = addLesson(store, res.lesson);
    if (!added.ok) {
      setNote({ tone: 'warn', text: added.reason });
      return;
    }
    if (commit(added.store)) setNote({ tone: 'ok', text: `Added “${res.lesson.name}”.` });
  };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <PageHead eyebrow="Teacher lessons" title="Learn a movement from a teacher">
        A teacher records a movement once. Students then follow a blue ghost of the teacher on their own camera, and the app scores how closely they matched.
      </PageHead>

      <div className="grid-2">
        <div className="card stack-sm">
          <h2 style={{ margin: 0 }}>I’m the teacher</h2>
          <p className="small muted">Record a lesson with your camera. Then share the file with students, or let them practise on this device.</p>
          <div>
            <Link className="btn btn-primary" to="/lessons/record">
              <Icon name="camera" /> Record a lesson
            </Link>
          </div>
        </div>
        <div className="card stack-sm">
          <h2 style={{ margin: 0 }}>I’m a student</h2>
          <p className="small muted">Pick a lesson below to practise it, or add a lesson file your teacher sent you.</p>
          <div>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              Add a lesson file
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} aria-label="Choose a lesson file" />
          </div>
        </div>
      </div>

      {note ? <Callout tone={note.tone}>{note.text}</Callout> : null}

      {store.lessons.length === 0 ? (
        <EmptyState icon="camera" title="No lessons yet">
          Record your first lesson, or add one a teacher shared with you.
        </EmptyState>
      ) : (
        <div className="stack-sm">
          <h2>Your lessons ({store.lessons.length}/{MAX_LESSONS})</h2>
          <ul className="lesson-list">
            {store.lessons.map((l) => {
              const best = bestScore(store, l.id);
              return (
                <li key={l.id} className="card lesson-row">
                  <div className="stack-sm" style={{ gap: 2 }}>
                    <strong>{l.name}</strong>
                    <span className="small muted">
                      {formatClock(Math.round(l.durationMs / 1000))} long · {best === null ? 'not practised yet' : `best score ${best}`}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Link className="btn btn-primary btn-sm" to={`/lessons/practice/${l.id}`}>
                      Practise
                    </Link>
                    <button className="btn btn-secondary btn-sm" onClick={() => download(l)}>
                      Share file
                    </button>
                    {confirm === l.id ? (
                      <>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            commit(removeLesson(store, l.id));
                            setConfirm(null);
                          }}
                        >
                          Delete for good
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(l.id)} aria-label={`Delete ${l.name}`}>
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Callout tone="info" title="What is saved">
        Only skeleton points (where your joints were), never video or photos. Everything stays in this browser, and a shared lesson file holds only those points. Scores are practice feedback, not medical advice.
      </Callout>
    </div>
  );
}
