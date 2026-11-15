import { CUP_ML, GROUPS, GROUP_LABEL, type NutritionGoalId } from './types';
import { dayKey, fitsAfter, goalLabel, recommend, weekView, workoutContext, type RecContext, type RecResult, type WorkoutContext } from './engine';
import type { SessionLog } from '../../domain/types';

/**
 * The nutrition coach. It reads your food log, water log, goals and next workout and answers with fixed,
 * tested rules. It is not a chatbot and not a language model: it can only say things written here, every
 * line names its sources, and it runs on your device. It does not diagnose, prescribe diets or count calories.
 */

export interface CoachContext extends RecContext {
  sessions: readonly SessionLog[];
  /** Told us about a heart, metabolic or kidney condition. */
  condition: boolean;
  pregnantOrPostpartum: boolean;
}

export interface Tip {
  id: string;
  tone: 'info' | 'warn' | 'ok';
  title: string;
  body: string;
  sourceIds: string[];
  /** Food ideas to show under the tip. */
  foodIds?: string[];
  action?: { label: string; to: string };
}

const names = (r: RecResult, n = 2) => r.picks.slice(0, n).map((p) => p.food.name.toLowerCase());
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

export function coachTips(ctx: CoachContext): Tip[] {
  const out: Tip[] = [];
  const { np } = ctx;

  if (!np.allergiesConfirmed) {
    return [
      {
        id: 'allergies',
        tone: 'warn',
        title: 'Start with allergies',
        body: 'Before the coach suggests any food, tell us about allergies, even if the answer is none. Until then, it stays quiet on purpose.',
        sourceIds: ['fda-allergens'],
        action: { label: 'Open my food profile', to: '/nutrition/profile' },
      },
    ];
  }

  if (ctx.condition || ctx.pregnantOrPostpartum) {
    out.push({
      id: 'clinician',
      tone: 'warn',
      title: 'Check changes to your eating with a professional',
      body: `You told us about ${ctx.pregnantOrPostpartum ? 'pregnancy or postpartum recovery' : 'a heart, metabolic or kidney condition'}. The ideas here are general. Please check any change to what you eat with your clinician or a registered dietitian first.`,
      sourceIds: ['academy-sports-rdn'],
    });
  }

  const wk = ctx.workout;
  const week = weekView(ctx.meals, ctx.water ?? [], ctx.now);
  const today = week[week.length - 1]!;

  if (wk.plannedToday && !wk.doneToday) {
    const r = recommend(ctx, 'pre', 3);
    out.push({
      id: 'pre',
      tone: 'info',
      title: `Workout planned today (about ${wk.plannedToday.minutes} min)`,
      body: `A small meal about 3 to 4 hours before is usually easiest, mostly carbohydrate with a little protein and not much fat or fibre. A lighter snack closer to the start also works. Ideas that fit your profile: ${list(names(r, 3)) || 'none in our small list match everything you told us'}.`,
      sourceIds: ['aap-sports-nutrition'],
      foodIds: r.picks.map((p) => p.food.id),
    });
  }
  if (wk.doneToday && wk.doneToday.minutesAgo <= 180) {
    const r = recommend(ctx, 'post', 3);
    out.push({
      id: 'post',
      tone: 'ok',
      title: `You finished a workout ${wk.doneToday.minutesAgo < 2 ? 'just now' : `${wk.doneToday.minutesAgo} minutes ago`}`,
      body: `Within the next hour, replace fluids and have a snack with carbohydrate and protein. Ideas that fit your profile: ${list(names(r, 3)) || 'none in our small list match everything you told us'}.`,
      sourceIds: ['aap-sports-nutrition'],
      foodIds: r.picks.map((p) => p.food.id),
    });
  }
  if (wk.plannedToday && wk.plannedToday.minutes > 60) {
    out.push({
      id: 'long',
      tone: 'info',
      title: 'A long session today',
      body: 'Keep water nearby and take small sips regularly. Water is enough for activity under an hour; sports drinks only help in long or very hot sessions, and energy drinks are not recommended.',
      sourceIds: ['aap-sports-nutrition'],
    });
  }

  const cups = today.waterMl / CUP_ML;
  const hour = ctx.now.getHours();
  if (np.goals.includes('hydration') || cups === 0) {
    const target = np.waterTargetCups;
    out.push({
      id: 'water',
      tone: cups >= target ? 'ok' : 'info',
      title: cups >= target ? 'Your drink habit is on track today' : `${Math.round(cups * 10) / 10} of ${target} cups logged today`,
      body:
        cups >= target
          ? 'Nice work. Most healthy people do well simply drinking when thirsty, so treat this counter as a habit helper, not a rule.'
          : hour < 15
            ? 'Try a glass with your next meal. Most healthy people meet their needs by drinking when thirsty, and about a fifth of your water comes from food, so this counter is just a habit helper.'
            : 'Sip some water over the evening if you are thirsty. This counter is a habit helper, not a target you must hit.',
      sourceIds: ['nasem-water'],
    });
  }

  const gaps = recommend(ctx, 'any', 1).gaps;
  if (!gaps.enough) {
    out.push({
      id: 'log-more',
      tone: 'info',
      title: 'Log a few days to see your patterns',
      body: `You have food logged on ${gaps.loggedDays} of the last 7 days. After 3 days the dashboard can show which food groups appear often and which are rare in your log.`,
      sourceIds: [],
      action: { label: 'Log a meal', to: '/nutrition' },
    });
  } else if (gaps.rarely.length) {
    const g = gaps.rarely.map((x) => GROUP_LABEL[x.group].toLowerCase());
    const r = recommend(ctx, 'any', 3);
    out.push({
      id: 'gaps',
      tone: 'info',
      title: `${GROUP_LABEL[gaps.rarely[0]!.group]} are rare in your log`,
      body: `Across the ${gaps.loggedDays} days you logged this week, ${list(g)} showed up on very few. That only describes what you logged, not what you eat or what your body needs. If you did eat them, log them next time. To add some, try: ${list(names(r, 3))}.`,
      sourceIds: ['dga-2025'],
      foodIds: r.picks.map((p) => p.food.id),
    });
  } else {
    out.push({
      id: 'variety-ok',
      tone: 'ok',
      title: 'Good variety in your log',
      body: 'Every food group appears regularly in what you logged this week. Trying one new food keeps it interesting.',
      sourceIds: ['dga-2025'],
    });
  }

  if (np.goals.includes('habits') && hour >= 11 && !today.slots.includes('breakfast') && today.meals.length === 0) {
    out.push({
      id: 'habit-breakfast',
      tone: 'info',
      title: 'Nothing logged yet today',
      body: 'Regular meals and snacks are an easy habit to build. Log what you have had so far, even a small snack, to keep your week complete.',
      sourceIds: ['aap-sports-nutrition'],
      action: { label: 'Log food', to: '/nutrition' },
    });
  }
  return out;
}

