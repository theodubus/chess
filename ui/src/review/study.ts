import { type Annotation } from "./annotations";
import type { ReviewPosition } from "./model";
import type { Side } from "../engine/analysis";

export const badMove = (annotation: Annotation | null | undefined) =>
  !!annotation &&
  ["inaccuracy", "mistake", "blunder", "miss"].includes(annotation.category);
export function notablePositions(
  annotations: (Annotation | null)[],
  positions: ReviewPosition[] = [],
  side: Side | "both" = "both",
) {
  return annotations.flatMap((annotation, index) =>
    (side === "both" || positions[index]?.turn === side) &&
    ((annotation &&
      [
        "brilliant",
        "great",
        "inaccuracy",
        "mistake",
        "blunder",
        "miss",
      ].includes(annotation.category)) ||
      (positions[index]?.played &&
        positions[index + 1]?.terminal?.kind === "mate"))
      ? [index + 1]
      : [],
  );
}
/** Une phrase de lecture rapide ; les critères complets restent dans les détails. */
export function moveSummary(annotation: Annotation) {
  return {
    best: "Le premier choix du moteur dans cette position.",
    great: "Ce coup saisit une occasion décisive.",
    excellent: "Ce coup préserve presque toutes les possibilités.",
    good: "Une bonne continuation, avec une petite concession.",
    inaccuracy: "Une suite plus précise était disponible.",
    mistake: "Ce coup dégrade la position. Essayez une autre idée.",
    blunder: "Ce coup perd une part importante des possibilités.",
    miss: "Une occasion de prendre l’avantage a été manquée.",
    brilliant: "Un sacrifice compensé, confirmé par le moteur.",
    forced: "C’était le seul coup légal.",
    book: "Un coup connu de la théorie des ouvertures.",
  }[annotation.category];
}
