import type { EngineFactory } from "../../GameController";
import type { ReviewPosition, ReviewResult } from "../model";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext, opposite, type DecisionContext } from "./context";
import { boundedContinuation, framePosition, preventionEvidence, type DefenceEvidence } from "./evidence";
import { ignoredThreat, type IgnoredThreat } from "./ignoredThreat";
import { movedPieceExposure, type MovedPieceExposure } from "./movedPieceExposure";
import { captureEpisode } from "./captureEpisode";
import { scorePreference } from "./scorePreference";
import { boardFromCommand } from "../StudyTree";
import { materialBalance } from "../../material";
import { Chess } from "chess.js";
import { usableResult } from "../FocusedAnalysis";
import { captureRelationsWork } from "./relations";
import { completeWork, type Work } from "./work";

export type CaptureLossHypothesis = IgnoredThreat | MovedPieceExposure;

type Purpose = "decision" | "played" | "alternative";
export type CaptureLossRequest<T extends CaptureLossHypothesis> = VerificationIdentity & { position: ReviewPosition; threat: T };
export type CaptureLossPass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  matched: boolean;
  evidence: DefenceEvidence | null;
  alternative: string | null;
  alternativeEvidence: DefenceEvidence | null;
  /** Absence dans les anciens instantanés ; recalculée avant affichage. */
  episode?: ReturnType<typeof captureEpisode>;
};
export type CaptureLossReport<T extends CaptureLossHypothesis> = {
  status: "supported" | "contradicted" | "indeterminate";
  reason: "ignored-threat" | "moved-piece-exposure" | "episode-open" | "episode-not-loss" | "different-threat" | "compensation" | "no-defence" | "unstable-search" | "unresolved";
  threat: T;
  passes: CaptureLossPass[];
  scope: "one-defence-found";
} & VerificationCost;

export function* inspectCaptureLoss(position: ReviewPosition, threat: CaptureLossHypothesis, result: ReviewResult): Work<{ context: DecisionContext; matched: boolean; evidence: DefenceEvidence | null; episode: ReturnType<typeof captureEpisode> }> {
  yield "context";
  const root = decisionContext(position), context = decisionContext(position, boundedContinuation(root.after, result));
  const enemy = opposite(context.before.turn), before = yield* captureRelationsWork(context.before, enemy), after = yield* captureRelationsWork(context.after, enemy);
  const empty = { status: "unavailable" as const, scope: "actual-turn" as const, captures: [] };
  const read = threat.kind === "ignored-threat" ? ignoredThreat : movedPieceExposure;
  const facts = read({ context, relations: { before: { w: empty, b: empty, [enemy]: before }, after: { w: empty, b: empty, [enemy]: after }, defences: [], openedLines: [] } });
  const matched = JSON.stringify(facts) === JSON.stringify(threat);
  return { context, matched, evidence: matched ? preventionEvidence(context, threat.victimId, result) : null, episode: matched ? captureEpisode(context) : null };
}
/** Une alternative déjà terminale ne doit pas demander une PV inexistante.
 * Le mat à zéro n'est accepté qu'après vérification des règles et du résultat. */
