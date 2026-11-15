import { NavLink, Outlet } from 'react-router';
import './guide.css';

const TABS = [
  { to: '/nutrition', label: 'Today', end: true },
  { to: '/nutrition/foods', label: 'Foods for you', end: false },
  { to: '/nutrition/coach', label: 'Coach', end: false },
  { to: '/nutrition/profile', label: 'My food profile', end: false },
  { to: '/nutrition/snap', label: 'Snap a meal', end: false },
] as const;

/** The Nutrition area: a tab bar over the dashboard, food ideas, coach, profile and the photo reader. */
export function NutritionHub() {
  return (
    <div className="stack-lg ng-hub">
      <nav className="ng-tabs" aria-label="Nutrition sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="ng-tab">
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
