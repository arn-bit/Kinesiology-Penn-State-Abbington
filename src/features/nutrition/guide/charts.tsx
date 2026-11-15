import { CUP_ML, GROUPS, GROUP_LABEL } from '../../../nutrition/guide/types';
import type { DayInfo } from '../../../nutrition/guide/engine';

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const LONG = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
export const dayName = (d: Date) => WEEKDAY.format(d);
export const dayLong = (d: Date) => LONG.format(d);
const cups = (ml: number) => Math.round((ml / CUP_ML) * 10) / 10;

/**
 * Seven day buttons. Each shows how many food groups were logged (bar height) and drinks (the small drop
 * row), and choosing one shows that day below. Pure SVG-free HTML so it works with keyboards and screen readers.
 */
export function DayStrip({ week, selected, onSelect, waterTarget }: { week: DayInfo[]; selected: string; onSelect: (key: string) => void; waterTarget: number }) {
  return (
    <div className="ng-days" role="group" aria-label="Choose a day this week">
      {week.map((d, i) => {
        const isToday = i === week.length - 1;
        const label = `${dayLong(d.date)}${isToday ? ' (today)' : ''}: ${d.groups.length} of 5 food groups, ${cups(d.waterMl)} ${cups(d.waterMl) === 1 ? 'cup' : 'cups'} of drinks, ${d.meals.length} item${d.meals.length === 1 ? '' : 's'} logged`;
        const waterPct = Math.min(100, Math.round((cups(d.waterMl) / Math.max(1, waterTarget)) * 100));
        return (
          <button key={d.key} type="button" className="ng-day" aria-pressed={selected === d.key} aria-label={label} title={label} onClick={() => onSelect(d.key)}>
            <span className="ng-day-bar" aria-hidden="true">
              <span className="ng-day-fill" style={{ height: `${(d.groups.length / 5) * 100}%` }} />
            </span>
            <span className="ng-day-name">{isToday ? 'Today' : dayName(d.date)}</span>
            <span className="ng-day-water" aria-hidden="true">
              <span style={{ width: `${waterPct}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Which food groups showed up on which days: a table of dots, plus how many days each group appeared. */
export function GroupGrid({ week }: { week: DayInfo[] }) {
  return (
    <table className="ng-grid">
      <caption className="visually-hidden">Food groups logged on each of the last 7 days</caption>
      <thead>
        <tr>
          <th scope="col">Food group</th>
          {week.map((d) => (
            <th key={d.key} scope="col" className="tiny">
              {dayName(d.date).slice(0, 2)}
            </th>
          ))}
          <th scope="col" className="tiny">
            Days
          </th>
        </tr>
      </thead>
      <tbody>
        {GROUPS.map((g) => {
          const seen = week.filter((d) => d.groups.includes(g)).length;
          return (
            <tr key={g}>
              <th scope="row" className="small">
                {GROUP_LABEL[g]}
              </th>
              {week.map((d) => {
                const on = d.groups.includes(g);
                return (
                  <td key={d.key}>
                    <span className="ng-dot" data-on={on} data-g={g} aria-hidden="true" />
                    <span className="visually-hidden">{on ? `${GROUP_LABEL[g]} logged on ${dayLong(d.date)}` : `${GROUP_LABEL[g]} not logged on ${dayLong(d.date)}`}</span>
                  </td>
                );
              })}
              <td className="num small">
                <strong>{seen}</strong>/7
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
