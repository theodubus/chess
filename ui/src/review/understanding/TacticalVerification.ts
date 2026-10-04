import type { EngineFactory } from "../../GameController";
import type { Score } from "../../engine/analysis";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext, uci } from "./context";
import type { TacticalHypothesis } from "./constraints";
import { framePosition } from "./evidence";
import type { Understanding } from "./prototype";
import { defenderContrast, observeDefenderContrast, observeTacticalContrast, tacticalContrast, type TacticalContrast } from "./tacticalContrast";
import { observeTactic, type TacticalObservation } from "./tacticalObservation";
import { groupEvidence, type GroupEvidence } from "./tacticalEvidence";

type Purpose = "decision" | "played" | "alternative" | "same-threat" | "restored-defender";
export type TacticalRequest = VerificationIdentity & {
  understanding: Pick<Understanding, "context" | "constraints">;
  hypothesisIndex: number;
  alternative: string;
};
export type TacticalEffectRequest = Omit<TacticalRequest, "alternative">;
export type TacticalEffectPass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  actual: TacticalObservation;
};
export type TacticalPass = TacticalEffectPass & {
  /** La même menace hypothétique ne remplace pas la meilleure réponse libre. */
  freeAlternative: GroupEvidence | null;
  contrast: TacticalContrast & ReturnType<typeof observeTacticalContrast> & {
    followUp: (ReturnType<typeof observeDefenderContrast> & { prefix: string[]; score: Score | null }) | null;
  };
};
export type TacticalEffectReport = {
  status: "supported" | "indeterminate";
  reason: "material-loss" | "compensation" | "different-line" | "unstable-search" | "unresolved";
  hypothesis: TacticalHypothesis;
  passes: TacticalEffectPass[];
  scope: "bounded-engine-lines";
  explanation: null;
} & VerificationCost;
export type TacticalReport = Omit<TacticalEffectReport, "passes"> & {
  attribution: {
    status: "supported" | "not-established";
    reason: "double-targets" | "exchanged-defender" | "blocked-retreat" | "effect-not-verified" | "score-gap-missing" | "contrast-not-used";
    scope: "conditional-contribution";
  };
  alternative: string;
  passes: TacticalPass[];
};
const cp = (score: Score | null) => score?.kind === "cp" && !score.bound && Number.isFinite(score.value) ? score.value : null;
const stable = (values: (number | null)[]) => values.length === 2 && values.every((v) => v !== null) && Math.abs(values[0]! - values[1]!) <= 100;

export function tacticalEffectConclusion(h: TacticalHypothesis, passes: TacticalEffectPass[]): Omit<TacticalEffectReport, keyof VerificationCost> {
  const playedScores = passes.map((p) => cp(p.questions.find((q) => q.purpose === "played")!.result.score));
  let reason: TacticalEffectReport["reason"] = "unresolved", status: TacticalEffectReport["status"] = "indeterminate";
  if (passes.some((p) => !p.actual.matched)) reason = "different-line";
  // Une occasion décrite pour elle-même ne prétend pas expliquer la variation
  // du score. Sa valeur peut croître vers un gain théorique sans changer la
  // capture. Une attribution comparée garde ses contrôles de score séparés.
  else if (passes.length !== 2 || (h.role === "creates-opportunity" ? playedScores.some(s => s === null) : !stable(playedScores)) ||
      passes[0].actual.evidence.outcome !== passes[1].actual.evidence.outcome ||
      passes[0].actual.capture?.targetId !== passes[1].actual.capture?.targetId ||
      passes[0].actual.capture?.attackerId !== passes[1].actual.capture?.attackerId ||
      passes[0].actual.exchange?.balance !== passes[1].actual.exchange?.balance ||
      passes[0].actual.evidence.materialDelta !== passes[1].actual.evidence.materialDelta) reason = "unstable-search";
  else if (passes.every((p) => p.actual.evidence.outcome === "compensated")) reason = "compensation";
  else if (passes.every((p) => p.actual.evidence.outcome === "loss-in-line" && p.actual.evidence.materialDelta < 0 && p.actual.exchange?.complete)) {
    status = "supported"; reason = "material-loss";
  }
  return { status, reason, hypothesis: h, passes, scope: "bounded-engine-lines", explanation: null };
}