/* ───────────── Goal progress ───────────── */

export interface GoalProgress {
  id: NutritionGoalId;
  label: string;
  value: number;
  target: number;
  /** Plain-language line shown under the bar. */
  detail: string;
}

const HABIT_DAYS = 5;
const VARIETY_FOODS = 10;

export function goalProgress(ctx: CoachContext): GoalProgress[] {
  const week = weekView(ctx.meals, ctx.water ?? [], ctx.now);
  const out: GoalProgress[] = [];
  const today = week[week.length - 1]!;
  const lab = (id: NutritionGoalId) => goalLabel(id, ctx.ageYears);
  for (const id of ctx.np.goals) {
    if (id === 'hydration') {
      const need = ctx.np.waterTargetCups * CUP_ML;
      const days = week.filter((d) => d.waterMl >= need).length;
      out.push({ id, label: lab(id), value: Math.round((today.waterMl / CUP_ML) * 10) / 10, target: ctx.np.waterTargetCups, detail: `${days} of the last 7 days reached your drink habit target.` });
    } else if (id === 'variety') {
      const foods = new Set(week.flatMap((d) => d.foods.map((f) => f.toLowerCase())));
      out.push({ id, label: lab(id), value: Math.min(foods.size, VARIETY_FOODS), target: VARIETY_FOODS, detail: `${foods.size} different foods logged this week. A habit goal of ${VARIETY_FOODS}.` });
    } else if (id === 'balanced') {
      const logged = week.filter((d) => d.meals.length > 0);
      const good = logged.filter((d) => d.groups.length >= 3).length;
      out.push({ id, label: lab(id), value: good, target: Math.max(1, Math.min(HABIT_DAYS, logged.length || HABIT_DAYS)), detail: `${good} of ${logged.length} logged days had three or more food groups.` });
    } else if (id === 'habits') {
      const days = week.filter((d) => d.slots.length >= 3).length;
      out.push({ id, label: lab(id), value: Math.min(days, HABIT_DAYS), target: HABIT_DAYS, detail: `${days} days this week with three or more meals or snacks logged.` });
    } else {
      const sess = ctx.sessions.filter((s) => s.endedAt && week.some((d) => d.key === dayKey(new Date(s.endedAt))));
      const keys = [...new Set(sess.map((s) => dayKey(new Date(s.endedAt))))];
      if (id === 'performance') {
        const fed = keys.filter((k) => (week.find((d) => d.key === k)?.meals.length ?? 0) > 0).length;
        out.push({ id, label: lab(id), value: fed, target: Math.max(1, keys.length), detail: keys.length ? `Food logged on ${fed} of ${keys.length} workout days.` : 'No workouts finished in the last 7 days yet.' });
      } else {
        const refuelled = sess.filter((s) => ctx.meals.some((m) => dayKey(new Date(m.at)) === dayKey(new Date(s.endedAt)) && m.at >= s.endedAt && fitsAfter(m))).length;
        out.push({ id, label: lab(id), value: refuelled, target: Math.max(1, sess.length), detail: sess.length ? `A carbohydrate-and-protein snack logged after ${refuelled} of ${sess.length} workouts.` : 'No workouts finished in the last 7 days yet.' });
      }
    }
  }
  return out;
}

