import type { EngineFactory } from "../../GameController";
import type { Score } from "../../engine/analysis";
import {
  BoundedVerification,
  type Question,
  type VerificationCost,
  type VerificationIdentity,
} from "./BoundedVerification";
import { decisionContext, uci } from "./context";
import {
  conditionalEvidence,
  framePosition,
  preventionEvidence,
  type DefenceEvidence,
} from "./evidence";
import { observeMechanism, type RelationHypothesis } from "./mechanisms";
import {
  extendBranch,
  observeRelationContrast,
  relationContrast,
  type RelationContrast,
} from "./relationContrast";
import type { Understanding } from "./prototype";

export type RelationRequest = VerificationIdentity & {
  understanding: Understanding;
  mechanismIndex: number;
  alternative?: string;
  effectOnly?: boolean;
};
type Purpose =
  | "decision"
  | "played"
  | "alternative"
  | "actual-capture"
  | "recapture";
export type RelationPass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  alternative: string | null;
  matched: boolean;
  prefix: string[];
  evidence: DefenceEvidence;
  score: Score | null;
  freeAlternative: DefenceEvidence | null;
  contrast: {
    reason: RelationContrast["reason"];
    retained: string[];
    prefix: string[];
    command: string | null;
    evidence: DefenceEvidence | null;
    usedDefender: string | null;
    score: Score | null;
  };
};
export type RelationReport = {
  status: "supported" | "contradicted" | "indeterminate";
  reason:
    | "material-loss"
    | "capture-not-used"
    | "compensation"
    | "unstable-search"
    | "unresolved";
  attribution: {
    status: "supported" | "not-established";
    reason:
      | "defender-removal"
      | "opened-line"
      | "effect-not-verified"
      | "no-comparison"
      | "unstable-alternative"
      | "score-gap-missing"
      | "mechanism-not-used"
      | "effect-not-improved";
    scope: "conditional-mechanism";
  };
  hypothesis: RelationHypothesis;
  passes: RelationPass[];
  scope: "bounded-engine-check";
  explanation: null;
} & VerificationCost;
const cp = (s: Score | null) =>
  s?.kind === "cp" && !s.bound && Number.isFinite(s.value) ? s.value : null;
const stable = (scores: (Score | null)[]) =>
  scores.length === 2 &&
  scores.every((s) => cp(s) !== null) &&
  Math.abs(cp(scores[0])! - cp(scores[1])!) <= 100;

function summarize(
  hypothesis: RelationHypothesis,
  passes: RelationPass[],
  sign: number,
): Omit<RelationReport, keyof VerificationCost> {
  const no = (
    reason: RelationReport["attribution"]["reason"],
  ): RelationReport["attribution"] => ({
    status: "not-established",
    reason,
    scope: "conditional-mechanism",
  });
  let status: RelationReport["status"] = "indeterminate",
    reason: RelationReport["reason"] = "unresolved";
  if (passes.some((p) => !p.matched)) reason = "capture-not-used";
  else if (
    !stable(passes.map((p) => p.score)) ||
    passes[0].evidence.outcome !== passes[1].evidence.outcome
  )
    reason = "unstable-search";
  else if (
    passes.every((p) =>
      ["preserved", "mate-for-victim", "compensated"].includes(
        p.evidence.outcome,
      ),
    )
  ) {
    status = "contradicted";
    reason = "compensation";
  } else if (
    passes.every(
      (p) =>
        p.evidence.outcome === "loss-in-line" && p.evidence.materialDelta < 0,
    )
  ) {
    status = "supported";
    reason = "material-loss";
  }
  let attribution = no("effect-not-verified");
  if (status === "supported") {
    if (!passes.every((p) => p.alternative)) attribution = no("no-comparison");
    else if (passes[0].alternative !== passes[1].alternative)
      attribution = no("unstable-alternative");
    else {
      const actual = passes.map(
        (p) => p.questions.find((q) => q.purpose === "played")!.result.score,
      );
      const alternatives = passes.map(
        (p) =>
          p.questions.find((q) => q.purpose === "alternative")!.result.score,
      );
      // La perte d'une pièce peut compter même si son camp reste gagnant. On
      // vérifie donc un écart relatif, sans exiger une évaluation absolue négative.
      const direction = hypothesis.role === "allows-loss" ? -sign : sign;
      const gaps = passes.map(
        (_, i) => (cp(actual[i])! - cp(alternatives[i])!) * direction,
      );
      if (
        !stable(actual) ||
        !stable(alternatives) ||
        gaps.some((g) => !Number.isFinite(g) || g < 100) ||
        Math.abs(gaps[0] - gaps[1]) > 100
      )
        attribution = no("score-gap-missing");
      else if (hypothesis.role === "allows-loss" && !passes.every((p) =>
        p.freeAlternative && ["preserved", "compensated", "loss-in-line"].includes(p.freeAlternative.outcome) &&
        p.freeAlternative.materialDelta > p.evidence.materialDelta))
        attribution = no("effect-not-improved");
      else if (!stable(passes.map((p) => p.contrast.score)))
        attribution = no("effect-not-improved");
      else if (hypothesis.kind === "opened-line") {
        attribution = passes.every(
          (p) =>
            p.contrast.reason === "line-kept-closed" &&
            p.contrast.evidence?.outcome === "preserved",
        )
          ? {
              status: "supported",
              reason: "opened-line",
              scope: "conditional-mechanism",
            }
          : no("mechanism-not-used");
      } else {
        const victimSign = hypothesis.role === "allows-loss" ? sign : -sign;
        const mechanism = passes.every(
          (p) =>
            p.contrast.reason === "defence-restored" &&
            p.contrast.usedDefender &&
            p.contrast.evidence,
        );
        const improved =
          mechanism &&
          passes.every(
            (p) =>
              p.contrast.evidence!.materialDelta - p.evidence.materialDelta >=
                1 && (cp(p.contrast.score)! - cp(p.score)!) * victimSign >= 100,
          );
        attribution = !mechanism
          ? no("mechanism-not-used")
          : !improved
            ? no("effect-not-improved")
            : {
                status: "supported",
                reason: "defender-removal",
                scope: "conditional-mechanism",
              };
      }
    }
  }
  return {
    status,
    reason,
    attribution,
    hypothesis,
    passes,
    scope: "bounded-engine-check",
    explanation: null,
  };
}

