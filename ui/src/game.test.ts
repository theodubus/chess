import { describe, expect, it } from 'vitest';
import { LocalGame, type Promotion } from './game';

function play(game: LocalGame, moves: string[]) {
  for (const san of moves) {
    const legal = game.chess.moves({ verbose: true }).find(move => move.san === san);
    if (!legal) throw new Error(`Coup de préparation illégal : ${san}`);
    expect(game.move(legal.from, legal.to)).toBe(true);
  }
}

describe('Partie locale', () => {
  it('refuse les coups illégaux et alterne les deux camps', () => {
    const game = new LocalGame();
    const initial = game.chess.fen();
    expect(game.destinations().get('e2')).toEqual(['e3', 'e4']);
    expect(game.move('e2', 'e5')).toBe(false);
    expect(game.move('e7', 'e5')).toBe(false);
    expect(game.chess.fen()).toBe(initial);
    play(game, ['e4', 'e5']);
    expect(game.chess.turn()).toBe('w');
  });

  it('déplace aussi la tour lors du roque', () => {
    const game = new LocalGame();
    play(game, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']);
    expect(game.chess.get('g1')?.type).toBe('k');
    expect(game.chess.get('f1')?.type).toBe('r');
    expect(game.chess.get('h1')).toBeUndefined();
  });

  it('retire le pion capturé en passant', () => {
    const game = new LocalGame();
    play(game, ['e4', 'a6', 'e5', 'd5', 'exd6']);
    expect(game.chess.get('d6')).toEqual({ type: 'p', color: 'w' });
    expect(game.chess.get('d5')).toBeUndefined();
  });

  for (const piece of ['q', 'r', 'b', 'n'] as Promotion[]) {
    it(`attend le choix de promotion puis applique ${piece}`, () => {
      const game = new LocalGame();
      play(game, ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2']);
      const before = game.chess.fen();
      expect(game.move('b7', 'a8')).toBe(true);
      expect(game.chess.fen()).toBe(before);
      expect(game.destinations().size).toBe(0);
      expect(game.move('e2', 'e4')).toBe(false);
      game.promote(piece);
      expect(game.chess.get('a8')).toEqual({ type: piece, color: 'w' });
      expect(game.chess.turn()).toBe('b');
      expect(game.pending).toBeNull();
    });
  }

  it('annule la promotion sans déplacer le pion et peut recommencer', () => {
    const game = new LocalGame();
    play(game, ['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2']);
    const before = game.chess.fen();
    game.move('b7', 'a8');
    game.pending = null;
    expect(game.chess.fen()).toBe(before);
    expect(game.destinations().get('b7')).toContain('a8');
    game.reset();
    expect(game.chess.history()).toEqual([]);
    expect(game.destinations().get('e2')).toContain('e4');
  });

  it('signale le mat et bloque les déplacements', () => {
    const game = new LocalGame();
    play(game, ['f3', 'e5', 'g4', 'Qh4#']);
    expect(game.status).toContain('Les Noirs gagnent');
    expect(game.destinations().size).toBe(0);
    expect(game.move('a2', 'a3')).toBe(false);
  });

  it('conserve l’historique nécessaire à la répétition', () => {
    const game = new LocalGame();
    play(game, ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(game.status).toContain('Répétition');
    expect(game.destinations().size).toBe(0);
  });
});