/* ───────────── Explaining things ───────────── */

export interface Topic {
  id: string;
  question: string;
  keywords: string[];
}

export const TOPICS: readonly Topic[] = [
  { id: 'pre', question: 'What should I eat before a workout?', keywords: ['before', 'pre', 'prior', 'fuel', 'energy'] },
  { id: 'post', question: 'What should I eat after a workout?', keywords: ['after', 'post', 'recover', 'recovery', 'refuel'] },
  { id: 'protein', question: 'What is protein for?', keywords: ['protein', 'muscle', 'muscles'] },
  { id: 'carbs', question: 'Why do people talk about carbohydrates?', keywords: ['carb', 'carbs', 'carbohydrate', 'carbohydrates', 'sugar'] },
  { id: 'water', question: 'How much water do I need?', keywords: ['water', 'hydrat', 'drink', 'thirst', 'fluid'] },
  { id: 'variety', question: 'Why does eating a variety matter?', keywords: ['variety', 'groups', 'colour', 'color', 'different'] },
  { id: 'labels', question: 'How do I check a label for allergens?', keywords: ['allergy', 'allergen', 'allergic', 'label', 'cross', 'contact'] },
  { id: 'calories', question: 'Do I need to count calories?', keywords: ['calorie', 'calories', 'weight', 'diet', 'lose'] },
  { id: 'drinks', question: 'What about sports drinks, energy drinks and supplements?', keywords: ['sports drink', 'energy drink', 'supplement', 'creatine', 'caffeine', 'powder', 'shake'] },
];

