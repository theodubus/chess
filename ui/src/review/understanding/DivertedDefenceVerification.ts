import type { EngineFactory } from "../../GameController";
import { usableResult } from "../FocusedAnalysis";
import { legalVariation, type ReviewPosition } from "../model";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext, uci, type DecisionContext } from "./context";
import { divertedDefenceSeed, divertedDefenceWork, type DivertedDefence } from "./divertedDefence";
import { boundedContinuation, conditionalEvidence, framePosition, preventionEvidence, type DefenceEvidence } from "./evidence";
import { completeWork, type Work } from "./work";

type Purpose = "decision" | "played" | "defence" | "exploitation";
export type DivertedDefenceRequest = VerificationIdentity & { position: ReviewPosition };
export type DivertedDefencePass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  hypothesis: DivertedDefence | null;
  evidence: DefenceEvidence | null;
  sourceEvidence: DefenceEvidence | null;
  mismatch: "missing-sequence" | "different-defence" | "different-capture" | "unconfirmed-relation" | "mate-score" | null;
};
export type DivertedDefenceReport = {
  status: "supported" | "contradicted" | "indeterminate";
  reason: "stable-loss" | "compensation-found" | "unstable-search" | "incomplete-evidence" | NonNullable<DivertedDefencePass["mismatch"]>;
  passes: DivertedDefencePass[];
  scope: "observed-consequence";
  explanation: null;
} & VerificationCost;
const cp = (q: Question | undefined) => q?.result.score?.kind === "cp" && !q.result.score.bound && Number.isFinite(q.result.score.value) ? q.result.score.value : null;
const signature = (h: DivertedDefence | null) => h && JSON.stringify([h.exposedId, h.firstAttackerId, h.defenderId, h.victimId,
  h.secondAttackerId, h.firstCapture, h.recapture, h.secondCapture, h.defenderFrom, h.defenderTo]);

/** Relecture des questions effectives, utilisée aussi avant de rédiger. Le récit
 * ne fait jamais passer leur assemblage pour une unique PV depuis la décision. */
export function* inspectDivertedDefence(context: DecisionContext, questions: Question<Purpose>[]): Work<Omit<DivertedDefencePass, "budgetMs" | "questions">> {
  const empty = (mismatch: DivertedDefencePass["mismatch"]) => ({ hypothesis: null, evidence: null, sourceEvidence: null, mismatch });
  const find = (purpose: Purpose) => questions.find((q) => q.purpose === purpose);
  const before = find("decision"), after = find("played");
  for (const [q, frame] of [[before, context.before], [after, context.after]] as const) {
    if (!q || q.position.command !== frame.command || q.position.fen !== frame.fen || !usableResult(framePosition(frame), q.result))
      throw new Error("Question d'une autre décision.");
  }
  if (cp(after) === null) return empty("mate-score");
  const source = { ...framePosition(context.before), played: uci(context.moves[context.decision]) };
  const actual = decisionContext(source, boundedContinuation(context.after, after!.result));
  const first = divertedDefenceSeed(actual);
  if (!first) return empty("missing-sequence");
  const defence = find("defence"), exploitation = find("exploitation"), index = actual.decision;
  for (const [q, frame] of [[defence, actual.frames[index + 2]], [exploitation, actual.frames[index + 3]]] as const) {
    if (!q || q.position.command !== frame.command || q.position.fen !== frame.fen || !usableResult(framePosition(frame), q.result))
      throw new Error("Question d'une autre reprise.");
  }
  if (cp(defence) === null || cp(exploitation) === null) return empty("mate-score");
  if (defence!.result.bestMove !== first.recapture) return empty("different-defence");
  if (exploitation!.result.bestMove !== first.secondCapture) return empty("different-capture");
  const evidence = conditionalEvidence(context, first.victimId, [first.firstCapture, first.recapture], exploitation!.result);
  const sourceEvidence = preventionEvidence(context, first.victimId, boundedContinuation(context.after, after!.result));
  const combined = decisionContext(source,
    { ...after!.result, variation: legalVariation(context.after.fen, evidence.moves) });
  const hypothesis = yield* divertedDefenceWork(combined);
  return { hypothesis, evidence, sourceEvidence, mismatch: hypothesis ? null : "unconfirmed-relation" };
}

