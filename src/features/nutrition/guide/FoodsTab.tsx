import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Callout, EmptyState, PageHead, Segmented } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { ALL_FOODS } from '../../../nutrition/foods';
import { GUIDE_FOODS } from '../../../nutrition/guide/catalog';
import { alternativesFor, recommend, type Want } from '../../../nutrition/guide/engine';
import { allergenHints, groupsForFoodId } from '../../../nutrition/guide/logged';
import { avoidedAllergens, exclusions } from '../../../nutrition/guide/rules';
import { ALLERGEN_LABEL, DIET_LABEL } from '../../../nutrition/guide/types';
import { AllergyNote, FoodCard, GuideNotice, SourceLinks, allergenList } from './shared';
import { mealEntryFor, slotLabel, slotNow, useGuide } from './useGuide';

const WANTS: { value: Want; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'pre', label: 'Before a workout' },
  { value: 'post', label: 'After a workout' },
];

export function FoodsTab() {
  const { store, profile, np, rec, numbers, now, workout } = useGuide();
  const [want, setWant] = useState<Want>('any');
  const [note, setNote] = useState<string | null>(null);
  const result = useMemo(() => recommend(rec, want, 8), [rec, want]);

  const [checkId, setCheckId] = useState('');
  const checkOptions = useMemo(() => {
    const guideNames = new Set(GUIDE_FOODS.map((f) => f.name.toLowerCase()));
    return [...GUIDE_FOODS.map((f) => ({ v: `guide:${f.id}`, l: f.name })), ...[...ALL_FOODS, ...store.data.userFoods].filter((f) => !guideNames.has(f.name.toLowerCase())).map((f) => ({ v: `main:${f.id}`, l: f.name }))];
  }, [store.data.userFoods]);
  const verdict = useMemo(() => {
    if (!checkId || !np.allergiesConfirmed) return null;
    const mine = avoidedAllergens(np);
    if (checkId.startsWith('guide:')) {
      const f = GUIDE_FOODS.find((x) => x.id === checkId.slice(6));
      if (!f) return null;
      const why = exclusions(f, np, profile.ageYears).map((w) => w.text);
      return { name: f.name, why, groups: f.groups };
    }
    const f = [...store.data.userFoods, ...ALL_FOODS].find((x) => x.id === checkId.slice(5));
    if (!f) return null;
    const hit = allergenHints(f.name, f.id).filter((a) => mine.includes(a));
    return { name: f.name, why: hit.length ? [`A dish like this can contain ${allergenList(hit)}, which you avoid. Recipes vary, so check the ingredients.`] : [], groups: groupsForFoodId(f.id, f.name) };
  }, [checkId, np, profile.ageYears, store.data.userFoods]);
  const alternatives = useMemo(() => (verdict && verdict.why.length ? alternativesFor({ groups: verdict.groups }, rec, 3) : []), [verdict, rec]);

  const log = (f: (typeof GUIDE_FOODS)[number]) => {
    const slot = want === 'breakfast' || want === 'lunch' || want === 'dinner' || want === 'snack' ? want : want === 'pre' || want === 'post' ? 'snack' : slotNow(now);
    store.addMeal(mealEntryFor(f, 1, slot, new Date()));
    setNote(`Added ${f.name} to today’s ${slotLabel(slot).toLowerCase()}.`);
  };

  if (result.blocked) {
    return (
      <div className="stack-lg">
        <PageHead eyebrow="Nutrition" title="Foods for you">
          Personal ideas that respect your allergies, diet and goals, with the reason and source for each.
        </PageHead>
        <EmptyState
          icon="shield"
          title="Tell us about allergies first"
          action={
            <Link to="/nutrition/profile" className="btn btn-primary">
              Open my food profile
            </Link>
          }
        >
          We never suggest food before you have answered the allergy question, even if the answer is none. It takes under a minute.
        </EmptyState>
        <GuideNotice />
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Nutrition" title="Foods for you">
        Ideas that leave out what you avoid and fit your goals. Every card says why, with the source.
      </PageHead>

      <section className="card stack-sm" aria-label="What we are leaving out">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <strong className="small">Using your profile</strong>
          <Link to="/nutrition/profile" className="small">
            Change
          </Link>
        </div>
        <div className="ng-tags">
          {np.allergens.map((a) => (
            <span key={a} className="badge badge-warn">
              No {ALLERGEN_LABEL[a].split(' (')[0]!.toLowerCase()}
            </span>
          ))}
          {np.otherAllergens.map((a) => (
            <span key={a} className="badge badge-warn">
              Avoiding {a}
            </span>
          ))}
          {np.diets.map((d) => (
            <span key={d} className="badge badge-info">
              {DIET_LABEL[d].split(' (')[0]}
            </span>
          ))}
          {np.dislikes.map((d) => (
            <span key={d} className="badge">
              Dislikes {d}
            </span>
          ))}
          {!np.allergens.length && !np.otherAllergens.length && !np.diets.length && !np.dislikes.length ? <span className="tiny muted">No allergies, diets or dislikes set.</span> : null}
        </div>
        {profile.ageYears < 5 ? (
          <Callout tone="warn" title="Under 5">
            Choking hazards such as whole nuts, whole grapes and popcorn are left out. Food for young children should be guided by your pediatrician.
          </Callout>
        ) : null}
        {workout.plannedToday && !workout.doneToday ? <p className="tiny muted">You have a workout planned today, so “Before a workout” may help.</p> : null}
      </section>

      <Segmented<Want> legend="What are you looking for?" value={want} onChange={setWant} options={WANTS} />

      {result.picks.length === 0 ? (
        <Callout tone="info" title="Nothing in our small list matches everything you told us">
          Rather than guess, we leave this empty. A registered dietitian can build ideas around your needs: <a href="https://www.eatright.org/fitness/sports-and-athletic-performance" target="_blank" rel="noopener noreferrer">find one</a>.
        </Callout>
      ) : (
        <ul className="ng-foods" aria-label="Suggested foods">
          {result.picks.map((r) => (
            <FoodCard key={r.food.id} rec={r} numbers={numbers} onLog={log} />
          ))}
        </ul>
      )}
      {note ? (
        <p className="small ng-good" role="status">
          <Icon name="check" size={15} className="inline-icon" /> {note}
        </p>
      ) : null}
      <AllergyNote />

      <details className="card ng-left-out">
        <summary>
          <strong>Left out for you ({result.excluded.length} of {GUIDE_FOODS.length})</strong> <span className="tiny muted">and why</span>
        </summary>
        <ul className="ng-excluded">
          {result.excluded.map((e) => (
            <li key={e.food.id}>
              <strong className="small">{e.food.name}</strong>
              <span className="tiny muted"> · {e.why[0]!.text}</span>
            </li>
          ))}
        </ul>
        {result.excluded.length === 0 ? <p className="tiny muted">Nothing is left out because you have not listed anything to avoid.</p> : null}
      </details>

      <section className="card stack" aria-labelledby="check-h">
        <h2 id="check-h">Check a food and find swaps</h2>
        <p className="small muted">Pick any food to see if it clashes with your profile, and what to eat instead. “No clash found” never means a food is safe; check the label.</p>
        <div className="field">
          <label htmlFor="ng-check">Food to check</label>
          <select id="ng-check" className="input" value={checkId} onChange={(e) => setCheckId(e.target.value)}>
            <option value="">Choose a food…</option>
            {checkOptions.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </div>
        {verdict ? (
          verdict.why.length ? (
            <Callout tone="warn" title={`${verdict.name}: may not fit`}>
              <ul className="list">
                {verdict.why.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {alternatives.length ? (
                <p style={{ marginTop: 6 }}>
                  Try instead: <strong>{alternatives.map((a) => a.name).join(', ')}</strong>.
                </p>
              ) : (
                <p style={{ marginTop: 6 }}>We have no close swap in our small list. A registered dietitian can suggest one.</p>
              )}
            </Callout>
          ) : (
            <Callout tone="info" title={`${verdict.name}: no clash found with your list`}>
              This does not make it safe. Recipes, brands and kitchens differ, so read the current label and ask about cross-contact.
            </Callout>
          )
        ) : null}
      </section>

      <SourceLinks ids={['dga-2025', 'fda-allergens', 'aap-sports-nutrition', 'usda-fdc', 'academy-sports-rdn']} label="Where these ideas come from" />
      <GuideNotice />
    </div>
  );
}
