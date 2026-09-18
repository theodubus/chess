import { expect, it } from 'vitest';
import { GameClock, formatTime } from './GameClock';
import { GameController } from './GameController';

it('mesure un long intervalle sans dépendre du nombre de rafraîchissements', () => {
  let now = 0;
  const clock = new GameClock({ initialMs: 60_000, incrementMs: 2000 }, () => now);
  now = 10_000;
  expect(clock.remaining).toEqual({ w: 60_000, b: 60_000 });
  clock.start('w');
  now += 12_345;
  clock.update();
  expect(clock.remaining).toEqual({ w: 47_655, b: 60_000 });
  clock.completeMove('w', false);
  now += 3500;
  expect(clock.remaining).toEqual({ w: 49_655, b: 56_500 });
});

it('suspend et reprend le même temps restant sans facturer la pause', () => {
  let now = 0;
  const clock = new GameClock({ initialMs: 10_000, incrementMs: 0 }, () => now);
  clock.start('b');
  now = 3000;
  clock.pause();
  now = 100_000;
  expect(clock.remaining.b).toBe(7000);
  clock.resume('b');
  now += 1000;
  expect(clock.remaining.b).toBe(6000);
});

it('ne peut pas ressusciter une pendule expirée grâce à un incrément', () => {
  let now = 0;
  const clock = new GameClock({ initialMs: 1000, incrementMs: 3000 }, () => now);
  clock.start('w');
  now = 1000;
  clock.update();
  clock.completeMove('w', false);
  expect(clock.flagged).toBe('w');
  expect(clock.remaining.w).toBe(0);
});

it('démarre seulement sur un coup légal et incrémente les deux camps', () => {
  let now = 0;
  const controller = new GameController({ timeControl: { initialMs: 10_000, incrementMs: 2000 }, now: () => now });
  controller.move('e2', 'e5');
  expect(controller.clock.started).toBe(false);
  controller.move('e2', 'e4');
  expect(controller.clock.remaining).toEqual({ w: 12_000, b: 10_000 });
  now = 1500;
  controller.move('e7', 'e5');
  expect(controller.clock.remaining).toEqual({ w: 12_000, b: 10_500 });
  now += 1000;
  controller.move('g1', 'f3');
  expect(controller.clock.remaining).toEqual({ w: 13_000, b: 10_500 });
});

it('bloque un coup reçu à zéro et réinitialise le résultat et les temps', () => {
  let now = 0;
  const controller = new GameController({ timeControl: { initialMs: 1000, incrementMs: 0 }, now: () => now });
  controller.move('e2', 'e4');
  now = 1000;
  expect(controller.move('e7', 'e5')).toBe(false);
  expect(controller.timeResult).toContain('Noirs');
  expect(controller.game.chess.history()).toEqual(['e4']);
  expect(controller.canMove).toBe(false);
  controller.reset();
  expect(controller.clock.remaining).toEqual({ w: 1000, b: 1000 });
  expect(controller.timeResult).toBe('');
  expect(controller.clock.started).toBe(false);
  expect(controller.canMove).toBe(true);
});

it('facture le choix de promotion et ferme le dialogue si le temps expire', () => {
  let now = 0;
  const controller = new GameController({ timeControl: { initialMs: 1000, incrementMs: 0 }, now: () => now });
  for (const san of ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2']) controller.game.chess.move(san);
  const before = controller.game.chess.fen();
  controller.move('b7', 'a8');
  now = 1000;
  controller.promote('q');
  expect(controller.game.chess.fen()).toBe(before);
  expect(controller.game.pending).toBeNull();
  expect(controller.timeResult).toContain('Blancs');
});

it('ajoute l’incrément seulement après le choix de promotion', () => {
  let now = 0;
  const controller = new GameController({ timeControl: { initialMs: 5000, incrementMs: 1000 }, now: () => now });
  for (const san of ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2']) controller.game.chess.move(san);
  controller.move('b7', 'a8');
  now = 2000;
  expect(controller.clock.remaining.w).toBe(3000);
  controller.promote('n');
  expect(controller.clock.remaining).toEqual({ w: 4000, b: 5000 });
  controller.promote('q');
  expect(controller.clock.remaining.w).toBe(4000);
});

it('fige les deux pendules après le mat', () => {
  let now = 0;
  const controller = new GameController({ now: () => now });
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) {
    const move = controller.game.chess.moves({ verbose: true }).find(move => move.san === san)!;
    controller.move(move.from, move.to);
    now += 100;
  }
  const remaining = controller.clock.remaining;
  now += 1_000_000;
  controller.tick();
  expect(controller.clock.remaining).toEqual(remaining);
  expect(controller.timeResult).toBe('');
});

it('permet un changement de cadence seulement avant le début de partie', () => {
  const controller = new GameController({ now: () => 0 });
  controller.setTimeControl({ initialMs: 1000, incrementMs: 0 });
  controller.move('e2', 'e4');
  controller.setTimeControl({ initialMs: 10_000, incrementMs: 1000 });
  expect(controller.clock.control.initialMs).toBe(1000);
  controller.reset();
  controller.setTimeControl({ initialMs: 10_000, incrementMs: 1000 });
  expect(controller.clock.remaining).toEqual({ w: 10_000, b: 10_000 });
});

it('affiche correctement une minute et les dernières millisecondes', () => {
  expect(formatTime(60_000)).toBe('1:00');
  expect(formatTime(59_999)).toBe('1:00');
  expect(formatTime(1)).toBe('0:01');
  expect(formatTime(0)).toBe('0:00');
});

it('conserve une cadence personnalisée lors des nouvelles parties', () => {
  const controller = new GameController({ now: () => 0 });
  controller.setTimeControl({ initialMs: 450_000, incrementMs: 12_000 });
  controller.move('e2', 'e4');
  controller.reset();
  expect(controller.clock.remaining).toEqual({ w: 450_000, b: 450_000 });
  expect(controller.clock.budget()).toEqual({ wtime: 450_000, btime: 450_000, winc: 12_000, binc: 12_000 });
});
