import { advantage, type Annotation } from "./annotations";
import type { ReviewResult, ReviewPosition } from "./model";
import type { Side } from "../engine/analysis";

export const badMove = (annotation: Annotation | null | undefined) =>
  !!annotation &&
  ["inaccuracy", "mistake", "blunder", "miss"].includes(annotation.category);
export function notablePositions(
  annotations: (Annotation | null)[],
  positions: ReviewPosition[] = [],
) {
  return annotations.flatMap((annotation, index) =>
    (annotation &&
      [
        "brilliant",
        "great",
        "inaccuracy",
        "mistake",
        "blunder",
        "miss",
      ].includes(annotation.category)) ||
    (positions[index]?.played &&
      positions[index + 1]?.terminal?.kind === "mate")
      ? [index + 1]
      : [],
  );
}
export function retryFeedback(
  uci: string,
  target: ReviewResult | null,
  after: ReviewResult | null,
  side: Side,
) {
  if (uci === target?.bestMove)
    return { kind: "success", text: "Vous avez trouvé le choix du moteur !" };
  const before = advantage(target?.score, side),
    result = advantage(after?.score, side);
  if (before === null || result === null || result - before > 0.1)
    return {
      kind: "unknown",
      text: "Les évaluations ne permettent pas encore de départager cette tentative.",
    };
  if (before - result < 0.02)
    return {
      kind: "success",
      text: "Bonne alternative : cette recherche juge aussi votre coup satisfaisant.",
    };
  return {
    kind: "try",
    text: "Le moteur préfère une autre possibilité. Vous pouvez retenter ou explorer cette suite.",
  };
}
