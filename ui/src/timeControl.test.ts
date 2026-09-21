import { expect, it } from 'vitest';
import { parseTimeControl } from './GameClock';

it('convertit une cadence fractionnaire en millisecondes UCI', () => {
  expect(parseTimeControl('7.5', '12')).toEqual({ initialMs: 450_000, incrementMs: 12_000 });
  expect(parseTimeControl('0.5', '0')).toEqual({ initialMs: 30_000, incrementMs: 0 });
  expect(parseTimeControl('180', '60')).toEqual({ initialMs: 10_800_000, incrementMs: 60_000 });
});

it.each([
  ['', '0'], ['5', ''], ['NaN', '3'], ['Infinity', '0'],
  ['0', '3'], ['181', '0'], ['1.1', '0'], ['5', '-1'], ['5', '61'], ['5', '0.5'],
])('refuse la cadence invalide %s + %s', (minutes, increment) => {
  expect(parseTimeControl(minutes, increment)).toBeNull();
});