export function divertedDefenceConclusion(passes: DivertedDefencePass[]): Omit<DivertedDefenceReport, keyof VerificationCost | "passes"> {
  let status: DivertedDefenceReport["status"] = "indeterminate", reason: DivertedDefenceReport["reason"] = "incomplete-evidence";
  const mismatch = passes.find((p) => p.mismatch)?.mismatch;
  if (mismatch) reason = mismatch;
  else if (passes.length === 2) {
    // Le récit porte sur la perte observée après la décision, pas sur son écart
    // numérique au meilleur coup. Une annonce de mat antérieure n'est ni un prix
    // matériel ni une raison d'effacer cette conséquence. Comme pour les autres
    // effets directs, seules les recherches de son exploitation doivent se stabiliser.
    const stable = (["played", "defence", "exploitation"] as Purpose[]).every((purpose) => {
      const values = passes.map((p) => cp(p.questions.find((q) => q.purpose === purpose)));
      return values.every((v) => v !== null) && Math.abs(values[0]! - values[1]!) <= 100;
    });
    if (!stable || !passes[0].hypothesis || signature(passes[0].hypothesis) !== signature(passes[1].hypothesis) ||
      passes[0].evidence?.outcome !== passes[1].evidence?.outcome || passes[0].evidence?.materialDelta !== passes[1].evidence?.materialDelta ||
      passes.some((p) => p.sourceEvidence?.outcome !== p.evidence?.outcome || p.sourceEvidence?.materialDelta !== p.evidence?.materialDelta)) reason = "unstable-search";
    else if (passes.every((p) => p.evidence?.outcome === "compensated")) { status = "contradicted"; reason = "compensation-found"; }
    else if (passes.every((p) => p.evidence?.outcome === "loss-in-line" && p.evidence.materialDelta < 0)) { status = "supported"; reason = "stable-loss"; }
  }
  return { status, reason, scope: "observed-consequence", explanation: null };
}

/** Quatre questions libres par budget : avant/après, reprise puis exploitation.
 * La même diversion et le bilan total doivent survivre aux deux recherches.
 * Aucune reprise forcée, meilleure décision unique ou perte universelle déduite. */
export class DivertedDefenceVerification extends BoundedVerification<DivertedDefencePass, Omit<DivertedDefenceReport, keyof VerificationCost>, Purpose> {
  private inspectionAbort?: AbortController;
  override stop() { this.inspectionAbort?.abort(); this.inspectionAbort = undefined; super.stop(); }
  verify(request: DivertedDefenceRequest, factory: EngineFactory): Promise<DivertedDefenceReport | null> {
    this.stop();
    const context = decisionContext(request.position);
    return this.run(request, JSON.stringify([context.before.command, context.after.command]), factory,
      async ({ ask, budgetMs, questions }) => {
        const pass: DivertedDefencePass = { budgetMs, questions, hypothesis: null, evidence: null, sourceEvidence: null, mismatch: "missing-sequence" };
        if (!await ask("decision", framePosition(context.before))) return null;
        const after = await ask("played", framePosition(context.after));
        if (!after) return null;
        if (after.score?.kind !== "cp") return { ...pass, mismatch: "mate-score" };
        const actual = decisionContext(request.position, boundedContinuation(context.after, after));
        const seed = divertedDefenceSeed(actual);
        if (!seed) return pass;
        const defence = await ask("defence", framePosition(actual.frames[actual.decision + 2]));
        if (!defence) return null;
        if (defence.bestMove !== seed.recapture) return { ...pass, mismatch: "different-defence" };
        const exploitation = await ask("exploitation", framePosition(actual.frames[actual.decision + 3]));
        if (!exploitation) return null;
        this.inspectionAbort = new AbortController();
        const inspected = await completeWork(inspectDivertedDefence(context, questions), this.inspectionAbort.signal);
        return inspected ? { ...pass, ...inspected } : null;
      }, (passes) => ({ ...divertedDefenceConclusion(passes), passes }));
  }
}