/** Deux recherches libres depuis la décision, puis des questions conditionnelles
 * explicites après la même capture. Au plus cinq positions par budget. */
export class RelationVerification extends BoundedVerification<
  RelationPass,
  Omit<RelationReport, keyof VerificationCost>,
  Purpose
> {
  verifyEffect(request: Omit<RelationRequest, "alternative" | "effectOnly">, factory: EngineFactory) {
    return this.verify({ ...request, alternative: undefined, effectOnly: true }, factory);
  }
  async verify(
    request: RelationRequest,
    factory: EngineFactory,
  ): Promise<RelationReport | null> {
    this.stop();
    const { context } = request.understanding,
      hypothesis = request.understanding.mechanisms[request.mechanismIndex];
    if (!hypothesis) throw new Error("Mécanisme absent.");
    const decision = framePosition(context.before),
      played = framePosition(context.after),
      playedMove = uci(context.moves[context.decision]);
    // Valider même une alternative explicite avant d'ouvrir une connexion.
    if (request.alternative) {
      if (request.alternative === playedMove)
        throw new Error("Alternative identique.");
      decisionContext({ ...decision, played: request.alternative });
    }
    return this.run(
      request,
      JSON.stringify([
        decision.command,
        played.command,
        hypothesis,
        request.alternative ?? null,
        request.effectOnly ?? false,
      ]),
      factory,
      async ({ budgetMs, questions, ask }) => {
        const before = await ask("decision", decision);
        if (!before) return null;
        const actual = await ask("played", played);
        if (!actual) return null;
        const observation = observeMechanism(context, hypothesis, actual);
        const alternative = request.effectOnly ? null : request.alternative ??
          (before.bestMove !== playedMove ? before.bestMove : null);
        let alternativeResult = null, freeAlternative: DefenceEvidence | null = null;
        if (alternative) {
          const setup = decisionContext({ ...decision, played: alternative });
          alternativeResult = await ask(
            "alternative",
            framePosition(setup.after),
          );
          if (!alternativeResult) return null;
          if (hypothesis.role === "allows-loss") freeAlternative = preventionEvidence(setup, hypothesis.victimId, alternativeResult);
        }
        let evidence = observation.evidence,
          score = actual.score;
        const prefix = [...observation.prefix, hypothesis.capture];
        if (observation.matched) {
          const branch = extendBranch(context, prefix);
          const result = await ask(
            "actual-capture",
            framePosition(branch.frames.at(-1)!),
          );
          if (!result) return null;
          evidence = conditionalEvidence(
            context,
            hypothesis.victimId,
            prefix,
            result,
          );
          score = result.score;
        }
        const plan = relationContrast(
          context,
          hypothesis,
          observation,
          alternative,
        );
        let answer = alternativeResult;
        if (plan.branch) {
          answer = await ask(
            "recapture",
            framePosition(plan.branch.frames.at(-1)!),
          );
          if (!answer) return null;
        }
        const contrast = observeRelationContrast(plan, hypothesis, answer);
        return {
          budgetMs,
          questions,
          alternative,
          matched: observation.matched,
          prefix,
          evidence,
          score,
          freeAlternative,
          contrast: {
            reason: plan.reason,
            retained: plan.retained,
            prefix: plan.prefix,
            command:
              plan.branch?.frames.at(-1)?.command ??
              plan.setup?.after.command ??
              null,
            ...contrast,
            score: answer?.score ?? null,
          },
        };
      },
      (passes) =>
        summarize(hypothesis, passes, context.before.turn === "w" ? 1 : -1),
    );
  }
}
