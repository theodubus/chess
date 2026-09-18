import { Chess } from 'chess.js';
import type { Score, Side } from '../engine/analysis';

export function frenchSan(san: string) {
  const pieces: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
  return san.replace(/[KQRBN]/g, piece => pieces[piece]);
}
export type VariationMove = { label: string; fen: string; from: string; to: string };
export type ReviewPosition = {
  fen: string; command: string; turn: Side; label: string;
  played: string | null; playedSan: string | null; terminal: Score | null;
};
export type ReviewResult = { score: Score | null; depth: number | null; bestMove: string | null; bestSan: string | null; variation: VariationMove[] };

export function gamePositions(pgn: string): ReviewPosition[] {
  const source = new Chess();
  source.loadPgn(pgn);
  const initialFen = source.getHeaders().FEN;
  const board = new Chess(initialFen);
  const moves = source.history({ verbose: true });
  const commands: string[] = [];
  const positions: ReviewPosition[] = [];
  let label = 'Position initiale';
  for (let index = 0; index <= moves.length; index++) {
    const next = moves[index];
    const terminal: Score | null = board.isCheckmate()
      ? { kind: 'mate', value: 0, winner: board.turn() === 'w' ? 'b' : 'w' }
      : board.isDraw() ? { kind: 'cp', value: 0 } : null;
    positions.push({
      fen: board.fen(), turn: board.turn(), label,
      command: `position ${initialFen ? `fen ${initialFen}` : 'startpos'}${commands.length ? ` moves ${commands.join(' ')}` : ''}`,
      played: next ? next.from + next.to + (next.promotion ?? '') : null,
      playedSan: next ? frenchSan(next.san) : null, terminal,
    });
    if (next) {
      label = `Après ${board.moveNumber()}${board.turn() === 'w' ? '.' : '…'} ${frenchSan(next.san)}`;
      board.move(next);
      commands.push(next.from + next.to + (next.promotion ?? ''));
    }
  }
  return positions;
}

export function legalVariation(fen: string, moves: string[]): VariationMove[] {
  const board = new Chess(fen);
  const result: VariationMove[] = [];
  for (const uci of moves.slice(0, 128)) {
    const move = board.moves({ verbose: true }).find(move => move.from + move.to + (move.promotion ?? '') === uci);
    if (!move) return [];
    const label = `${board.moveNumber()}${board.turn() === 'w' ? '.' : '…'} ${frenchSan(move.san)}`;
    board.move(move);
    result.push({ label, fen: board.fen(), from: move.from, to: move.to });
  }
  return result;
}

export function estimatedLoss(before: Score | null, after: Score | null, turn: Side): number | null {
  if (!before || !after || before.kind !== 'cp' || after.kind !== 'cp' || before.bound || after.bound) return null;
  return Math.max(0, (before.value - after.value) * (turn === 'w' ? 1 : -1) / 100);
}
