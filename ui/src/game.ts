import { Chess } from 'chess.js';
import type { Key } from '@lichess-org/chessground/types';

export type Promotion = 'q' | 'r' | 'b' | 'n';

export class LocalGame {
  readonly chess = new Chess();
  pending: { from: Key; to: Key } | null = null;

  destinations(): Map<Key, Key[]> {
    const result = new Map<Key, Key[]>();
    if (this.pending || this.chess.isGameOver()) return result;
    for (const move of this.chess.moves({ verbose: true })) {
      const targets = result.get(move.from) ?? [];
      if (!targets.includes(move.to)) targets.push(move.to);
      result.set(move.from, targets);
    }
    return result;
  }

  move(from: Key, to: Key): boolean {
    if (this.pending || this.chess.isGameOver()) return false;
    const candidates = this.chess.moves({ verbose: true }).filter(m => m.from === from && m.to === to);
    if (!candidates.length) return false;
    // La position reste inchangée tant que le joueur n'a pas choisi sa pièce.
    if (candidates.some(m => m.promotion)) this.pending = { from, to };
    else this.chess.move({ from, to });
    return true;
  }

  promote(piece: Promotion) {
    if (!this.pending) return;
    this.chess.move({ ...this.pending, promotion: piece });
    this.pending = null;
  }

  reset() {
    this.pending = null;
    this.chess.reset();
  }

  get status(): string {
    const side = this.chess.turn() === 'w' ? 'Blancs' : 'Noirs';
    if (this.pending) return 'Choisissez la pièce de promotion';
    if (this.chess.isCheckmate()) return `Échec et mat · Les ${side === 'Blancs' ? 'Noirs' : 'Blancs'} gagnent`;
    if (this.chess.isStalemate()) return 'Partie nulle · Pat';
    if (this.chess.isThreefoldRepetition()) return 'Partie nulle · Répétition';
    if (this.chess.isInsufficientMaterial()) return 'Partie nulle · Matériel insuffisant';
    if (this.chess.isDraw()) return 'Partie nulle · Règle des 50 coups';
    return `Aux ${side.toLowerCase()} de jouer${this.chess.isCheck() ? ' · Échec' : ''}`;
  }
}
