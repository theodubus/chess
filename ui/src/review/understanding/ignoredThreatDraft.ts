import type { ReviewPosition } from "../model";
import { assertDraftQuestions, describePiece, draftExchange, explanationSteps, moveLabel, points, campName, type PedagogicalDraft } from "./draftModel";
import { decisionContext } from "./context";
import { captureIllustration } from "./illustration";
import { ignoredThreatConclusion, inspectIgnoredThreat, type IgnoredThreatReport } from "./IgnoredThreatVerification";
import { preventionEvidence } from "./evidence";
import { finishWork, type Work } from "./work";

/** Recalculer les faits et le bilan avant le texte empêche une preuve altérée
 * de devenir une raison. La défense comparée reste un exemple, pas une unicité. */
export function* ignoredThreatDraftWork(position: ReviewPosition, report: IgnoredThreatReport): Work<PedagogicalDraft | null> {
  if (report.status !== "supported") return null;
  if (report.passes.length !== 2) throw new Error("Deux confirmations requises.");
  let last: ReturnType<typeof decisionContext> | null = null;
  for (const pass of report.passes) {
    const decision = pass.questions.find(q => q.purpose === "decision"), played = pass.questions.find(q => q.purpose === "played"), alternative = pass.questions.find(q => q.purpose === "alternative");
    if (!decision || !played || !alternative || !pass.alternative || decision.result.bestMove !== pass.alternative || pass.alternative === position.played)
      throw new Error("Défense comparée absente ou incohérente.");
    const actual = yield* inspectIgnoredThreat(position, report.threat, played.result);
    const setup = decisionContext({ ...position, played: pass.alternative });
    assertDraftQuestions(actual.context, setup.after, report.passes);
    const preserved = preventionEvidence(setup, report.threat.victimId, alternative.result);
    if (!actual.matched || !pass.matched || JSON.stringify(actual.evidence) !== JSON.stringify(pass.evidence) || JSON.stringify(preserved) !== JSON.stringify(pass.alternativeEvidence))
      throw new Error("Faits ou bilan de la preuve altérés.");
    last = actual.context;
  }
  if (ignoredThreatConclusion(report.threat, report.passes, position.turn).status !== "supported") throw new Error("Conséquence ou défense non confirmée.");
  const pass = report.passes.at(-1)!, context = last!, evidence = pass.evidence!;
  const victim = context.before.pieces.find(p => p.id === report.threat.victimId)!, attacker = context.before.pieces.find(p => p.id === report.threat.attackerId)!;
  const label = moveLabel(context.before, position.played!), capture = moveLabel(context.after, report.threat.capture);
  const material = `${points(evidence.materialDelta)} pour les ${campName(position.turn)}`;
  const summary = `${label} laisse ${describePiece(victim)} sous la menace de ${describePiece(attacker)}. Dans la suite trouvée, ${capture} capture cette pièce et les reprises laissent un bilan de ${material}.`;
  const plan = captureIllustration(context, victim.id, evidence), played = explanationSteps(context.after, plan.moves, `Après ${label}`);
  played[0].note = summary;
  played[0].marks = [{ from: attacker.square, to: victim.square, tone: "threat" }];
  const { exchange, contextText } = draftExchange(context, evidence.moves);
  const defence = moveLabel(context.before, pass.alternative!);
  const defenceText = `Avant ce coup, ${defence} conservait cette pièce dans la suite comparée. Cela ne démontre pas qu'il était le seul bon choix.`;
  return { status: "draft", family: "ignored-threat", role: "allows-loss", title: "Une menace laissée sans réponse", summary, comparisonText: "",
    story: { decision: label, change: "La menace était déjà présente et reste exploitable.", consequence: `Le bilan depuis ${label}, reprises comprises, est de ${material}.`, alternative: defenceText },
    played, alternative: [], evidence: { playedMoves: evidence.moves, alternativeMoves: [], materialDelta: evidence.materialDelta, exchange,
      contextText: [contextText, defenceText].filter(Boolean).join(" "), origin: "engine-lines", scope: "observed-consequence" },
    limitation: "Deux recherches libres confirment la perte courte et une défense préservant la pièce. Les variantes ne couvrent pas toutes les réponses ni une compensation plus lointaine." +
      (plan.omittedMoves.length ? ` Le repère montre ${points(plan.materialDelta)} ; le témoin complet atteint ${material}.` : "") };
}
export function ignoredThreatDraft(position: ReviewPosition, report: IgnoredThreatReport) { return finishWork(ignoredThreatDraftWork(position, report)); }
