import type { Score, Side } from "../../engine/analysis";

/** Les mats restent des issues, pas des nombres de pions. Deux mats du même
 * camp ne suffisent pas à attribuer la préférence à une perte matérielle. */
export function scorePreference(played: Score | null | undefined, alternative: Score | null | undefined, actor: Side, terminalAlternative = false): "cp-margin" | "mate-outcome" | null {
  const exact = (score: Score | null | undefined, terminal = false): score is Score => !!score && !score.bound && Number.isFinite(score.value) &&
    (score.kind === "cp" || Number.isSafeInteger(score.value) && (score.winner === "w" || score.winner === "b") &&
      (score.value === 0 ? terminal : (score.value > 0 ? "w" : "b") === score.winner));
  if (!exact(played) || !exact(alternative, terminalAlternative)) return null;
  const sign = actor === "w" ? 1 : -1;
  if (played.kind === "cp" && alternative.kind === "cp") return (alternative.value - played.value) * sign >= 100 ? "cp-margin" : null;
  if (alternative.kind === "mate" && alternative.winner === actor && (played.kind === "cp" || played.winner !== actor)) return "mate-outcome";
  if (played.kind === "mate" && played.winner !== actor && alternative.kind === "cp" && alternative.value * sign >= 0) return "mate-outcome";
  return null;
}
