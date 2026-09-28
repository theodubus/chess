import {
  Chess,
  DEFAULT_POSITION,
  type Square,
  type PieceSymbol,
} from "chess.js";
import type { Side } from "./engine/analysis";

// Les cases sont enregistrées comme si le moteur jouait les noirs : le choix
// aléatoire de couleur ne doit pas changer l'armée préparée par le joueur.
export type Army = Partial<Record<Square, PieceSymbol>>;
export type Handicap = Army | null;
export const pieceNames: Record<PieceSymbol, string> = {
  p: "Pion",
  n: "Cavalier",
  b: "Fou",
  r: "Tour",
  q: "Dame",
  k: "Roi",
};
export function defaultArmy(): Army {
  return Object.fromEntries(
    new Chess()
      .board()
      .flat()
      .filter((piece) => piece?.color === "b")
      .map((piece) => [piece!.square, piece!.type]),
  );
}
export function armySquare(square: Square, humanSide: Side): Square {
  return humanSide === "w"
    ? square
    : (`${square[0]}${9 - Number(square[1])}` as Square);
}
export function armyFen(army: Army, humanSide: Side): string {
  const chess = new Chess();
  const color = humanSide === "w" ? "b" : "w";
  for (const piece of chess.board().flat())
    if (piece?.color === color) chess.remove(piece.square);
  for (const [square, type] of Object.entries(army))
    chess.put({ type, color }, armySquare(square as Square, humanSide));
  // Seules les pièces sur leurs cases d'origine peuvent encore roquer.
  chess.setCastlingRights(color, {
    k: army.e8 === "k" && army.h8 === "r",
    q: army.e8 === "k" && army.a8 === "r",
  });
  return chess.fen();
}
export function armyError(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Configuration invalide.";
  const entries = Object.entries(value);
  if (
    entries.some(
      ([square, piece]) =>
        !/^[a-h][3-8]$/.test(square) ||
        !["p", "n", "b", "r", "q", "k"].includes(piece),
    )
  )
    return "Vous pouvez uniquement modifier le camp du moteur, hors de vos deux rangées de départ.";
  if (entries.filter(([, piece]) => piece === "k").length !== 1)
    return "Le moteur doit avoir exactement un roi.";
  if (entries.length > 16) return "Le moteur peut avoir au maximum 16 pièces.";
  if (entries.filter(([, piece]) => piece === "p").length > 8)
    return "Le moteur peut avoir au maximum 8 pions.";
  if (entries.some(([square, piece]) => piece === "p" && square[1] === "8"))
    return "Un pion ne peut pas être sur la dernière rangée.";
  for (const side of ["w", "b"] as const) {
    try {
      const chess = new Chess(armyFen(value as Army, side));
      for (const piece of chess.board().flat())
        if (
          piece?.type === "k" &&
          chess.isAttacked(piece.square, piece.color === "w" ? "b" : "w")
        )
          return "Déplacez les pièces : aucun roi ne doit commencer en échec.";
      if (chess.isGameOver())
        return "La position doit permettre de commencer une partie.";
    } catch {
      return "La position n’est pas valide.";
    }
  }
  return null;
}
export function handicapPosition(handicap: Handicap, humanSide: Side): string {
  if (!handicap) return DEFAULT_POSITION;
  const error = armyError(handicap);
  if (error) throw new Error(error);
  return armyFen(handicap, humanSide);
}
export function readHandicap(value: unknown): Handicap {
  if (typeof value === "string") {
    const legacy = {
      pawn: "f7",
      knight: "b8",
      bishop: "c8",
      rook: "a8",
      queen: "d8",
    } as const;
    const square = legacy[value as keyof typeof legacy];
    if (typeof square !== "string") return null;
    const army = defaultArmy();
    delete army[square];
    return army;
  }
  return armyError(value) ? null : (value as Army);
}
export function sameArmy(a: Army, b: Army): boolean {
  return Object.keys({ ...a, ...b }).every(
    (square) => a[square as Square] === b[square as Square],
  );
}
