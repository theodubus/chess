import { Chess } from 'chess.js';
import { type Engine, validateCommand } from './Engine';

/** Adversaire de test déterministe : choisit le premier coup légal, sans recherche. */
export class FakeEngine implements Engine {
  private listeners = new Set<(line: string) => void>();
  private closed = false;
  private chess = new Chess();

  send(command: string) {
    validateCommand(command);
    if (this.closed) throw new Error('Moteur déconnecté.');
    if (command.startsWith('position startpos')) {
      this.chess.reset();
      const moves = command.split(' moves ')[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
      for (const move of moves) this.chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    }
    const move = this.chess.moves({ verbose: true })[0];
    const reply = move ? move.from + move.to + (move.promotion ?? '') : '0000';
    const lines = command === 'uci'
      ? ['id name Moteur factice', 'id author Chess UI', 'uciok']
      : command === 'isready' ? ['readyok'] : command.startsWith('go ') ? [`bestmove ${reply}`] : [];
    queueMicrotask(() => {
      if (!this.closed) for (const line of lines) for (const listener of this.listeners) listener(line);
    });
  }

  onLine(listener: (line: string) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async dispose() {
    if (this.closed) return;
    this.send('quit');
    this.closed = true;
    this.listeners.clear();
  }
}
