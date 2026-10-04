import type { EngineFactory } from "../../GameController";
import type { ReviewPosition, ReviewResult } from "../model";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext, opposite, type DecisionContext } from "./context";
import { boundedContinuation, framePosition, preventionEvidence, type DefenceEvidence } from "./evidence";
import { ignoredThreat, type IgnoredThreat } from "./ignoredThreat";
import { captureRelationsWork } from "./relations";
import { completeWork, type Work } from "./work";

type Purpose = "decision" | "played" | "alternative";
export type IgnoredThreatRequest = VerificationIdentity & { position: ReviewPosition; threat: IgnoredThreat };
export type IgnoredThreatPass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  matched: boolean;
  evidence: DefenceEvidence | null;
  alternative: string | null;
  alternativeEvidence: DefenceEvidence | null;
};
export type IgnoredThreatReport = {
  status: "supported" | "contradicted" | "indeterminate";
  reason: "ignored-threat" | "different-threat" | "compensation" | "no-defence" | "unstable-search" | "unresolved";
  threat: IgnoredThreat;
  passes: IgnoredThreatPass[];
  scope: "one-defence-found";
} & VerificationCost;

export function* inspectIgnoredThreat(position: ReviewPosition, threat: IgnoredThreat, result: ReviewResult): Work<{ context: DecisionContext; matched: boolean; evidence: DefenceEvidence | null }> {
  yield "context";
  const root = decisionContext(position), context = decisionContext(position, boundedContinuation(root.after, result));
  const enemy = opposite(context.before.turn), before = yield* captureRelationsWork(context.before, enemy), after = yield* captureRelationsWork(context.after, enemy);
  const empty = { status: "unavailable" as const, scope: "actual-turn" as const, captures: [] };
  const facts = ignoredThreat({ context, relations: { before: { w: empty, b: empty, [enemy]: before }, after: { w: empty, b: empty, [enemy]: after }, defences: [], openedLines: [] } });
  const matched = JSON.stringify(facts) === JSON.stringify(threat);
  return { context, matched, evidence: matched ? preventionEvidence(context, threat.victimId, result) : null };
}
const cp = (result?: ReviewResult) => result?.score?.kind === "cp" && !result.score.bound && Number.isFinite(result.score.value) ? result.score.value : null;
export function ignoredThreatConclusion(threat: IgnoredThreat, passes: IgnoredThreatPass[], turn: "w" | "b"): Omit<IgnoredThreatReport, keyof VerificationCost> {
  const question = (p: IgnoredThreatPass, purpose: Purpose) => p.questions.find(q => q.purpose === purpose)?.result;
  const played = passes.map(p => cp(question(p, "played"))), alternatives = passes.map(p => cp(question(p, "alternative")));
  const gaps = played.map((v, i) => v !== null && alternatives[i] !== null ? (alternatives[i]! - v) * (turn === "w" ? 1 : -1) : null);
  let status: IgnoredThreatReport["status"] = "indeterminate", reason: IgnoredThreatReport["reason"] = "unresolved";
  if (passes.length !== 2 || passes.some(p => !p.matched)) reason = "different-threat";
  else if (passes.every(p => p.evidence?.outcome === "compensated")) { status = "contradicted"; reason = "compensation"; }
  else if (!passes.every(p => p.alternative && p.alternativeEvidence?.outcome === "preserved")) reason = "no-defence";
  // La magnitude CP peut croître vers un gain théorique sans changer cette
  // conséquence. Vérifier le même sens de préférence aux deux budgets, pas une
  // distance entre scores : aucun nombre CP n'est attribué à ce mécanisme.
  else if (passes[0].alternative !== passes[1].alternative || gaps.some(g => g === null || g < 100) ||
    passes[0].evidence?.materialDelta !== passes[1].evidence?.materialDelta) reason = "unstable-search";
  else if (passes.every(p => p.evidence?.outcome === "loss-in-line" && p.evidence.materialDelta < 0)) { status = "supported"; reason = "ignored-threat"; }
  return { status, reason, threat, passes, scope: "one-defence-found" };
}

/** Trois positions libres par budget. Une défense qui préserve la pièce rend
 * l'inaction explicable sans présenter ce choix comme unique ou optimal. */
export class IgnoredThreatVerification extends BoundedVerification<IgnoredThreatPass, Omit<IgnoredThreatReport, keyof VerificationCost>, Purpose> {
  private inspection?: AbortController;
  override stop() { this.inspection?.abort(); this.inspection = undefined; super.stop(); }
  async verify(input: IgnoredThreatRequest, factory: EngineFactory): Promise<IgnoredThreatReport | null> {
    this.stop();
    const request = { ...input, position: structuredClone(input.position), threat: structuredClone(input.threat) };
    const root = decisionContext(request.position);
    return this.run(request, JSON.stringify([request.position, request.threat]), factory, async ({ ask, budgetMs, questions }) => {
      const abort = new AbortController(); this.inspection = abort;
      const decision = await ask("decision", framePosition(root.before)), played = decision && await ask("played", framePosition(root.after));
      if (!decision || !played || abort.signal.aborted) return null;
      const actual = await completeWork(inspectIgnoredThreat(request.position, request.threat, played), abort.signal);
      if (!actual) return null;
      const alternative = decision.bestMove && decision.bestMove !== request.position.played ? decision.bestMove : null;
      let alternativeEvidence: DefenceEvidence | null = null;
      if (actual.matched && alternative) {
        const setup = decisionContext({ ...request.position, played: alternative });
        if (setup.after.pieces.some(p => p.id === request.threat.victimId)) {
          const result = await ask("alternative", framePosition(setup.after));
          if (!result || abort.signal.aborted) return null;
          alternativeEvidence = preventionEvidence(setup, request.threat.victimId, result);
        }
      }
      return { budgetMs, questions, matched: actual.matched, evidence: actual.evidence, alternative, alternativeEvidence };
    }, passes => ignoredThreatConclusion(request.threat, passes, request.position.turn));
  }
}
