import { useState } from 'react';
import { Link } from 'react-router';
import { Callout, CheckCard, ChipGroup, PageHead, Stepper } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { goalsForAge } from '../../../nutrition/guide/engine';
import { ALLERGENS, ALLERGEN_LABEL, DIETS, DIET_LABEL, WATER_TARGET, type Allergen, type Diet, type NutritionGoalId } from '../../../nutrition/guide/types';
import { ageBandFor } from '../../../domain/safety/screening';
import { GuideNotice, SourceLinks } from './shared';
import { useGuide } from './useGuide';

const BAND_LABEL = { under5: 'Under 5', child: '5 to 12', teen: '13 to 17', adult: '18 to 64', older: '65 and over' } as const;
const ACTIVITY_LABEL = { inactive: 'Not very active', some: 'Somewhat active', active: 'Very active' } as const;

/** A short list of words with an input and removable chips. Used for "other allergies", likes and dislikes. */
function WordList({ legend, hint, values, onChange, placeholder, max, id }: { legend: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; max: number; id: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const w = text.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (w.length >= 2 && !values.some((v) => v.toLowerCase() === w.toLowerCase()) && values.length < max) onChange([...values, w]);
    setText('');
  };
  return (
    <div className="field">
      <label htmlFor={id}>{legend}</label>
      {hint ? <span className="hint">{hint}</span> : null}
      <div className="row" style={{ gap: 8 }}>
        <input
          id={id}
          className="input"
          value={text}
          maxLength={40}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={add} disabled={text.trim().length < 2 || values.length >= max}>
          Add
        </button>
      </div>
      {values.length ? (
        <ul className="ng-words" aria-label={legend}>
          {values.map((v) => (
            <li key={v} className="badge">
              {v}
              <button type="button" className="ng-x" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FoodProfileTab() {
  const { store, np, profile, save } = useGuide();
  const age = profile.ageYears;
  const goals = goalsForAge(age);
  const minor = age < 18;
  const [confirmClear, setConfirmClear] = useState(false);
  const toggle = <T extends string>(list: T[], v: T, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Nutrition" title="My food profile">
        Tell us what to avoid and what you are aiming for. Changes save as you go, and you can update them at any time.
      </PageHead>

      {minor ? (
        <Callout tone="info" title={age < 5 ? 'A grown-up should fill this in' : 'Check this with a parent or guardian'}>
          {age < 5 ? 'Food for children under 5 should be guided by a pediatrician. These are general ideas only.' : 'Ask a parent or guardian to check your allergies and what you eat. Calorie numbers are always hidden for under-18s.'}
        </Callout>
      ) : null}

      <section className="card stack" aria-labelledby="allergy-h">
        <h2 id="allergy-h">Allergies</h2>
        <p className="small muted">
          Tick every food allergy you have. These are the nine major U.S. allergens. We leave out any food that contains them, and any food that often shares a factory or ingredient with them.
        </p>
        <div className="ng-checks">
          {ALLERGENS.map((a) => (
            <CheckCard key={a} checked={np.allergens.includes(a)} onChange={(on) => save({ allergens: toggle<Allergen>(np.allergens, a, on) })} title={ALLERGEN_LABEL[a]} />
          ))}
        </div>
        <WordList
          id="ng-other"
          legend="Any other allergy or food to avoid"
          hint="For example kiwi, mustard, or gluten. We can only check these against ingredient names in our small list, so they are a best effort."
          values={np.otherAllergens}
          onChange={(v) => save({ otherAllergens: v })}
          placeholder="Type a food and press Add"
          max={12}
        />
        <div className="ng-confirm">
          <CheckCard
            checked={np.allergiesConfirmed}
            onChange={(on) => save({ allergiesConfirmed: on })}
            title="I have checked my allergies"
            hint="Tick this when the list above is complete. If you have no food allergies, leave everything unticked and tick this box. Food ideas stay hidden until you do."
          />
        </div>
        {!np.allergiesConfirmed ? (
          <Callout tone="warn" title="Food ideas are switched off">
            Until you tick “I have checked my allergies”, the app will not suggest foods, so a skipped question can never look like “no allergies”.
          </Callout>
        ) : null}
        <p className="small">
          <Icon name="alert" size={15} className="inline-icon" /> A food on a suggestion list is never a promise that it is safe. Read the label every time, watch for cross-contact, and ask your allergist about your own risk and emergency plan.
        </p>
        <SourceLinks ids={['fda-allergens']} />
      </section>

      <section className="card stack" aria-labelledby="diet-h">
        <h2 id="diet-h">Diet</h2>
        <ChipGroup<Diet> legend="Choose any that apply" options={DIETS.map((d) => ({ value: d, label: DIET_LABEL[d] }))} value={np.diets} onChange={(v) => save({ diets: v })} hint="We cannot check halal, kosher or religious sourcing, so use the dislike list below for anything specific." />
      </section>

      <section className="card stack" aria-labelledby="pref-h">
        <h2 id="pref-h">Likes and dislikes</h2>
        <div className="grid-2">
          <WordList id="ng-likes" legend="Foods you like" values={np.likes} onChange={(v) => save({ likes: v })} placeholder="For example: salmon" max={20} />
          <WordList id="ng-dislikes" legend="Foods you dislike" hint="We will not suggest these." values={np.dislikes} onChange={(v) => save({ dislikes: v })} placeholder="For example: mushrooms" max={20} />
        </div>
      </section>

      <section className="card stack" aria-labelledby="goals-h">
        <h2 id="goals-h">Your nutrition goals</h2>
        <p className="small muted">Pick any. They shape which foods come first and what you track. None of them is about weight.</p>
        <div className="ng-checks">
          {goals.map((g) => (
            <CheckCard key={g.id} checked={np.goals.includes(g.id)} onChange={(on) => save({ goals: toggle<NutritionGoalId>(np.goals, g.id, on) })} title={g.label} hint={g.blurb} />
          ))}
        </div>
        <Stepper id="ng-cups" label="Drink habit target" value={np.waterTargetCups} min={WATER_TARGET.min} max={WATER_TARGET.max} unit="cups a day" onChange={(v) => save({ waterTargetCups: v })} />
        <p className="tiny muted">An optional habit counter, not a medical target. Most healthy people do well drinking when thirsty, and needs rise with heat and exercise.</p>
        <SourceLinks ids={['nasem-water', 'aap-sports-nutrition']} />
      </section>

      <section className="card stack-sm" aria-labelledby="about-h">
        <h2 id="about-h">About you</h2>
        <p className="small">
          Age range: <strong>{BAND_LABEL[ageBandFor(age)]}</strong> · Activity: <strong>{ACTIVITY_LABEL[profile.activityLevel]}</strong>
        </p>
        <p className="tiny muted">
          These come from your main profile so they only live in one place. <Link to="/profile">Change them in Profile &amp; Health</Link>.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="tiny muted">{store.data.nutrition ? `Last updated ${new Date(np.updatedAt).toLocaleString()}` : 'Not saved yet. Your first change saves it.'}</span>
          {confirmClear ? (
            <span className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  store.setNutrition(null);
                  setConfirmClear(false);
                }}
              >
                Yes, clear my food profile
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-sm" disabled={!store.data.nutrition} onClick={() => setConfirmClear(true)}>
              Clear my food profile
            </button>
          )}
        </div>
        <p className="tiny muted">Stored only on this device, included in your backup file, and removed by “delete everything”. Never uploaded.</p>
      </section>
      <GuideNotice />
    </div>
  );
}

