import { Chess } from 'chess.js';
import { expect, it } from 'vitest';
import { GameController } from './GameController';

function play(controller: GameController, san: string) {
  const move = controller.game.chess.moves({ verbose: true }).find(move => move.san === san);
  if (!move) throw new Error(`Coup de préparation illégal : ${san}`);
  expect(controller.move(move.from, move.to)).toBe(true);
  const promotion = move.promotion;
  if (promotion === 'q' || promotion === 'r' || promotion === 'b' || promotion === 'n') controller.promote(promotion);
}

it('annule et refait les coups avec leurs temps, sans doubler les incréments', () => {
  let now = 0;
  const controller = new GameController({ timeControl: { initialMs: 10_000, incrementMs: 2000 }, now: () => now });
  play(controller, 'e4');
  now = 1000;
  const before = controller.clock.remaining;
  play(controller, 'e5');
  const after = controller.clock.remaining;
  now = 3000;
  controller.undo();
  expect(controller.game.chess.history()).toEqual(['e4']);
  expect(controller.clock.remaining).toEqual(before);
  expect(controller.canRedo).toBe(true);
  controller.redo();
  expect(controller.clock.remaining).toEqual(after);
  expect(controller.game.chess.history()).toEqual(['e4', 'e5']);
  expect(controller.canRedo).toBe(false);
});

it('abandonne les coups à refaire quand une autre ligne est jouée', () => {
  const controller = new GameController({ now: () => 0 });
  play(controller, 'e4'); play(controller, 'e5');
  controller.undo();
  expect(controller.move('e7', 'e4')).toBe(false);
  expect(controller.canRedo).toBe(true);
  play(controller, 'c5');
  expect(controller.canRedo).toBe(false);
  expect(controller.game.chess.history()).toEqual(['e4', 'c5']);
});

it.each([
  ['roque', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']],
  ['prise en passant', ['e4', 'a6', 'e5', 'd5', 'exd6']],
  ['promotion', ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2', 'bxa8=N']],
] as const)('restaure intégralement le %s', (_, moves) => {
  const controller = new GameController({ now: () => 0 });
  for (const san of moves.slice(0, -1)) play(controller, san);
  const before = controller.game.chess.fen();
  play(controller, moves.at(-1)!);
  const after = controller.game.chess.fen();
  controller.undo();
  expect(controller.game.chess.fen()).toBe(before);
  controller.redo();
  expect(controller.game.chess.fen()).toBe(after);
  expect(controller.game.pending).toBeNull();
});

it('peut revenir avant un mat et le rétablir', () => {
  const controller = new GameController({ now: () => 0 });
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) play(controller, san);
  expect(controller.finished).toBe(true);
  controller.undo();
  expect(controller.finished).toBe(false);
  controller.redo();
  expect(controller.game.chess.isCheckmate()).toBe(true);
  expect(controller.clock.runningColor).toBeNull();
});

it('permet de reprendre après une expiration et réinitialise les piles à une nouvelle partie', () => {
  let now = 0;
  const controller = new GameController({ timeControl: { initialMs: 1000, incrementMs: 0 }, now: () => now });
  play(controller, 'e4');
  now = 1000;
  controller.tick();
  expect(controller.finished).toBe(true);
  controller.undo();
  expect(controller.timeResult).toBe('');
  expect(controller.finished).toBe(false);
  expect(controller.clock.started).toBe(false);
  controller.reset();
  expect(controller.canUndo).toBe(false);
  expect(controller.canRedo).toBe(false);
});

it('conserve les répétitions après annuler/refaire', () => {
  const controller = new GameController({ now: () => 0 });
  for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) play(controller, san);
  expect(controller.game.chess.isThreefoldRepetition()).toBe(true);
  controller.undo();
  expect(controller.game.chess.isThreefoldRepetition()).toBe(false);
  controller.redo();
  expect(controller.game.chess.isThreefoldRepetition()).toBe(true);
});

it('exporte un PGN rechargeable avec résultat, cadence et notation standard', () => {
  const controller = new GameController({ now: () => 0 });
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) play(controller, san);
  const original = controller.game.chess.fen();
  const pgn = controller.exportPgn();
  const loaded = new Chess();
  loaded.loadPgn(pgn);
  expect(loaded.fen()).toBe(original);
  expect(loaded.getHeaders().Result).toBe('0-1');
  expect(loaded.getHeaders().TimeControl).toBe('300+3');
  expect(pgn).toContain('Qh4#');
  expect(controller.game.chess.fen()).toBe(original);
  controller.undo();
  loaded.loadPgn(controller.exportPgn());
  expect(loaded.getHeaders().Result).toBe('*');
  expect(loaded.history()).toEqual(['f3', 'e5', 'g4']);
});

it('exporte une nulle et conserve la mention du temps sans inventer un gagnant', () => {
  const controller = new GameController({ now: () => 0 });
  for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) play(controller, san);
  const loaded = new Chess();
  loaded.loadPgn(controller.exportPgn());
  expect(loaded.getHeaders().Result).toBe('1/2-1/2');
  let now = 0;
  const timed = new GameController({ timeControl: { initialMs: 1000, incrementMs: 0 }, now: () => now });
  play(timed, 'e4');
  now = 1000;
  timed.tick();
  loaded.loadPgn(timed.exportPgn());
  expect(loaded.getHeaders().Result).toBe('*');
  expect(loaded.getHeaders().Termination).toBe('time forfeit');
  expect(loaded.getComment()).toContain('Noirs');
});

it('invalide les coups à refaire lorsqu’on change de cadence au départ', () => {
  const controller = new GameController({ now: () => 0 });
  play(controller, 'e4');
  controller.undo();
  controller.setTimeControl({ initialMs: 60_000, incrementMs: 0 });
  expect(controller.canRedo).toBe(false);
  expect(controller.clock.remaining).toEqual({ w: 60_000, b: 60_000 });
});
