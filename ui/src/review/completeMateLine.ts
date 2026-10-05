import { Chess } from "chess.js";
import type { Score, SearchInfo, Side } from "../engine/analysis";
import { boardFromCommand } from "./StudyTree";
import { legalVariation, type VariationMove } from "./model";

function matePlies(score: Score | null, turn: Side) {
  if (score?.kind !== "mate" || score.bound || !score.winner) return null;
  const distance = Math.abs(score.value);
  if (!Number.isSafeInteger(distance) || distance < 1) return null;
  return 2 * distance - (score.winner === turn ? 1 : 0);
}

export function isCompleteMateLine(score: Score | null, turn: Side, line: VariationMove[]) {
  const limit = matePlies(score, turn);
  if (!limit || !line.length || line.length > limit) return false;
  const end = new Chess(line[line.length - 1].fen);
  return end.isCheckmate() && end.turn() !== score?.winner;
}

type ContinuationSearch = (command: string, budget: number, turn: Side) => Promise<{
  bestMove: string;
  info: SearchInfo | null;
}>;

/** Une PV peut être tronquée par le moteur malgré un score de mat exact.
 * Rechercher sa fin complète l'illustration, sans prouver toutes les défenses.
 */
export async function completeMateLine(
  command: string, moves: string[], score: Score | null,
  deadline: number, search: ContinuationSearch,
): Promise<VariationMove[]> {
  const board = boardFromCommand(command);
  const initialFen = board.fen();
  const line = legalVariation(initialFen, moves);
  const limit = matePlies(score, board.turn());
  // Même borne que le lecteur de PV ; aucune exploration sans fin d'un mat annoncé.
  if (!limit || limit > 128 || line.length !== moves.length) return line;
  const played = [...moves];
  for (const uci of played)
    board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

  while (!board.isGameOver() && played.length < limit) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 1) break;
    // Conserver l'historique PGN, notamment pour les répétitions et les nulles.
    const position = command + (command.includes(" moves ") ? " " : " moves ") + played.join(" ");
    const next = await search(position, remaining, board.turn());
    const distance = matePlies(next.info?.score ?? null, board.turn());
    if (!distance || next.info?.score?.winner !== score?.winner || distance > limit - played.length) break;

    let continuation = next.info?.pv?.[0] === next.bestMove ? next.info.pv : [next.bestMove];
    let legal = legalVariation(board.fen(), continuation);
    if (!legal.length) {
      continuation = [next.bestMove];
      legal = legalVariation(board.fen(), continuation);
    }
    if (!legal.length || continuation.length > limit - played.length) break;
    for (const uci of continuation) {
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      played.push(uci);
    }
  }
  return legalVariation(initialFen, played);
}
