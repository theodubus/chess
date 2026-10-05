import { Chess } from "chess.js";
import { confirmCause } from "./decisionCause";
import type { MoveExplanation } from "./explanations";
import type { ReviewResult } from "./model";

/** Résultats synthétiques de confirmation, pour isoler les détecteurs des budgets moteur. */
export function confirmForTest(
  explanation: MoveExplanation,
  values?: number[],
) {
  const candidate = explanation.candidate;
  if (!candidate) return explanation;
  const sign = candidate.actor === "w" ? 1 : -1;
  const defaultValues =
    candidate.mode === "loss"
      ? [-500, 500]
      : candidate.mode === "miss"
        ? [500, -500]
        : [0];
  const results: ReviewResult[] = candidate.positions.map((position, index) => {
    const board = new Chess(position.fen);
    const move = board
      .moves({ verbose: true })
      .find((move) => !move.captured && !move.promotion);
    return {
      score: { kind: "cp", value: (values ?? defaultValues)[index] * sign },
      depth: 16,
      bestMove: move ? move.from + move.to + (move.promotion ?? "") : null,
      bestSan: move?.san ?? null,
      variation: move
        ? [{ from: move.from, to: move.to, fen: move.after, label: move.san }]
        : [],
    };
  });
  return confirmCause(explanation, results);
}
