import { expect, it } from 'vitest';
import {
  describeTimeControl,
  parseTimeControl,
  sameTimeControl,
  timeControlFromParts,
  validTimeControl,
} from './GameClock';

it('règle une pendule à la seconde, dans les bornes de la carte personnalisée', () => {
  expect(timeControlFromParts('0', '30', '0')).toEqual({ initialMs: 30_000, incrementMs: 0 });
  expect(timeControlFromParts('2', '15', '1')).toEqual({ initialMs: 135_000, incrementMs: 1000 });
  expect(timeControlFromParts('180', '0', '60')).toEqual({ initialMs: 10_800_000, incrementMs: 60_000 });
});

it.each([
  ['0', '29', '0'], ['180', '1', '0'], ['3', '60', '0'], ['3', '0', '61'],
  ['', '0', '0'], ['3', '', '0'], ['-1', '30', '0'], ['1.5', '0', '0'], ['3', '0', 'x'],
])('refuse la pendule invalide %s min %s s + %s s', (minutes, seconds, increment) => {
  expect(timeControlFromParts(minutes, seconds, increment)).toBeNull();
});

it('ne relit que des pendules entières en secondes, dans les bornes', () => {
  expect(validTimeControl({ initialMs: 135_000, incrementMs: 0 })).toEqual({ initialMs: 135_000, incrementMs: 0 });
  for (const value of [null, {}, { initialMs: 30_500, incrementMs: 0 }, { initialMs: 20_000, incrementMs: 0 },
    { initialMs: 60_000, incrementMs: -1000 }, { initialMs: '60000', incrementMs: 0 }])
    expect(validTimeControl(value)).toBeNull();
});

it('dit la cadence comme on la lit', () => {
  expect(describeTimeControl({ initialMs: 180_000, incrementMs: 0 })).toBe('3 min');
  expect(describeTimeControl({ initialMs: 30_000, incrementMs: 0 })).toBe('30 s');
  expect(describeTimeControl({ initialMs: 135_000, incrementMs: 1000 })).toBe('2 min 15 s + 1 s');
  expect(sameTimeControl({ initialMs: 1, incrementMs: 2 }, { initialMs: 1, incrementMs: 2 })).toBe(true);
  expect(sameTimeControl({ initialMs: 1, incrementMs: 2 }, { initialMs: 1, incrementMs: 3 })).toBe(false);
});

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
