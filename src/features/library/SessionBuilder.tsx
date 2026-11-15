import { useMemo } from 'react';
import { getExercise } from '../../domain/exercises/library';
import { TRY_LIMITS, TRY_SETS, buildTrySession, type TryOverride } from '../../domain/plan/engine';
import type { Constraints, Prescription, Profile } from '../../domain/types';
import { Stepper, formatDuration } from '../../components/ui';
import { Icon } from '../../components/Icon';

export type Custom = Record<string, TryOverride>;

/** Your own free-play session: the exercises you picked, in order, with the sets and reps (or seconds) you want. */
export function SessionBuilder({
  picked,
  custom,
  onCustom,
  onMove,
  onRemove,
  profile,
  constraints,
}: {
  picked: string[];
  custom: Custom;
  onCustom: (c: Custom) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onRemove: (id: string) => void;
  profile: Profile;
  constraints: Constraints;
}) {
  // The usual numbers for each exercise, so "reset" and the starting values are never invented here.
  const defaults = useMemo(() => {
    const out: Record<string, Prescription> = {};
    for (const id of picked) {
      const s = buildTrySession([id], profile, constraints);
      if (s) out[id] = s.items[0]!.prescription;
    }
    return out;
  }, [picked, profile, constraints]);
  const preview = useMemo(() => buildTrySession(picked, profile, constraints, custom), [picked, profile, constraints, custom]);

  const set = (id: string, patch: TryOverride) => onCustom({ ...custom, [id]: { ...custom[id], ...patch } });

  return (
    <section className="card stack" aria-labelledby="builder-h">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 id="builder-h">Your session</h2>
        {preview ? <span className="small muted">About {formatDuration(preview.estSeconds)} · {preview.items.length} exercise{preview.items.length === 1 ? '' : 's'}</span> : null}
      </div>
      <p className="small muted">Set how many sets and reps you want for each exercise, and put them in the order you like. Starting numbers are the app’s usual ones. They are yours to change; stop if anything hurts.</p>
      <ol className="lib-builder">
        {picked.map((id, i) => {
          const ex = getExercise(id);
          const d = defaults[id];
          if (!ex || !d) return null;
          const lim = TRY_LIMITS[d.kind];
          const sets = custom[id]?.sets ?? d.sets;
          const amount = custom[id]?.amount ?? d.amount;
          const changed = sets !== d.sets || amount !== d.amount;
          return (
            <li key={id} className="lib-builder-row">
              <div className="row-between" style={{ gap: 8, alignItems: 'flex-start' }}>
                <strong>
                  {i + 1}. {ex.name}
                </strong>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => onMove(id, -1)} disabled={i === 0} aria-label={`Move ${ex.name} earlier`}>
                    <Icon name="return" size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onMove(id, 1)} disabled={i === picked.length - 1} aria-label={`Move ${ex.name} later`}>
                    <Icon name="skip" size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onRemove(id)} aria-label={`Remove ${ex.name}`}>
                    <Icon name="x" size={14} />
                  </button>
                </span>
              </div>
              <div className="grid-2">
                <Stepper id={`sets-${id}`} label={`Sets of ${ex.name}`} value={sets} min={TRY_SETS.min} max={TRY_SETS.max} unit="sets" onChange={(v) => set(id, { sets: v })} />
                <Stepper id={`amt-${id}`} label={`${d.kind === 'reps' ? 'Reps' : 'Seconds'} per set of ${ex.name}`} value={amount} min={lim.min} max={lim.max} step={lim.step} unit={lim.unit} onChange={(v) => set(id, { amount: v })} />
              </div>
              <div className="row-between tiny muted">
                <span>
                  {d.perSide ? 'Each side. ' : ''}Usual: {d.sets} × {d.amount} {d.kind === 'reps' ? 'reps' : 'seconds'}
                </span>
                {changed ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => onCustom({ ...custom, [id]: {} })}>
                    Reset
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
