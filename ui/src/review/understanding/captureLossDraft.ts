import type { ReviewPosition } from "../model";
import { assertDraftQuestions, describePiece, draftExchange, explanationSteps, moveLabel, points, campName, type PedagogicalDraft } from "./draftModel";
import { decisionContext } from "./context";
import { captureIllustration } from "./illustration";
import { captureLossConclusion, captureLossResponse, inspectCaptureLoss, type CaptureLossReport, type CaptureLossHypothesis } from "./CaptureLossVerification";
import { Chess } from "chess.js";
import { materialBalance } from "../../material";
import { capturedSquare } from "./context";
import { usableResult } from "../FocusedAnalysis";
import { framePosition } from "./evidence";
import { finishWork, type Work } from "./work";

/** Recalculer les faits et le bilan avant le texte empêche une preuve altérée
 * de devenir une raison. La défense comparée reste un exemple, pas une unicité. */
export function* captureLossDraftWork(position: ReviewPosition, report: CaptureLossReport<CaptureLossHypothesis>): Work<PedagogicalDraft | null> {
  if (report.status !== "supported") return null;
  if (report.passes.length !== 2) throw new Error("Deux confirmations requises.");
  let last: ReturnType<typeof decisionContext> | null = null;
  const checkedPasses = [];
  for (const pass of report.passes) {
    const decision = pass.questions.find(q => q.purpose === "decision"), played = pass.questions.find(q => q.purpose === "played"), alternative = pass.questions.find(q => q.purpose === "alternative");
    if (!decision || !played || !alternative || !pass.alternative || decision.result.bestMove !== pass.alternative || pass.alternative === position.played)
      throw new Error("Défense comparée absente ou incohérente.");
    const actual = yield* inspectCaptureLoss(position, report.threat, played.result);
    const setup = decisionContext({ ...position, played: pass.alternative });
    assertDraftQuestions(actual.context, setup.after, report.passes);
    for (const [question, frame] of [[decision, actual.context.before], [played, actual.context.after], [alternative, setup.after]] as const) {
      const expected = framePosition(frame), supplied = question.position;
      if (!usableResult(expected, question.result) || supplied.turn !== expected.turn || supplied.played !== null ||
          JSON.stringify(supplied.terminal) !== JSON.stringify(expected.terminal)) throw new Error("Question de preuve incohérente.");
    }
    const preserved = captureLossResponse(setup, report.threat.victimId, alternative.result);
    if (!actual.matched || !pass.matched || JSON.stringify(actual.evidence) !== JSON.stringify(pass.evidence) || JSON.stringify(preserved) !== JSON.stringify(pass.alternativeEvidence))
      throw new Error("Faits ou bilan de la preuve altérés.");
    if (pass.episode !== undefined && JSON.stringify(pass.episode) !== JSON.stringify(actual.episode)) throw new Error("Épisode de la preuve altéré.");
    checkedPasses.push({ ...pass, episode: actual.episode });
    last = actual.context;
  }
  if (captureLossConclusion(report.threat, checkedPasses, position.turn).status !== "supported") throw new Error("Conséquence ou défense non confirmée.");
  const pass = report.passes.at(-1)!, context = last!, evidence = pass.evidence!;
  const beforeVictim = context.before.pieces.find(p => p.id === report.threat.victimId)!, victim = context.after.pieces.find(p => p.id === report.threat.victimId)!;
  const attacker = context.after.pieces.find(p => p.id === report.threat.attackerId)!;
  const attackerAfterDe = describePiece(attacker).replace(/^le /, "du ").replace(/^la /, "de la ");
  const move = context.moves[context.decision], reply = context.moves[context.decision + 1];
  const label = moveLabel(context.before, position.played!), capture = moveLabel(context.after, report.threat.capture);
  const plan = captureIllustration(context, victim.id, evidence), played = explanationSteps(context.after, plan.moves, `Après ${label}`);
  const material = `${points(plan.materialDelta)} pour les ${campName(position.turn)}`;
  const ignored = report.threat.kind === "ignored-threat";
  let decision: string;
  if (ignored) decision = `${label} laisse ${describePiece(beforeVictim)} sous la menace ${attackerAfterDe}.`;
  else if (move.promotion) {
    const gain = (materialBalance(new Chess(context.after.fen)) - materialBalance(new Chess(context.before.fen))) * (position.turn === "w" ? 1 : -1);
    decision = `${label} apporte ${points(gain)} de matériel grâce à la promotion. Mais la pièce promue en ${victim.square} peut être capturée.`;
  } else if (move.captured) {
    const taken = context.before.pieces.find(p => p.square === capturedSquare(move))!;
    const attackerAfterA = describePiece(attacker).replace(/^le /, "au ").replace(/^la /, "à la ");
    decision = `${label} prend ${describePiece(taken)}, mais la pièce jouée est exposée ${attackerAfterA}.`;
  } else decision = `${label} place ${describePiece(victim)} à portée ${attackerAfterDe}${reply.isEnPassant() ? " : le pion peut être pris en passant" : ""}.`;
  const summary = `${decision} Dans la suite trouvée, ${capture} capture cette pièce et le bilan de l'échange montré est de ${material}.`;
  played[0].note = summary;
  played[0].marks = [{ from: reply.from, to: reply.to, tone: "threat" }, ...(capturedSquare(reply) !== reply.to ? [{ from: victim.square, tone: "threat" as const }] : [])];
  const { exchange, contextText } = draftExchange(context, evidence.moves);
  const defence = moveLabel(context.before, pass.alternative!);
  const terminalDefence = pass.questions.find(q => q.purpose === "alternative")!.position.terminal;
  const defenceText = terminalDefence?.kind === "mate" && terminalDefence.winner === position.turn
    ? `Avant ce coup, ${defence} donnait immédiatement mat, sans perdre cette pièce. Cela ne démontre pas qu'il était le seul bon choix.`
    : `Avant ce coup, ${defence} conservait cette pièce dans la suite comparée. Cela ne démontre pas qu'il était le seul bon choix.`;
  return { status: "draft", family: report.threat.kind, role: "allows-loss", title: ignored ? "Une menace laissée sans réponse" : "Une pièce exposée à une capture", summary, comparisonText: "",
    story: { decision: label, change: ignored ? "La menace était déjà présente et reste exploitable." : "La pièce déplacée peut être capturée sur sa nouvelle case.", consequence: `Le bilan depuis ${label}, reprises comprises, est de ${material}.`, alternative: defenceText },
    played, alternative: [], evidence: { playedMoves: evidence.moves, alternativeMoves: [], materialDelta: evidence.materialDelta, exchange,
      contextText: [contextText, defenceText, plan.materialDelta !== evidence.materialDelta ? `La suite complète atteint ${points(evidence.materialDelta)} pour les ${campName(position.turn)} ; le repère isole cet échange.` : null].filter(Boolean).join(" "), origin: "engine-lines", scope: "observed-consequence" },
    limitation: "Deux recherches libres confirment la perte courte et une défense préservant la pièce. Les variantes ne couvrent pas toutes les réponses ni une compensation plus lointaine." +
      (plan.omittedMoves.length ? ` Le repère montre ${points(plan.materialDelta)} ; le témoin complet atteint ${points(evidence.materialDelta)} pour les ${campName(position.turn)}.` : "") };
}
export function captureLossDraft(position: ReviewPosition, report: CaptureLossReport<CaptureLossHypothesis>) { return finishWork(captureLossDraftWork(position, report)); }
