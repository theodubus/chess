import type { Understanding } from "./prototype";
import type { MateReport } from "./MateVerification";
import { decisionContext, uci } from "./context";
import { framePosition } from "./evidence";
import { assertDraftHypothesis, assertDraftQuestions, capitalize, describePiece, draftExchange, explanationSteps, moveLabel, type PedagogicalDraft } from "./draftModel";

/** La preuve exhaustive ne justifie que la courte route de mat. L'alternative
 * reste une position comparée, sans faire défiler une PV de développement. */
export function mateDraft(understanding: Pick<Understanding, "context" | "constraints">, report: MateReport): PedagogicalDraft | null {
  if (report.status !== "supported" || report.contrast.status !== "short-route-absent") return null;
  const { context } = understanding, h = report.hypothesis;
  assertDraftHypothesis(understanding.constraints, h);
  if (!("blockerId" in h.fact) || report.passes.length !== 2 || report.passes.some((p) =>
    p.questions.find((q) => q.purpose === "played")?.position.command !== context.after.command))
    throw new Error("Preuve de mat d'une autre décision.");
  const fact = h.fact, pass = report.passes.at(-1)!;
  const alternative = decisionContext({ ...framePosition(context.before), played: report.contrast.alternative });
  assertDraftQuestions(context, alternative.after, report.passes);
  if (report.passes.some((p) => p.questions.find((q) => q.purpose === "alternative")?.position.command !== alternative.after.command))
    throw new Error("Alternative de mat incohérente.");
  const blocker = context.after.pieces.find((p) => p.id === fact.blockerId)!;
  const attacker = context.after.pieces.find((p) => p.id === h.attackerId)!;
  const playedMove = context.moves[context.decision], altLabel = moveLabel(context.before, report.contrast.alternative);
  const played = explanationSteps(context.after, pass.illustration, `Après ${moveLabel(context.before, uci(playedMove))}`);
  if (played.length !== 3) throw new Error("Mat illustré hors de l'horizon prouvé.");
  const response = moveLabel(context.after, pass.illustration[0]);
  const mate = moveLabel({ command: played[1].command }, pass.illustration[1]);
  const change = `${capitalize(describePiece(blocker))} doit répondre par ${response}, la seule réponse légale à l'échec. Sa réponse libère le trajet ${attacker.square}–${fact.mate.slice(2, 4)}.`;
  const consequence = `${mate} devient alors possible et donne mat.`;
  const compared = `Après ${altLabel}, la pièce bloque encore ce trajet. Ce coup ne force pas le même mat dans l'horizon réponse puis mat immédiat.`;
  played[0].note = `L'échec impose ${response} et dévie ${describePiece(blocker)}.`;
  played[0].marks = [{ from: blocker.square, tone: "observation" }];
  played[1].note = `Le trajet est maintenant libre pour ${mate}.`;
  played[1].marks = [{ from: attacker.square, to: fact.mate.slice(2, 4) as typeof attacker.square, tone: "idea" }];
  played[2].note = `${mate} : le roi est mat.`;
  if (pass.continuation === "rules-completed") played[2].origin = "rules";
  const alternativeSteps = explanationSteps(alternative.after, [], `Avec ${altLabel}`);
  alternativeSteps[0].note = compared;
  alternativeSteps[0].marks = [{ from: attacker.square, to: blocker.square, tone: "idea" }, { from: blocker.square, tone: "observation" }];
  return { status: "draft", family: "deflection-mate", role: "creates-opportunity", title: "Dévier la défense pour donner mat",
    summary: `${change} ${consequence}`, comparisonText: compared,
    story: { decision: uci(playedMove), change, consequence, alternative: compared }, played, alternative: alternativeSteps,
    evidence: { playedMoves: [...pass.illustration], alternativeMoves: [], materialDelta: null, ...draftExchange(context, pass.illustration),
      origin: pass.continuation === "rules-completed" ? "engine-and-rules" : "engine-lines", scope: "short-forcing-route" },
    limitation: "La preuve couvre toutes les réponses dans cet horizon de réponse puis mat immédiat. Elle ne prouve pas que l'alternative exclut un mat plus long. " +
      (pass.continuation === "rules-completed" ? "Le dernier coup de mat est complété par les règles, pas émis dans la variante du moteur." : "Le moteur fournit les deux coups montrés.") };
}
