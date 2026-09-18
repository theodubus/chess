import type { ReviewPosition, ReviewResult } from "./model";
import { advantage } from "./annotations";

export function unclassifiedReason(
  position: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  state: "idle" | "running" | "stopped" | "error" | "complete",
): string {
  if (!before?.score || !after?.score) {
    if (state === "idle" || state === "running")
      return "Calcul en attente : les évaluations avant et après ce coup ne sont pas encore toutes disponibles.";
    if (state !== "complete")
      return "Analyse incomplète pour ce coup. Relancez-la depuis les options pour obtenir les évaluations manquantes.";
    return "Non classé : le moteur n’a pas fourni d’évaluation avant ou après ce coup.";
  }
  if (before.score.bound || after.score.bound)
    return "Non classé : le moteur n’a fourni qu’une limite du score, pas une évaluation suffisamment précise pour comparer les deux positions.";
  const a = advantage(before.score, position.turn);
  const b = advantage(after.score, position.turn);
  if (a === null || b === null)
    return "Non classé : les scores fournis par le moteur ne sont pas exploitables pour ce coup.";
  if (before.bestMove === position.played && a - b >= 0.02)
    return "Non classé : le moteur recommande ce coup, mais son évaluation après le coup le contredit. Une analyse plus longue peut aider à trancher.";
  return "Non classé : les évaluations avant et après ce coup se contredisent. Une analyse plus longue peut aider à trancher.";
}
