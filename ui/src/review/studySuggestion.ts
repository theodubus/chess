import type { Chess } from "chess.js";
import type { ReviewResult } from "./model";
import type { StudyTree } from "./StudyTree";

/** Le conseil concerne le camp au trait dans la position explorée, après le coup. */
export function studySuggestion(board: Chess, result: ReviewResult | null) {
  if (!result?.bestMove || board.isGameOver()) return null;
  return board.moves({ verbose: true }).find(
    move => move.from + move.to + (move.promotion ?? "") === result.bestMove,
  ) ?? null;
}

/** Revalider au clic conserve les promotions et refuse un conseil devenu illégal. */
export function playStudySuggestion(tree: StudyTree, node: number, result: ReviewResult | null) {
  const move = studySuggestion(tree.board(node), result);
  return move ? tree.play(node, move.from, move.to, move.promotion) : null;
}
