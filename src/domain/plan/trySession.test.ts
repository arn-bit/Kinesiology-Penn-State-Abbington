import { describe, expect, it } from 'vitest';
import { decodeTry, encodeTry } from './trySession';

describe('free-play session address', () => {
  it('round-trips ids with and without your own numbers', () => {
    const text = encodeTry([{ id: 'squat', sets: 3, amount: 12 }, { id: 'march_in_place' }]);
    expect(text).toBe('squat~3~12,march_in_place');
    expect(decodeTry(text)).toEqual({ ids: ['squat', 'march_in_place'], custom: { squat: { sets: 3, amount: 12 } } });
  });

  it('ignores anything that is not a plain id and whole numbers', () => {
    const r = decodeTry('squat~x~99999,<script>,../etc,squat,march~2~');
    expect(r.ids).toEqual(['squat', 'march']);
    expect(r.custom.squat).toBeUndefined();
    expect(r.custom.march).toEqual({ sets: 2, amount: undefined });
    expect(decodeTry(null)).toEqual({ ids: [], custom: {} });
    expect(decodeTry('squat~NaN~NaN').custom).toEqual({});
  });
});
