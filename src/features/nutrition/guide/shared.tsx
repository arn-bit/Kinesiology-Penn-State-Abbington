import { Link } from 'react-router';
import { Icon } from '../../../components/Icon';
import { EvidenceRefs } from '../../../components/ui';
import type { Recommendation } from '../../../nutrition/guide/engine';
import { ALLERGEN_LABEL, GROUP_LABEL, type Allergen } from '../../../nutrition/guide/types';
import type { GuideFood } from '../../../nutrition/guide/catalog';
import { getEvidence } from '../../../domain/evidence/registry';

/** Shown on every nutrition screen that gives food ideas. Plain, short, and always there. */
export function GuideNotice() {
  return (
    <aside className="ng-notice" aria-label="About these food ideas">
      <Icon name="shield" size={18} />
      <p className="small">
        <strong>General ideas, not medical advice.</strong> This guide does not diagnose nutrient shortfalls, prescribe diets or replace a doctor, allergist or registered dietitian. For allergies, medical conditions or worries about a nutrient,{' '}
        <a href="https://www.eatright.org/fitness/sports-and-athletic-performance" target="_blank" rel="noopener noreferrer">
          talk with a registered dietitian <Icon name="external" size={12} className="inline-icon" />
        </a>
        . Numbers are rounded estimates.
      </p>
    </aside>
  );
}

/** The allergy reminder, kept in one place so every food card says the same careful thing. */
export function AllergyNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? 'tiny muted ng-allergy-note' : 'small ng-allergy-note'}>
      <Icon name="alert" size={compact ? 13 : 15} className="inline-icon" /> These are generic foods. Always read the current ingredient label, look for “may contain” warnings and cross-contact, and check with your allergist.
    </p>
  );
}

export function SourceLinks({ ids, label = 'Sources' }: { ids: string[]; label?: string }) {
  const known = [...new Set(ids)].filter((id) => getEvidence(id));
  if (!known.length) return null;
  return (
    <details className="ng-sources">
      <summary className="tiny">{label}</summary>
      <EvidenceRefs ids={known} compact />
      <Link to="/evidence" className="tiny">
        All sources in the evidence library
      </Link>
    </details>
  );
}

export const allergenList = (xs: Allergen[]) => xs.map((a) => ALLERGEN_LABEL[a].split(' (')[0]!.toLowerCase()).join(', ');

/** Plain-language tags used instead of numbers when numbers are hidden (always, for under-18s). */
export function qualityTags(f: GuideFood): string[] {
  const t: string[] = [];
  if (f.protein >= 10) t.push('Protein-rich');
  if (f.carbs >= 25) t.push('Carbohydrate energy');
  if (f.fiber === 'high') t.push('High fibre');
  if (f.waterRich) t.push('Water-rich');
  return t;
}

export function FoodCard({ rec, numbers, onLog, logLabel }: { rec: Recommendation; numbers: boolean; onLog?: (f: GuideFood) => void; logLabel?: string }) {
  const f = rec.food;
  const sources = rec.reasons.flatMap((r) => r.sourceIds);
  return (
    <li className="card card-tight ng-food">
      <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="stack-sm" style={{ gap: 2 }}>
          <h3 className="ng-food-name">{f.name}</h3>
          <span className="tiny muted">{f.serving}</span>
        </div>
        {onLog ? (
          <button className="btn btn-secondary btn-sm" onClick={() => onLog(f)} aria-label={`Log ${f.name}`}>
            <Icon name="plus" size={15} /> {logLabel ?? 'Log it'}
          </button>
        ) : null}
      </div>
      <div className="ng-tags">
        {f.groups.map((g) => (
          <span key={g} className="badge badge-brand">
            {GROUP_LABEL[g]}
          </span>
        ))}
        {rec.before ? <span className="badge badge-info">Fits before a workout</span> : null}
        {rec.after ? <span className="badge badge-info">Fits after a workout</span> : null}
        {(numbers ? [] : qualityTags(f)).map((t) => (
          <span key={t} className="badge">
            {t}
          </span>
        ))}
      </div>
      {numbers ? (
        <p className="small ng-nums">
          About <strong className="num">{f.kcal}</strong> kcal · <span className="num">{f.protein}</span> g protein · <span className="num">{f.carbs}</span> g carbs · <span className="num">{f.fat}</span> g fat
        </p>
      ) : null}
      <div className="stack-sm ng-why" style={{ gap: 4 }}>
        <strong className="small">Why it is suggested</strong>
        <ul className="list small">
          {rec.reasons.map((r) => (
            <li key={r.text}>{r.text}</li>
          ))}
        </ul>
      </div>
      <p className="tiny muted ng-contains">
        {f.allergens.length ? `Contains: ${allergenList(f.allergens)}.` : 'Lists none of the nine major allergens in its plain form.'}
        {f.mayContain.length ? ` Shop-bought versions often also contain or share a factory with: ${allergenList(f.mayContain)}.` : ''}
      </p>
      <SourceLinks ids={[...sources, 'fda-allergens', 'usda-fdc']} />
    </li>
  );
}
