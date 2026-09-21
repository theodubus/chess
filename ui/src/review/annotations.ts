import { Chess } from "chess.js";
import type { Score, Side } from "../engine/analysis";
import type { ReviewPosition, ReviewResult } from "./model";
import { isBookMove } from "./openings";

export const categories = {
  best: { label: "Meilleur coup", symbol: "★" },
  great: { label: "Coup décisif", symbol: "!" },
  excellent: { label: "Excellent", symbol: "" },
  good: { label: "Bon coup", symbol: "✓" },
  inaccuracy: { label: "Imprécision", symbol: "?!" },
  mistake: { label: "Erreur", symbol: "?" },
  blunder: { label: "Gaffe", symbol: "??" },
  miss: { label: "Occasion manquée", symbol: "X" },
  brilliant: { label: "Brillant", symbol: "!!" },
  forced: { label: "Coup forcé", symbol: "→" },
  book: { label: "Coup théorique", symbol: "" },
} as const;
export type Category = keyof typeof categories;
export type Annotation = {
  category: Category;
  reason: string;
  loss: number | null;
};

/** Faits indépendants de la recherche, calculés une seule fois par position. */
export function moveFacts(position: ReviewPosition): Annotation | null {
  if (!position.played || position.terminal) return null;
  const legal = new Chess(position.fen).moves({ verbose: true });
  if (
    legal.length === 1 &&
    legal[0].from + legal[0].to + (legal[0].promotion ?? "") === position.played
  ) {
    return {
      category: "forced",
      loss: null,
      reason:
        "Il n’y avait qu’un seul coup légal dans cette position. Cela ne signifie pas seulement qu’il était le seul bon coup.",
    };
  }
  return isBookMove(position)
    ? {
        category: "book",
        loss: null,
        reason:
          "Ce coup figure dans notre bibliothèque d’ouvertures, issue du catalogue public de Lichess. Il est connu de la théorie ; ce n’est pas une garantie qu’il soit le meilleur.",
      }
    : null;
}

export function withMoveFacts(
  assessment: Annotation | null,
  fact: Annotation | null,
): Annotation | null {
  if (fact?.category === "forced") return fact;
  // Une ligne répertoriée ne doit pas masquer une faute signalée par le moteur.
  if (
    fact &&
    (!assessment || ["best", "excellent", "good"].includes(assessment.category))
  )
    return fact;
  return assessment;
}

function criticalOpportunity(
  previous: number | null,
  before: number,
  after: number,
) {
  if (previous === null) return null;
  if (
    previous < 0.8 &&
    before >= 0.8 &&
    before - previous >= 0.1 &&
    after >= 0.8
  )
    return "win";
  if (
    previous <= 0.2 &&
    before >= 0.45 &&
    after >= 0.45 &&
    before - previous >= 0.1
  )
    return "save";
  return null;
}

/** Indice heuristique, pas une probabilité de victoire ni le modèle de Chess.com. */
export function advantage(
  score: Score | null | undefined,
  side: Side,
): number | null {
  if (!score || score.bound || !Number.isFinite(score.value)) return null;
  if (score.kind === "mate")
    return score.winner ? Number(score.winner === side) : null;
  return 1 / (1 + Math.exp(-(side === "w" ? score.value : -score.value) / 400));
}

export function lossCategory(
  loss: number,
): Exclude<
  Category,
  "best" | "brilliant" | "miss" | "great" | "forced" | "book"
> {
  if (loss < 0.02) return "excellent";
  if (loss < 0.05) return "good";
  if (loss < 0.1) return "inaccuracy";
  if (loss < 0.2) return "mistake";
  return "blunder";
}

const values = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };
function material(board: Chess, side: Side) {
  return board
    .board()
    .flat()
    .reduce(
      (sum, piece) =>
        sum +
        (piece ? values[piece.type] * (piece.color === side ? 1 : -1) : 0),
      0,
    );
}

/** Critère volontairement restrictif : sacrifice accepté dans la meilleure défense. */
export function hasVerifiedSacrifice(
  position: ReviewPosition,
  reply: ReviewResult | null,
): boolean {
  if (!position.played || !reply || reply.variation.length < 2) return false;
  const board = new Chess(position.fen);
  const initial = material(board, position.turn);
  const uci = position.played;
  const played = board.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
  // Les promotions et sacrifices de pions demanderaient d'autres règles.
  if (played.piece === "p" || played.piece === "k") return false;
  const capture = reply.variation[0];
  if (capture.to !== played.to) return false;
  const accepted = new Chess(capture.fen);
  const response = new Chess(reply.variation[1].fen);
  // Une reprise immédiate rétablissant le matériel n'est pas un sacrifice.
  return (
    accepted.turn() === position.turn &&
    material(accepted, position.turn) <= initial - 200 &&
    material(response, position.turn) <= initial - 200
  );
}