export interface Answer {
  title: string;
  paragraphs: string[];
  sourceIds: string[];
  foodIds?: string[];
}

const personal = (ctx: CoachContext, want: 'pre' | 'post') => {
  const r = recommend(ctx, want, 3);
  return r.blocked ? null : r;
};

/** A plain-language answer to one of the fixed topics, personalised with your profile where it helps. */
export function answerTopic(id: string, ctx: CoachContext): Answer {
  switch (id) {
    case 'pre': {
      const r = personal(ctx, 'pre');
      return {
        title: 'Before a workout',
        paragraphs: [
          'About 3 to 4 hours before, a small meal that is mostly carbohydrate, with a moderate amount of protein, and low in fat and fibre, is gentle on the stomach. Closer to the start, a lighter snack is fine.',
          'Young children doing light activity for under an hour often do not need an extra snack. Everyday good eating matters more.',
          r ? (r.picks.length ? `From our list, and leaving out everything your profile rules out: ${list(names(r, 3))}.` : 'Our small list has nothing that matches everything you told us. A registered dietitian can help you find options.') : 'Add your allergies first and we will suggest ideas.',
        ],
        sourceIds: ['aap-sports-nutrition'],
        foodIds: r?.picks.map((p) => p.food.id),
      };
    }
    case 'post': {
      const r = personal(ctx, 'post');
      return {
        title: 'After a workout',
        paragraphs: [
          'Within 30 to 60 minutes, replace fluids and have a snack with carbohydrate and protein. Chocolate milk is one simple example, if milk suits you.',
          r ? (r.picks.length ? `From our list, and leaving out everything your profile rules out: ${list(names(r, 3))}.` : 'Our small list has nothing that matches everything you told us. A registered dietitian can help you find options.') : 'Add your allergies first and we will suggest ideas.',
        ],
        sourceIds: ['aap-sports-nutrition'],
        foodIds: r?.picks.map((p) => p.food.id),
      };
    }
    case 'protein':
      return {
        title: 'Protein',
        paragraphs: [
          'Protein is the building material your body uses to repair and build muscle and many other tissues. Protein foods include meat, fish, eggs, beans and lentils, tofu, nuts and seeds, and dairy foods supply some as well.',
          'Most people who eat a varied diet get plenty. Most young athletes who eat a healthy, balanced diet do not need protein powders. How much is right for you depends on your age, size and health, so ask a registered dietitian for a number.',
        ],
        sourceIds: ['dga-2025', 'academy-sports-rdn'],
      };
    case 'carbs':
      return {
        title: 'Carbohydrates',
        paragraphs: [
          'Carbohydrates are your body’s quickest fuel. They are in grains, fruit, starchy vegetables, beans and milk. Choosing whole grains and whole fruit keeps more fibre and other nutrients than highly processed options.',
          'Before training, easy-to-digest carbohydrate with little fat or fibre sits lightly. After training, carbohydrate with some protein helps you refuel.',
        ],
        sourceIds: ['dga-2025', 'aap-sports-nutrition'],
      };
    case 'water':
      return {
        title: 'Water',
        paragraphs: [
          'Most healthy people meet their daily needs by drinking when they are thirsty, and about a fifth of the water they take in comes from food. There is no official “glasses a day” rule, because needs vary and can be met from many drinks and foods. Very active people and people in hot places may need more.',
          `The drink counter in this app is a habit helper. Yours is set to ${ctx.np.waterTargetCups} cups; you can change it any time. For exercise, water is enough for under an hour. Sports drinks are only for long or very hot sessions, and energy drinks are not recommended.`,
          'If you are very thirsty all the time, or have a medical condition that affects fluids, speak with a clinician.',
        ],
        sourceIds: ['nasem-water', 'aap-sports-nutrition'],
      };
    case 'variety':
      return {
        title: 'Variety',
        paragraphs: [
          'Official U.S. guidance centres on whole, nutrient-dense foods: a wide variety of vegetables and fruits, whole grains, and protein foods from animal and plant sources, while avoiding highly processed foods.',
          'Different foods bring different nutrients, so variety across the week is a simple way to cover your bases. The dashboard shows which food groups appear in your log so you can spot easy additions.',
        ],
        sourceIds: ['dga-2025'],
      };
    case 'labels':
      return {
        title: 'Allergies and labels',
        paragraphs: [
          'The nine major allergens in the U.S. are milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy and sesame. Packaged foods must list them, but companies can change recipes, and cross-contact in a factory or kitchen can add an allergen to a food that does not list it as an ingredient.',
          'So: read the label every time you buy, even for a food you know, look for “may contain” statements, and ask about preparation when eating out. This app never labels any food as safe for an allergy. The foods it suggests are generic versions that leave out the allergens you told us about, and shop-bought versions must still be checked.',
          'For allergies, ask your allergist or doctor what is right for you, and what to do in an emergency. For a severe reaction (trouble breathing, swelling of the face or throat, fainting), call your local emergency number straight away.',
        ],
        sourceIds: ['fda-allergens', 'academy-sports-rdn'],
      };
    case 'calories':
      return {
        title: 'Counting calories',
        paragraphs: [
          'This guide is built around regular meals, variety, enough food and drinking when thirsty, not around weight or calorie limits. You do not need to count calories to use it, and for people under 18 the app hides calorie numbers entirely.',
          'If you want to change your weight, or food and weight are taking up a lot of your thoughts, please talk with a doctor or a registered dietitian, who can look at the whole picture.',
        ],
        sourceIds: ['academy-sports-rdn'],
      };
    case 'drinks':
      return {
        title: 'Sports drinks, energy drinks and supplements',
        paragraphs: [
          'For activity under an hour, water is enough. Sports drinks can help in sessions lasting longer than 1 to 2 hours or in very hot places. Energy drinks, which contain caffeine and extra sugar, are not recommended for children and teens.',
          'Most young athletes who eat well do not need supplements. Please talk with a doctor or registered dietitian before taking any.',
        ],
        sourceIds: ['aap-sports-nutrition', 'academy-sports-rdn'],
      };
    default:
      return { title: 'Topics I can explain', paragraphs: [`Try one of: ${TOPICS.map((t) => t.question).join(' ')}`], sourceIds: [] };
  }
}