function summarize(h: TacticalHypothesis, alternative: string, passes: TacticalPass[], sign: number): Omit<TacticalReport, keyof VerificationCost> {
  const effect = tacticalEffectConclusion(h, passes);
  const scores = (purpose: Purpose) => passes.map((p) => cp(p.questions.find((q) => q.purpose === purpose)!.result.score));
  let cause: TacticalReport["attribution"]["reason"] = "effect-not-verified";
  let attributed = false;
  if (effect.status === "supported") {
    const played = scores("played"), alternatives = scores("alternative");
    const direction = h.role === "allows-loss" ? -sign : sign;
    const gaps = played.map((s, i) => s !== null && alternatives[i] !== null ? (s - alternatives[i]!) * direction : null);
    if (!stable(alternatives) || !stable(gaps) || gaps.some((g) => g === null || g < 100)) cause = "score-gap-missing";
    else {
      const preserved = passes.every((p) => p.contrast.reason === "ready" && p.contrast.evidence?.outcome === "preserved" &&
        (h.role !== "allows-loss" || p.freeAlternative?.outcome === "preserved"));
      if (h.kind === "pin") {
        attributed = preserved && passes.every((p) => !!p.contrast.usedRetreat);
        cause = attributed ? "blocked-retreat" : "contrast-not-used";
      } else {
        const direct = passes.every((p) => p.actual.exchange!.balance! < 0 && p.actual.handledTargets.length === 1 &&
          !p.actual.handledTargets.includes(p.actual.capture!.targetId));
        const sameFollowUp = !!passes[0].actual.followUp && !!passes[1].actual.followUp &&
          (["targetId", "attackerId", "defenderId", "capture"] as const).every((key) =>
            passes[0].actual.followUp![key] === passes[1].actual.followUp![key]);
        const compound = sameFollowUp && passes.every((p) => p.actual.followUp && p.actual.exchange!.balance! >= 0 &&
          p.contrast.followUp?.usedDefender === p.actual.followUp.defenderId &&
          p.contrast.followUp.evidence.outcome === "compensated" &&
          p.contrast.followUp.evidence.materialDelta > p.actual.evidence.materialDelta);
        attributed = preserved && (direct || compound);
        cause = attributed ? direct ? "double-targets" : "exchanged-defender" : "contrast-not-used";
      }
    }
  }
  return { ...effect, attribution: { status: attributed ? "supported" : "not-established", reason: cause, scope: "conditional-contribution" },
    alternative, passes };
}

/** La conséquence du coup joué ne dépend pas de la découverte d'un coup de
 * remplacement. Deux recherches libres confirment la même perte courte ; cela
 * n'affirme ni une perte forcée, ni l'optimalité d'un autre choix. */
export class TacticalEffectVerification extends BoundedVerification<TacticalEffectPass, Omit<TacticalEffectReport, keyof VerificationCost>, Purpose> {
  async verify(request: TacticalEffectRequest, factory: EngineFactory): Promise<TacticalEffectReport | null> {
    this.stop();
    const { context, constraints } = request.understanding;
    const h = constraints.hypotheses[request.hypothesisIndex];
    if (!h || !["double-threat", "pin"].includes(h.kind)) throw new Error("Fourchette ou clouage requis.");
    return this.run(request, JSON.stringify([context.before.command, context.after.command, h]), factory,
      async ({ ask, budgetMs, questions }) => {
        if (!await ask("decision", framePosition(context.before))) return null;
        const played = await ask("played", framePosition(context.after));
        return played ? { budgetMs, questions, actual: observeTactic(context, h, played) } : null;
      }, (passes) => tacticalEffectConclusion(h, passes));
  }
}

/** Recherches libres séparées de la même menace conditionnelle et de la reprise
 * conditionnelle. Au plus cinq positions par budget ; aucune PV imposée. */
export class TacticalVerification extends BoundedVerification<TacticalPass, Omit<TacticalReport, keyof VerificationCost>, Purpose> {
  async verify(request: TacticalRequest, factory: EngineFactory): Promise<TacticalReport | null> {
    this.stop();
    const { context, constraints } = request.understanding;
    const h = constraints.hypotheses[request.hypothesisIndex];
    if (!h || !["double-threat", "pin"].includes(h.kind)) throw new Error("Fourchette ou clouage requis.");
    if (request.alternative === uci(context.moves[context.decision])) throw new Error("Alternative identique.");
    const alternative = decisionContext({ ...framePosition(context.before), played: request.alternative });
    return this.run(request, JSON.stringify([context.before.command, context.after.command, h, alternative.after.command]), factory,
      async ({ ask, budgetMs, questions }) => {
        if (!await ask("decision", framePosition(context.before))) return null;
        const played = await ask("played", framePosition(context.after));
        if (!played) return null;
        const alternate = await ask("alternative", framePosition(alternative.after));
        if (!alternate) return null;
        const actual = observeTactic(context, h, played);
        const freeAlternative = h.role === "allows-loss" ? groupEvidence(context.before, alternative.after, h.targetIds, alternate) : null;
        const plan = tacticalContrast(context, h, actual, alternative);
        const canTestCause = actual.matched && actual.evidence.outcome === "loss-in-line" && actual.exchange?.complete;
        let contrastResult = alternate;
        if (canTestCause && plan.reason === "ready" && plan.prefix.length) {
          const answer = await ask("same-threat", framePosition(plan.frame));
          if (!answer) return null;
          contrastResult = answer;
        }
        const contrast = canTestCause ? observeTacticalContrast(context.before, h, plan, contrastResult) : { evidence: null, usedRetreat: null };
        const defence = canTestCause && actual.followUp ? defenderContrast(plan, actual, contrastResult) : null;
        let followUp: TacticalPass["contrast"]["followUp"] = null;
        if (defence) {
          const answer = await ask("restored-defender", framePosition(defence.frame));
          if (!answer) return null;
          followUp = { ...observeDefenderContrast(context.before, plan, actual, defence, answer), prefix: [...plan.prefix, ...defence.prefix], score: answer.score };
        }
        return { budgetMs, questions, actual, freeAlternative, contrast: { ...plan, ...contrast, followUp } };
      }, (passes) => summarize(h, request.alternative, passes, context.before.turn === "w" ? 1 : -1));
  }
}