export function classifyMove(
  positions: ReviewPosition[],
  results: (ReviewResult | null)[],
  index: number,
  verified = false,
): Annotation | null {
  const position = positions[index];
  if (!position?.played || position.terminal) return null;
  const root = results[index];
  const reply = results[index + 1];
  const before = advantage(root?.score, position.turn);
  const after = advantage(reply?.score, position.turn);
  if (before === null || after === null) return null;
  const loss = Math.max(0, before - after);
  // Des recherches indépendantes peuvent se contredire, même après vérification.
  if (
    after - before > 0.1 ||
    (root?.bestMove === position.played && loss >= 0.02)
  )
    return null;
  const previous =
    index > 0 ? advantage(results[index - 1]?.score, position.turn) : null;
  if (
    previous !== null &&
    previous < 0.8 &&
    before >= 0.8 &&
    before - previous >= 0.1 &&
    after <= 0.55
  ) {
    return {
      category: "miss",
      loss,
      reason:
        "Le coup adverse offrait une chance de prendre un avantage décisif. Le coup joué laisse passer cette occasion et revient à l’égalité ou à une position défavorable.",
    };
  }
  if (
    verified &&
    loss < 0.02 &&
    before >= 0.5 &&
    before < 0.8 &&
    after >= 0.5 &&
    hasVerifiedSacrifice(position, reply)
  ) {
    return {
      category: "brilliant",
      loss,
      reason:
        "Un sacrifice compensé : la meilleure défense du moteur accepte la pièce offerte, mais la position reste au moins équilibrée après vérification.",
    };
  }
  if (
    verified &&
    root?.bestMove === position.played &&
    criticalOpportunity(previous, before, after)
  ) {
    return {
      category: "great",
      loss,
      reason:
        criticalOpportunity(previous, before, after) === "save"
          ? "Ce coup saisit une ressource défensive offerte au coup précédent et sauve une position défavorable. C’est le premier choix du moteur, confirmé par une seconde recherche."
          : "Ce coup exploite l’occasion gagnante offerte au coup précédent. Il est le premier choix du moteur et conserve cet avantage après vérification.",
    };
  }
  if (root?.bestMove === position.played)
    return {
      category: "best",
      loss,
      reason:
        "Le coup joué est le premier choix du moteur, avec des évaluations cohérentes avant et après.",
    };
  const category = lossCategory(loss);
  const descriptions = {
    excellent:
      "Ce coup conserve presque entièrement les possibilités de la position.",
    good: "Ce coup conserve l’essentiel des possibilités de la position.",
    inaccuracy:
      "Ce coup cède une partie de l’avantage ou rend la défense un peu plus difficile.",
    mistake:
      "Ce coup dégrade nettement la position par rapport à la meilleure suite trouvée.",
    blunder:
      "Ce coup perd une part importante des possibilités de la position.",
  };
  let reason = descriptions[category];
  if (
    reply?.score?.kind === "mate" &&
    reply.score.winner !== position.turn &&
    !(root?.score?.kind === "mate" && root.score.winner === reply.score.winner)
  ) {
    reason = "Ce coup permet à l’adversaire de forcer le mat.";
  } else if (
    root?.score?.kind === "mate" &&
    root.score.winner === position.turn &&
    !(reply?.score?.kind === "mate" && reply.score.winner === position.turn)
  ) {
    reason =
      "Un mat forcé était disponible, mais n’est plus confirmé après ce coup.";
  }
  return {
    category,
    loss,
    reason,
  };
}

/** Revoir chaque position concernée une seule fois, historique UCI conservé. */
export function verificationPositions(
  positions: ReviewPosition[],
  results: (ReviewResult | null)[],
): number[] {
  const indices = new Set<number>();
  for (let index = 0; index < positions.length - 1; index++) {
    const position = positions[index];
    if (position.terminal) continue;
    const before = advantage(results[index]?.score, position.turn);
    const after = advantage(results[index + 1]?.score, position.turn);
    if (before === null || after === null) continue;
    const loss = before - after;
    const previous =
      index > 0 ? advantage(results[index - 1]?.score, position.turn) : null;
    if (
      Math.abs(loss) >= 0.1 ||
      (results[index]?.bestMove === position.played && loss >= 0.02) ||
      results[index]?.score?.kind === "mate" ||
      results[index + 1]?.score?.kind === "mate" ||
      (results[index]?.bestMove === position.played &&
        criticalOpportunity(previous, before, after)) ||
      hasVerifiedSacrifice(position, results[index + 1])
    ) {
      for (const candidate of [index - 1, index, index + 1]) {
        if (candidate >= 0 && !positions[candidate].terminal)
          indices.add(candidate);
      }
    }
  }
  return [...indices].sort((a, b) => a - b);
}