/** Match typed words to a fixed topic. Returns null when nothing matches, so the coach never invents an answer. */
export function matchTopic(question: string): string | null {
  const q = ` ${question.toLowerCase().replace(/[^a-z ]+/g, ' ')} `;
  let best: { id: string; score: number } | null = null;
  for (const t of TOPICS) {
    const score = t.keywords.filter((k) => q.includes(k.length > 4 ? ` ${k.slice(0, -1)}` : ` ${k} `) || q.includes(` ${k}`)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: t.id, score };
  }
  return best?.id ?? null;
}

/** A short plain-language recap of the week, for the Coach and the dashboard. */
export function weeklyRecap(ctx: CoachContext): string[] {
  const week = weekView(ctx.meals, ctx.water ?? [], ctx.now);
  const logged = week.filter((d) => d.meals.length > 0);
  const groups = GROUPS.filter((g) => logged.some((d) => d.groups.includes(g)));
  const foods = new Set(week.flatMap((d) => d.foods.map((f) => f.toLowerCase())));
  const waterDays = week.filter((d) => d.waterMl > 0).length;
  const lines = [`Food logged on ${logged.length} of the last 7 days, with ${foods.size} different food${foods.size === 1 ? '' : 's'}.`];
  if (logged.length) lines.push(`Food groups seen: ${groups.length ? groups.map((g) => GROUP_LABEL[g].toLowerCase()).join(', ') : 'none yet'}.`);
  lines.push(`Drinks logged on ${waterDays} of the last 7 days.`);
  return lines;
}

export type { WorkoutContext };
export { workoutContext };
