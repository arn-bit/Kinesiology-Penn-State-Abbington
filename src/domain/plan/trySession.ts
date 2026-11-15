import type { TryOverride } from './engine';

/**
 * Free-play sessions travel in the page address as `id` or `id~sets~amount`, joined by commas, for example
 * `squat~3~12,march`. Reading it back is strict: anything that is not a plain id and whole numbers is ignored.
 */
export function encodeTry(entries: { id: string; sets?: number; amount?: number }[]): string {
  return entries.map((e) => (e.sets !== undefined && e.amount !== undefined ? `${e.id}~${e.sets}~${e.amount}` : e.id)).join(',');
}

const ID = /^[a-z0-9_]{1,60}$/;

export function decodeTry(param: string | null): { ids: string[]; custom: Record<string, TryOverride> } {
  const ids: string[] = [];
  const custom: Record<string, TryOverride> = {};
  for (const part of (param ?? '').split(',')) {
    const [id, sets, amount] = part.split('~');
    if (!id || !ID.test(id) || ids.includes(id)) continue;
    ids.push(id);
    const s = sets !== undefined && /^\d{1,3}$/.test(sets) ? Number(sets) : undefined;
    const a = amount !== undefined && /^\d{1,4}$/.test(amount) ? Number(amount) : undefined;
    if (s !== undefined || a !== undefined) custom[id] = { sets: s, amount: a };
  }
  return { ids, custom };
}
