import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar, Callout, PageHead } from '../../../components/ui';
import { Icon } from '../../../components/Icon';
import { GUIDE_FOODS } from '../../../nutrition/guide/catalog';
import { TOPICS, answerTopic, coachTips, goalProgress, matchTopic, weeklyRecap, type Answer } from '../../../nutrition/guide/coach';
import { GuideNotice, SourceLinks } from './shared';
import { useGuide } from './useGuide';

export function CoachTab() {
  const { coach, np } = useGuide();
  const tips = useMemo(() => coachTips(coach), [coach]);
  const goals = useMemo(() => goalProgress(coach), [coach]);
  const recap = useMemo(() => weeklyRecap(coach), [coach]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [q, setQ] = useState('');
  const [miss, setMiss] = useState(false);

  const ask = (id: string) => {
    setMiss(false);
    setAnswer(answerTopic(id, coach));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = matchTopic(q);
    if (id) ask(id);
    else {
      setAnswer(null);
      setMiss(true);
    }
  };
  const name = (id: string) => GUIDE_FOODS.find((f) => f.id === id)?.name ?? id;

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Nutrition" title="Your coach">
        Reads your food log, drinks, goals and next workout, then suggests what to try. It runs on your device with fixed, tested rules, so it cannot make things up.
      </PageHead>

      <section className="stack" aria-labelledby="tips-h">
        <h2 id="tips-h">For you right now</h2>
        <ul className="ng-tips">
          {tips.map((t) => (
            <li key={t.id} className="card ng-tip" data-tone={t.tone}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <Icon name={t.tone === 'warn' ? 'alert' : t.tone === 'ok' ? 'check' : 'spark'} size={20} />
                <div className="stack-sm" style={{ gap: 6 }}>
                  <h3>{t.title}</h3>
                  <p className="small">{t.body}</p>
                  {t.foodIds?.length ? (
                    <div className="ng-tags">
                      {t.foodIds.map((id) => (
                        <span key={id} className="badge badge-brand">
                          {name(id)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {t.action ? (
                    <Link to={t.action.to} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                      {t.action.label}
                    </Link>
                  ) : null}
                  <SourceLinks ids={t.sourceIds} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {np.allergiesConfirmed ? (
        <section className="card stack" aria-labelledby="recap-h">
          <h2 id="recap-h">Your week in a few lines</h2>
          <ul className="list small">
            {recap.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {goals.length ? (
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
          ) : (
            <p className="small muted">
              Choose goals in <Link to="/nutrition/profile">your food profile</Link> to track them here.
            </p>
          )}
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="ask-h">
        <h2 id="ask-h">Ask the coach</h2>
        <p className="small muted">Pick a question, or type one. The coach only answers topics it has checked sources for, and says so when it does not know.</p>
        <div className="ng-tags" role="group" aria-label="Common questions">
          {TOPICS.map((t) => (
            <button key={t.id} type="button" className="chip-btn" onClick={() => ask(t.id)} aria-pressed={answer?.title !== undefined && answerTopic(t.id, coach).title === answer.title}>
              {t.question}
            </button>
          ))}
        </div>
        <form className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={submit}>
          <div className="field" style={{ flex: '1 1 240px' }}>
            <label htmlFor="ng-q">Or type a question</label>
            <input id="ng-q" className="input" value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} placeholder="For example: what should I eat after training?" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={!q.trim()}>
            Ask
          </button>
        </form>
        <div aria-live="polite">
          {answer ? (
            <article className="ng-answer">
              <h3>{answer.title}</h3>
              {answer.paragraphs.map((p) => (
                <p key={p} className="small">
                  {p}
                </p>
              ))}
              <SourceLinks ids={answer.sourceIds} />
            </article>
          ) : null}
          {miss ? (
            <Callout tone="info" title="I do not have a checked answer for that">
              I can explain: {TOPICS.map((t) => t.question.replace(/\?$/, '').toLowerCase()).join('; ')}. For anything else, a registered dietitian is the right person to ask.
            </Callout>
          ) : null}
        </div>
      </section>

      <Callout tone="info" title="When to talk with a person">
        For allergies, medical conditions, a suspected nutrient shortfall, or if food and weight feel stressful, please talk with your doctor or a{' '}
        <a href="https://www.eatright.org/fitness/sports-and-athletic-performance" target="_blank" rel="noopener noreferrer">
          registered dietitian
        </a>
        . This coach cannot diagnose or prescribe.
      </Callout>
      <GuideNotice />
    </div>
  );
}
