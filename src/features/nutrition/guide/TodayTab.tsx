import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar, Callout, PageHead, ProgressRing, Segmented } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { ALL_FOODS, scaleFood, type Food, type MealEntry } from '../../../nutrition/foods';
import { USDA_CREDIT, loadUsda, searchUsda } from '../../../nutrition/usdaSearch';
import { GUIDE_FOODS } from '../../../nutrition/guide/catalog';
import { goalProgress, weeklyRecap } from '../../../nutrition/guide/coach';
import { alternativesFor, gapReport, weekView } from '../../../nutrition/guide/engine';
import { allergenHints, groupsForFoodId } from '../../../nutrition/guide/logged';
import { avoidedAllergens, exclusions } from '../../../nutrition/guide/rules';
import { CUP_ML, GROUP_LABEL, SLOTS, type Slot } from '../../../nutrition/guide/types';
import { DayStrip, GroupGrid, dayLong } from './charts';
import { AllergyNote, GuideNotice, allergenList } from './shared';
import { mealEntryFor, slotLabel, slotNow, useGuide } from './useGuide';

const cupsOf = (ml: number) => Math.round((ml / CUP_ML) * 10) / 10;

interface Option {
  value: string;
  label: string;
}

export function TodayTab() {
  const { store, data, profile, np, now, rec, coach, numbers } = useGuide();
  const week = useMemo(() => weekView(data.meals, data.water, now), [data.meals, data.water, now]);
  const [picked, setPicked] = useState<string | null>(null);
  const day = week.find((d) => d.key === picked) ?? week[week.length - 1]!;
  const isToday = day === week[week.length - 1];
  const gaps = useMemo(() => gapReport(week, np), [week, np]);
  const goals = useMemo(() => goalProgress(coach), [coach]);
  const recap = useMemo(() => weeklyRecap(coach), [coach]);

  // Logging
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState('');
  const [servings, setServings] = useState(1);
  const [slot, setSlot] = useState<Slot>(() => slotNow());
  const [note, setNote] = useState<string | null>(null);
  const [usda, setUsda] = useState<Food[] | null>(null);
  const [usdaError, setUsdaError] = useState(false);

  // The big USDA list is fetched the first time you search for something, never before.
  useEffect(() => {
    if (query.trim().length < 2 || usda || usdaError) return;
    let live = true;
    loadUsda().then(
      (f) => live && setUsda(f),
      () => live && setUsdaError(true),
    );
    return () => {
      live = false;
    };
  }, [query, usda, usdaError]);
  const usdaHits = useMemo(() => (usda ? searchUsda(usda, query, 40) : []), [usda, query]);

  const options: Option[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const guideNames = new Set(GUIDE_FOODS.map((f) => f.name.toLowerCase()));
    const all: Option[] = [
      ...GUIDE_FOODS.map((f) => ({ value: `guide:${f.id}`, label: `${f.name} (${f.serving})` })),
      ...[...ALL_FOODS, ...data.userFoods].filter((f) => !guideNames.has(f.name.toLowerCase())).map((f) => ({ value: `main:${f.id}`, label: `${f.name} (${f.serving})` })),
    ];
    const own = (q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all).slice(0, 120);
    return [...own, ...usdaHits.map((f) => ({ value: `main:${f.id}`, label: `${f.name} (${f.serving})` }))];
  }, [query, data.userFoods, usdaHits]);

  const chosen = useMemo(() => {
    if (!choice) return null;
    if (choice.startsWith('guide:')) {
      const f = GUIDE_FOODS.find((x) => x.id === choice.slice(6));
      return f ? { kind: 'guide' as const, id: f.id, name: f.name, groups: f.groups, f } : null;
    }
    const f = [...data.userFoods, ...ALL_FOODS, ...usdaHits].find((x) => x.id === choice.slice(5));
    return f ? { kind: 'main' as const, id: f.id, name: f.name, groups: groupsForFoodId(f.id, f.name), f } : null;
  }, [choice, data.userFoods, usdaHits]);

  /** Why this food may not fit, using only what we can honestly say. Never "this is safe". */
  const conflict = useMemo(() => {
    if (!chosen || !np.allergiesConfirmed) return null;
    if (chosen.kind === 'guide') {
      const why = exclusions(chosen.f, np, profile.ageYears);
      return why.length ? why.map((w) => w.text) : null;
    }
    const mine = avoidedAllergens(np);
    const hit = allergenHints(chosen.name, chosen.id).filter((a) => mine.includes(a));
    return hit.length ? [`A dish like this can contain ${allergenList(hit)}, which you avoid. Recipes vary, so check the ingredients.`] : null;
  }, [chosen, np, profile.ageYears]);
  const alternatives = useMemo(() => (conflict && chosen ? alternativesFor({ groups: chosen.groups, id: chosen.kind === 'guide' ? chosen.id : undefined }, rec, 3) : []), [conflict, chosen, rec]);

  const add = () => {
    if (!chosen) return;
    let entry: MealEntry;
    if (chosen.kind === 'guide') entry = mealEntryFor(chosen.f, servings, slot);
    else {
      const n = scaleFood(chosen.f, servings);
      entry = { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), meal: slot, name: chosen.name, servings, ...n, source: 'search', foodId: chosen.f.id };
    }
    store.addMeal(entry);
    setNote(`Added ${chosen.name} to today.`);
    setChoice('');
    setQuery('');
    setServings(1);
    setPicked(null);
  };

  const addWater = (ml: number) => store.addWater({ id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), ml });
  const todayWater = week[week.length - 1]!.waterMl;
  const lastToday = [...data.water].reverse().find((w) => new Date(w.at).toDateString() === now.toDateString());
  const avoid = avoidedAllergens(np);

  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="Nutrition"
        title="Today"
        actions={
          <Link to="/nutrition/snap" className="btn btn-secondary btn-sm">
            <Icon name="camera" size={16} /> Snap a meal
          </Link>
        }
      >
        Log meals and drinks, see your patterns, and track the goals you chose. It is about regular, varied eating, not weight or calories.
      </PageHead>

      {!np.allergiesConfirmed ? (
        <Callout tone="warn" title="Tell us about allergies first">
          Food ideas stay hidden until you answer the allergy question, even if the answer is none. <Link to="/nutrition/profile">Open my food profile</Link>.
        </Callout>
      ) : null}

      <div className="grid-2 ng-top">
        <section className="card ng-water" aria-labelledby="water-h">
          <h2 id="water-h">Drinks today</h2>
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            <ProgressRing value={cupsOf(todayWater)} max={np.waterTargetCups} size={104} label={cupsOf(todayWater)} sub={`of ${np.waterTargetCups} cups`} />
            <div className="stack-sm">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => addWater(CUP_ML)}>
                  <Icon name="plus" size={15} /> 1 cup
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addWater(Math.round(CUP_ML / 2))}>
                  <Icon name="plus" size={15} /> ½ cup
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!lastToday} onClick={() => lastToday && store.removeWater(lastToday.id)}>
                  Undo last
                </button>
              </div>
              <p className="tiny muted">A cup is 8 fl oz (237 ml). Most healthy people do well drinking when thirsty, so this is a habit helper, not a rule. Change the target in your food profile.</p>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="goals-h">
          <h2 id="goals-h">Your goals</h2>
          {goals.length === 0 ? (
            <p className="muted small">
              Pick goals in <Link to="/nutrition/profile">your food profile</Link> and your progress shows here.
            </p>
          ) : (
            <ul className="ng-goals">
              {goals.map((g) => (
                <li key={g.id}>
                  <div className="row-between">
                    <strong className="small">{g.label}</strong>
                    <span className="tiny num">
                      {g.value}/{g.target}
                    </span>
                  </div>
                  <Bar value={g.value} max={g.target} label={`${g.label}: ${g.value} of ${g.target}`} />
                  <span className="tiny muted">{g.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card stack" aria-labelledby="week-h">
        <div className="row-between">
          <h2 id="week-h">Your week</h2>
          <span className="tiny muted">Tap a day to see it</span>
        </div>
        <DayStrip week={week} selected={day.key} onSelect={setPicked} waterTarget={np.waterTargetCups} />
        <div className="ng-week-grid">
          <div className="ng-grid-wrap" tabIndex={0} role="region" aria-label="Food groups by day">
            <GroupGrid week={week} />
          </div>
          <div className="stack-sm">
            <h3 className="small">Patterns</h3>
            <ul className="list small">
              {recap.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {gaps.enough ? (
              gaps.rarely.length ? (
                <div className="ng-gaps" role="status">
                  <strong className="small">Rare in your log this week</strong>
                  <p className="small">
                    {gaps.rarely.map((r) => `${GROUP_LABEL[r.group]} (${r.seenDays} of ${gaps.loggedDays} days)`).join(', ')}.
                  </p>
                  <p className="tiny muted">This only describes what you logged. It is not a diagnosis and does not mean you are low in anything. If you did eat them, log them next time.</p>
                  <Link to="/nutrition/foods" className="small">
                    See foods that add them
                  </Link>
                </div>
              ) : (
                <p className="small ng-good">
                  <Icon name="check" size={15} className="inline-icon" /> Every food group shows up regularly in your log.
                </p>
              )
            ) : (
              <p className="small muted">Log food on 3 days to see which groups are rare. {gaps.loggedDays} of 3 so far.</p>
            )}
          </div>
        </div>
      </section>

      <section className="card stack" aria-labelledby="log-h">
        <h2 id="log-h">Log food</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ng-search">Find a food</label>
            <input id="ng-search" className="input" type="search" placeholder="Try “oatmeal” or “pizza”" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="ng-pick">Food</label>
            <select id="ng-pick" className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose from {options.length} match{options.length === 1 ? '' : 'es'}…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Segmented<Slot> legend="Meal" value={slot} onChange={setSlot} size="sm" options={SLOTS.map((s) => ({ value: s, label: slotLabel(s) }))} />
          <div className="field" style={{ maxWidth: 140 }}>
            <label htmlFor="ng-serv">Servings</label>
            <select id="ng-serv" className="input" value={servings} onChange={(e) => setServings(Number(e.target.value))}>
              {[0.5, 1, 1.5, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!chosen} onClick={add}>
            <Icon name="plus" size={16} /> Add to today
          </button>
        </div>
        {conflict ? (
          <Callout tone="warn" title="This may not fit what you told us">
            <ul className="list">
              {conflict.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {alternatives.length ? (
              <p style={{ marginTop: 6 }}>
                Ideas that fit your profile instead: <strong>{alternatives.map((a) => a.name).join(', ')}</strong>.
              </p>
            ) : null}
            <p style={{ marginTop: 6 }}>You can still log it if you did eat it. This is just a heads-up, never a guarantee either way.</p>
          </Callout>
        ) : null}
        {note ? (
          <p className="small ng-good" role="status">
            <Icon name="check" size={15} className="inline-icon" /> {note}
          </p>
        ) : null}
        {usdaHits.length > 0 ? <p className="tiny muted">{USDA_CREDIT}</p> : null}
        {usdaError && query.trim().length >= 2 ? <p className="tiny muted">The larger USDA food list could not be loaded just now. The foods above still work.</p> : null}
        <p className="tiny muted">
          Photos are never stored. <Link to="/nutrition/snap">Read a plate from a photo instead</Link>.
        </p>
      </section>

      <section className="card stack" aria-labelledby="day-h">
        <div className="row-between">
          <h2 id="day-h">{isToday ? 'Today’s log' : dayLong(day.date)}</h2>
          <span className="tiny muted">
            {day.meals.length} item{day.meals.length === 1 ? '' : 's'} · {cupsOf(day.waterMl)} cups of drinks
          </span>
        </div>
        {day.meals.length === 0 ? (
          <p className="muted small">Nothing logged {isToday ? 'yet' : 'this day'}.</p>
        ) : (
          <ul className="ng-log">
            {day.meals.map((m) => {
              const hits = avoid.length ? allergenHints(m.name, m.foodId ?? '').filter((a) => avoid.includes(a)) : [];
              const groups = groupsForFoodId(m.foodId, m.name);
              return (
                <li key={m.id} className="ng-log-row">
                  <div className="stack-sm" style={{ gap: 2 }}>
                    <span>
                      <strong>{m.name}</strong> <span className="tiny muted">· {slotLabel(m.meal)}{m.servings !== 1 ? ` · ${m.servings} servings` : ''}</span>
                    </span>
                    <span className="tiny muted">
                      {groups.length ? groups.map((g) => GROUP_LABEL[g]).join(', ') : 'No food group counted'}
                      {numbers ? ` · about ${m.kcal} kcal` : ''}
                    </span>
                    {hits.length ? (
                      <span className="tiny ng-warn-text">
                        <Icon name="alert" size={13} className="inline-icon" /> A dish like this can contain {allergenList(hits)}. Check the ingredients.
                      </span>
                    ) : null}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => store.removeMeal(m.id)} aria-label={`Remove ${m.name}`}>
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <AllergyNote compact />
      </section>

      <GuideNotice />
    </div>
  );
}
