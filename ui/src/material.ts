import type { Move, PieceSymbol } from "chess.js";
import type { Side } from "./engine/analysis";

export const captureOrder = ["p", "n", "b", "r", "q"] as const;
export type CapturedPiece = (typeof captureOrder)[number];
const values: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};
export type Captures = Record<
  Side,
  { pieces: CapturedPiece[]; points: number }
>;

/** Les pièces absentes d'une FEN et les pions promus ne sont pas des captures. */
export function capturedMaterial(
  moves: Pick<Move, "color" | "captured">[],
): Captures {
  const result: Captures = {
    w: { pieces: [], points: 0 },
    b: { pieces: [], points: 0 },
  };
  for (const move of moves) {
    if (!move.captured || move.captured === "k") continue;
    result[move.color].pieces.push(move.captured);
    result[move.color].points += values[move.captured];
  }
  for (const side of ["w", "b"] as const)
    result[side].pieces.sort(
      (a, b) => captureOrder.indexOf(a) - captureOrder.indexOf(b),
    );
  return result;
}
