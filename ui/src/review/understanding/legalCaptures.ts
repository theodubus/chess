import type { Chess, Square } from "chess.js";
import { capturedSquare } from "./context";

/** Générer seulement les coups des attaquants géométriques, puis laisser
 * chess.js vérifier chaque capture : les pièces clouées ne passent pas.
 * L'EP vise une autre case que celle de la victime et reste incluse. */
export function legalCapturesOf(board: Chess, victim: Square) {
  const attackers = new Set(board.attackers(victim, board.turn()));
  const enPassant = board.fen().split(" ")[3];
  if (enPassant !== "-") {
    for (const square of board.attackers(enPassant as Square, board.turn()))
      if (board.get(square)?.type === "p") attackers.add(square);
  }
  // Le même ordre que moves() sur tout l'échiquier : a8…h1. L'optimisation
  // ne change ni l'ordre des promotions ni celui des témoins retournés.
  const order = (square: Square) => (8 - Number(square[1])) * 8 + square.charCodeAt(0);
  return [...attackers].sort((a, b) => order(a) - order(b)).flatMap((square) =>
    board.moves({ square, verbose: true }).filter((move) => capturedSquare(move) === victim));
}
