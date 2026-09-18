import { expect, it } from 'vitest';
import { parseSearchInfo, scoreLabel, whiteShare } from './analysis';

it('convertit les centipions du camp au trait vers le point de vue blanc', () => {
  expect(parseSearchInfo('info depth 12 score cp 125 nodes 100 pv e2e4', 'w')).toEqual({ depth: 12, score: { kind: 'cp', value: 125 } });
  expect(parseSearchInfo('info depth 12 score cp 125 nodes 100 pv e7e5', 'b')).toEqual({ depth: 12, score: { kind: 'cp', value: -125 } });
  expect(parseSearchInfo('info score cp -35 depth 7', 'b')?.score?.value).toBe(35);
});

it('reconnaît le camp qui annonce un mat, y compris mat à zéro', () => {
  expect(parseSearchInfo('info score mate 3', 'b')?.score).toEqual({ kind: 'mate', value: -3, winner: 'b' });
  expect(parseSearchInfo('info score mate -2', 'b')?.score).toEqual({ kind: 'mate', value: 2, winner: 'w' });
  expect(parseSearchInfo('info score mate 0', 'w')?.score?.winner).toBe('b');
  expect(parseSearchInfo('info score mate 0', 'b')?.score?.winner).toBe('w');
});

it('retourne également le sens des bornes pour les noirs', () => {
  expect(parseSearchInfo('info score cp 100 lowerbound', 'b')?.score).toEqual({ kind: 'cp', value: -100, bound: 'upper' });
  expect(parseSearchInfo('info score cp -100 upperbound', 'b')?.score).toEqual({ kind: 'cp', value: 100, bound: 'lower' });
});

it('ne prend pas un commentaire ou une variante secondaire pour une évaluation', () => {
  expect(parseSearchInfo('info string depth 18 score cp 800', 'w')).toBeNull();
  expect(parseSearchInfo('info multipv 2 depth 18 score cp 800', 'w')).toBeNull();
  expect(parseSearchInfo('bestmove e2e4', 'w')).toBeNull();
  expect(parseSearchInfo('info nodes 100 nps 4000', 'w')).toBeNull();
  expect(parseSearchInfo('info depth 4 pv e2e4 score cp 999', 'w')).toEqual({ depth: 4 });
});

it('ignore les nombres invalides sans perdre une profondeur valide', () => {
  expect(parseSearchInfo('info depth 8 score cp NaN', 'w')).toEqual({ depth: 8 });
  expect(parseSearchInfo('info depth -1 score cp 1.2', 'w')).toBeNull();
  expect(parseSearchInfo('info score cp 9007199254740992', 'w')).toBeNull();
});

it('affiche les scores en pions et les mats sans inventer une probabilité', () => {
  expect(scoreLabel({ kind: 'cp', value: 125 })).toBe('+1,25');
  expect(scoreLabel({ kind: 'cp', value: -125, bound: 'upper' })).toBe('≤ -1,25');
  expect(scoreLabel({ kind: 'mate', value: -3, winner: 'b' })).toBe('Mat en 3 · Noirs');
  expect(scoreLabel(null)).toBe('—');
  expect(whiteShare({ kind: 'cp', value: 0 })).toBe(50);
  expect(whiteShare({ kind: 'cp', value: 125 })).toBeGreaterThan(50);
  expect(whiteShare({ kind: 'cp', value: -125 })).toBeLessThan(50);
  expect(whiteShare({ kind: 'mate', value: 3, winner: 'w' })).toBe(100);
  expect(whiteShare({ kind: 'mate', value: -3, winner: 'b' })).toBe(0);
});