export function captureLossResponse(context: DecisionContext, victimId: string, result: ReviewResult): DefenceEvidence {
  if (!context.after.terminal) return preventionEvidence(context, victimId, result);
  const position = framePosition(context.after), terminal = position.terminal!, score = result.score;
  if (!usableResult(position, result) || result.variation.length || !score || score.kind !== terminal.kind || score.value !== terminal.value || score.winner !== terminal.winner)
    throw new Error("Réponse terminale incohérente.");
  const victim = context.after.pieces.find(p => p.id === victimId);
  if (!victim) throw new Error("Victime absente de l'alternative.");
  const board = boardFromCommand(context.after.command), delta = (materialBalance(board) - materialBalance(new Chess(context.before.fen))) * (victim.color === "w" ? 1 : -1);
  return { outcome: board.isCheckmate() && board.turn() !== victim.color ? "mate-for-victim" : board.isDraw() && delta >= 0 ? "preserved" : "unresolved",
    moves: [], materialDelta: delta || 0, victimSquare: victim.square, includesIntermediateCheck: false, replies: [], ending: board.isCheckmate() ? "mate" : "draw", scope: "engine-line" };
}
const preservesPiece = (evidence: DefenceEvidence | null) => !!evidence && evidence.victimSquare !== null && evidence.materialDelta >= 0 && ["preserved", "mate-for-victim"].includes(evidence.outcome);
export function captureLossConclusion<T extends CaptureLossHypothesis>(threat: T, passes: CaptureLossPass[], turn: "w" | "b"): Omit<CaptureLossReport<T>, keyof VerificationCost> {
  const question = (p: CaptureLossPass, purpose: Purpose) => p.questions.find(q => q.purpose === purpose);
  const preferences = passes.map(p => scorePreference(question(p, "played")?.result.score, question(p, "alternative")?.result.score, turn,
    question(p, "alternative")?.position.terminal?.kind === "mate" && question(p, "alternative")?.position.terminal?.winner === turn));
  let status: CaptureLossReport<T>["status"] = "indeterminate", reason: CaptureLossReport<T>["reason"] = "unresolved";
  if (passes.length !== 2 || passes.some(p => !p.matched)) reason = "different-threat";
  else if (passes.every(p => p.evidence?.outcome === "compensated")) { status = "contradicted"; reason = "compensation"; }
  else if (passes.some(p => !p.episode?.complete)) reason = "episode-open";
  else if (passes.some(p => p.episode!.balanceSinceDecision >= 0)) reason = "episode-not-loss";
  else if (!passes.every(p => p.alternative && preservesPiece(p.alternativeEvidence))) reason = "no-defence";
  // La magnitude CP peut croître vers un gain théorique sans changer cette
  // conséquence. Vérifier le même sens de préférence aux deux budgets, pas une
  // distance entre scores : aucun nombre CP n'est attribué à ce mécanisme.
  else if (passes[0].alternative !== passes[1].alternative || preferences.some(p => p === null) ||
    passes[0].evidence?.materialDelta !== passes[1].evidence?.materialDelta) reason = "unstable-search";
  else if (passes.every(p => p.evidence?.outcome === "loss-in-line" && p.evidence.materialDelta < 0)) { status = "supported"; reason = threat.kind; }
  return { status, reason, threat, passes, scope: "one-defence-found" };
}

/** Trois positions libres par budget. Une défense qui préserve la pièce rend
 * la perte explicable sans présenter ce choix comme unique ou optimal. */
export class CaptureLossVerification<T extends CaptureLossHypothesis> extends BoundedVerification<CaptureLossPass, Omit<CaptureLossReport<T>, keyof VerificationCost>, Purpose> {
  private inspection?: AbortController;
  override stop() { this.inspection?.abort(); this.inspection = undefined; super.stop(); }
  async verify(input: CaptureLossRequest<T>, factory: EngineFactory): Promise<CaptureLossReport<T> | null> {
    this.stop();
    const request = { ...input, position: structuredClone(input.position), threat: structuredClone(input.threat) };
    const root = decisionContext(request.position);
    return this.run(request, JSON.stringify([request.position, request.threat]), factory, async ({ ask, budgetMs, questions }) => {
      const abort = new AbortController(); this.inspection = abort;
      const decision = await ask("decision", framePosition(root.before)), played = decision && await ask("played", framePosition(root.after));
      if (!decision || !played || abort.signal.aborted) return null;
      const actual = await completeWork(inspectCaptureLoss(request.position, request.threat, played), abort.signal);
      if (!actual) return null;
      const alternative = decision.bestMove && decision.bestMove !== request.position.played ? decision.bestMove : null;
      let alternativeEvidence: DefenceEvidence | null = null;
      if (actual.matched && alternative) {
        const setup = decisionContext({ ...request.position, played: alternative });
        if (setup.after.pieces.some(p => p.id === request.threat.victimId)) {
          const result = await ask("alternative", framePosition(setup.after));
          if (!result || abort.signal.aborted) return null;
          alternativeEvidence = captureLossResponse(setup, request.threat.victimId, result);
        }
      }
      return { budgetMs, questions, matched: actual.matched, evidence: actual.evidence, alternative, alternativeEvidence, episode: actual.episode };
    }, passes => captureLossConclusion(request.threat, passes, request.position.turn));
  }
}
