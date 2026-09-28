import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import type { Side } from "./engine/analysis";

export const HANDICAPS = [
  { value: "none", label: "Aucun · Toutes les pièces", file: "", points: 0 },
  {
    value: "pawn",
    label: "Un pion en moins · Colonne f",
    file: "f",
    points: 1,
  },
  {
    value: "knight",
    label: "Un cavalier en moins · Colonne b",
    file: "b",
    points: 3,
  },
  {
    value: "bishop",
    label: "Un fou en moins · Colonne c",
    file: "c",
    points: 3,
  },
  {
    value: "rook",
    label: "Une tour en moins · Colonne a",
    file: "a",
    points: 5,
  },
  { value: "queen", label: "La dame en moins", file: "d", points: 9 },
] as const;
export type Handicap = (typeof HANDICAPS)[number]["value"];

export function handicapPosition(handicap: Handicap, humanSide: Side): string {
  const choice = HANDICAPS.find((entry) => entry.value === handicap);
  if (!choice?.file) return DEFAULT_POSITION;
  const chess = new Chess();
  const rank =
    handicap === "pawn"
      ? humanSide === "w"
        ? "7"
        : "2"
      : humanSide === "w"
        ? "8"
        : "1";
  // chess.js met aussi à jour le droit au grand roque si la tour disparaît.
  chess.remove(`${choice.file}${rank}` as Square);
  return chess.fen();
}
