import { Chess, type Square } from "chess.js";
import { candidateLine } from "./explanations";
import { defensiveIdea, tacticalIdeas, type TacticalIdea } from "./tactics";
import { materialBalance } from "../material";
import { usableResult } from "./FocusedAnalysis";
import type { ReviewPosition, ReviewResult } from "./model";

export type HintPlan = {
  move: string;
  idea: string;
  piece: string;
  square: Square;
  specific: boolean;
};
const ideas: Record<TacticalIdea["kind"], string> = {
  fork: "Cherchez une double attaque : une même pièce peut viser deux cibles à la fois.",
  pin: "Une pièce adverse peut être gênée par une pièce plus importante derrière elle. Cherchez comment exploiter cet alignement.",
  discovery: "Déplacer une pièce peut libérer la ligne d’attaque d’une autre.",
  defender:
    "Repérez une cible défendue et cherchez comment supprimer son défenseur.",
  hanging:
    "Une pièce adverse peut être prise sans reprise immédiate. Cherchez laquelle.",
  mate: "Cherchez une menace de mat que l’adversaire devra parer.",
  promotion:
    "Un pion peut progresser vers la promotion. Cherchez à dégager son chemin.",
  defence: "Identifiez la menace adverse et cherchez comment la neutraliser.",
};
const names = {
  p: "le pion",
  n: "le cavalier",
  b: "le fou",
  r: "la tour",
  q: "la dame",
  k: "le roi",
};

/** Le texte du premier indice est indépendant des cases et de la notation du coup. */
export function planHints(
  position: ReviewPosition,
  result: ReviewResult | null,
): HintPlan | null {
  if (!usableResult(position, result) || !result.bestMove) return null;
  const line = candidateLine(position, result)!;
  const first = line.steps[1].move!;
  const board = new Chess(position.fen);
  const end = new Chess(line.verifiedEnding!.fen);
  const won = end.isCheckmate() && end.turn() !== first.color;
  const gain =
    (materialBalance(end) - materialBalance(board)) *
    (first.color === "w" ? 1 : -1);
  const recapture =
    line.verifiedEnding!.capture &&
    end
      .moves({ verbose: true })
      .some(
        (move) => move.captured && move.to === line.verifiedEnding!.capture,
      );
  const tactic =
    !recapture && (won || (!end.isCheckmate() && gain > 0))
      ? tacticalIdeas(line, first.color, 1)[0]
      : null;
  const defence = tactic ? null : defensiveIdea(line);
  let idea = tactic
    ? ideas[tactic.kind]
    : defence
      ? ideas.defence
      : "Comparez d’abord les échecs, les prises et les menaces immédiates.";
  let specific = !!tactic || !!defence;
  if (first.san.endsWith("#")) {
    idea = "Vous pouvez donner échec et mat en un coup.";
    specific = true;
  } else if (first.promotion) {
    idea = "Une promotion est possible. Pensez aussi au choix de la pièce.";
    specific = true;
  } else if (board.moves().length === 1) {
    idea = "Dans cette position, un seul coup est légal.";
    specific = true;
  } else if (board.isCheck() && !specific) {
    idea =
      "Votre roi est en échec. Cherchez comment sortir de l’échec, capturer l’attaquant ou interposer une pièce.";
    specific = true;
  }
  return {
    move: result.bestMove,
    idea,
    piece: `Regardez ${names[first.piece]} en ${first.from}.`,
    square: first.from,
    specific,
  };
}
