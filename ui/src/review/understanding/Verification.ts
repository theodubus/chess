import type { EngineFactory } from "../../GameController";
import type { Score } from "../../engine/analysis";
import {
  BoundedVerification,
  type VerificationCost,
} from "./BoundedVerification";
import { boardFromCommand, StudyTree } from "../StudyTree";
import type { ReviewPosition, ReviewResult } from "../model";
import { uci } from "./context";
import {
  defenceEvidence,
  framePosition,
  type DefenceEvidence,
} from "./evidence";
import type { Understanding } from "./prototype";
import {
  attributeRestriction,
  observeContrast,
  planContrast,
  type Attribution,
  type ContrastObservation,
} from "./contrast";

export type VerificationRequest = {
  review: object;
  revision: number;
  engineId: string;
  understanding: Understanding;
  hypothesisIndex: number;
  /** Facultatif : une alternative légale à comparer. Sinon, le premier choix
   * du moteur est utilisé seulement s'il diffère du coup joué. */
  alternative?: string;
};
export type Question = {
  purpose: "decision" | "played" | "defence" | "alternative" | "same-threat";
  position: ReviewPosition;
  result: ReviewResult;
};
export type VerificationPass = {
  budgetMs: number;
  questions: Question[];
  evidence: DefenceEvidence | null;
  threatMatches: boolean;
  alternative: string | null;
  contrast: ContrastObservation;
};
export type VerificationReport = {
  /** Porte sur le mécanisme court dans les variantes calculées, pas sur une
   * preuve exhaustive ni sur la cause du classement du coup. */
  status: "supported" | "contradicted" | "indeterminate";
  reason:
    | "stable-loss"
    | "defence-found"
    | "mate-found"
    | "unstable-search"
    | "threat-changed"
    | "incomplete-evidence"
    | "compensation-found";
  comparison:
    | "played-better"
    | "alternative-better"
    | "similar"
    | "unavailable"
    | "unstable";
  attribution: Attribution;
  passes: VerificationPass[];
  cached: boolean;
  elapsedMs: number;
  searches: number;
  requestedSearchMs: number;
  scope: "bounded-engine-check";
  explanation: null;
};
const cp = (score: Score | null) => (score?.kind === "cp" ? score.value : null);
function stable(a: Score | null, b: Score | null) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "cp") return Math.abs(a.value - b.value) <= 100;
  const winner = (s: Score) =>
    s.winner ?? (s.value > 0 ? "w" : s.value < 0 ? "b" : null);
  return winner(a) !== null && winner(a) === winner(b);
}
function compare(
  passes: VerificationPass[],
  sign: number,
): VerificationReport["comparison"] {
  if (passes.length !== 2 || !passes[0].alternative || !passes[1].alternative)
    return "unavailable";
  if (passes[0].alternative !== passes[1].alternative) return "unstable";
  const differences = passes.map((pass) => {
    const actual = cp(
        pass.questions.find((q) => q.purpose === "played")!.result.score,
      ),
      alternative = cp(
        pass.questions.find((q) => q.purpose === "alternative")!.result.score,
      );
    return actual === null || alternative === null
      ? null
      : (actual - alternative) * sign;
  });
  if (differences.some((value) => value === null)) return "unavailable";
  if (Math.abs(differences[0]! - differences[1]!) > 100) return "unstable";
  if (differences.every((value) => value! >= 100)) return "played-better";
  if (differences.every((value) => value! <= -100)) return "alternative-better";
  return differences.every((value) => Math.abs(value!) < 100)
    ? "similar"
    : "unstable";
}

/** Questions distinctes et deux budgets indépendants : une passe longue ne
 * réutilise jamais le résultat court. Aucune commande MultiPV/searchmoves. */
export class Verification extends BoundedVerification<
  VerificationPass,
  Omit<VerificationReport, keyof VerificationCost>,
  Question["purpose"]
> {
  async verify(
    request: VerificationRequest,
    factory: EngineFactory,
  ): Promise<VerificationReport | null> {
    this.stop();
    const { understanding, hypothesisIndex } = request,
      hypothesis = understanding.hypotheses[hypothesisIndex];
    if (!hypothesis) throw new Error("Hypothèse absente.");
    const { context } = understanding,
      decision = framePosition(context.before),
      played = framePosition(context.after),
      defence = framePosition(context.frames[hypothesis.threatPly + 1]),
      playedMove = uci(context.moves[context.decision]);
    const alternativePosition = (move: string) => {
      const board = boardFromCommand(decision.command),
        legal = board.moves({ verbose: true }).find((m) => uci(m) === move);
      if (!legal || move === playedMove)
        throw new Error("Alternative absente ou illégale.");
      const tree = new StudyTree(decision),
        node = tree.play(0, legal.from, legal.to, legal.promotion);
      return tree.position(node!);
    };
    if (request.alternative) alternativePosition(request.alternative);
    const key = JSON.stringify([
      request.revision,
      request.engineId,
      decision.command,
      played.command,
      defence.command,
      hypothesis,
      request.alternative ?? null,
    ]);
    return this.run(
      request,
      key,
      factory,
      async ({ budgetMs, questions, ask }) => {
        const pass: VerificationPass = {
          budgetMs,
          questions,
          evidence: null,
          threatMatches: false,
          alternative: null,
          contrast: observeContrast(
            { reason: "no-alternative", routes: [] },
            null,
          ),
        };
        const before = await ask("decision", decision);
        if (!before) return null;
        const actual = await ask("played", played);
        if (!actual) return null;
        pass.threatMatches =
          hypothesis.threatPly === context.decision ||
          actual.bestMove === uci(context.moves[hypothesis.threatPly]);
        const response = await ask("defence", defence);
        if (!response) return null;
        pass.evidence = defenceEvidence(understanding, hypothesis, response);
        pass.alternative =
          request.alternative ??
          (before.bestMove !== playedMove ? before.bestMove : null);
        const alternativeResult = pass.alternative
          ? await ask("alternative", alternativePosition(pass.alternative))
          : null;
        if (pass.alternative && !alternativeResult) return null;
        const plan = planContrast(understanding, hypothesis, pass.alternative);
        const answer =
          plan.position && pass.threatMatches
            ? await ask("same-threat", plan.position)
            : null;
        pass.contrast = observeContrast(
          plan,
          plan.removedAttacker ? alternativeResult : answer,
        );
        return pass;
      },
      (passes) => {
        const results = passes.map(
            (p) => p.questions.find((q) => q.purpose === "defence")!.result,
          ),
          evidence = passes.map((p) => p.evidence!),
          victim = context.frames[hypothesis.threatPly + 1].pieces.find(
            (p) => p.id === hypothesis.victimId,
          )!,
          victimSign = victim.color === "w" ? 1 : -1;
        let status: VerificationReport["status"] = "indeterminate",
          reason: VerificationReport["reason"] = "incomplete-evidence";
        if (passes.some((p) => !p.threatMatches)) reason = "threat-changed";
        else if (
          !stable(results[0].score, results[1].score) ||
          evidence[0].outcome !== evidence[1].outcome
        )
          reason = "unstable-search";
        else if (evidence.every((e) => e.outcome === "mate-for-victim")) {
          status = "contradicted";
          reason = "mate-found";
        } else if (evidence.every((e) => e.outcome === "preserved")) {
          status = "contradicted";
          reason = "defence-found";
        } else if (evidence.every((e) => e.outcome === "compensated")) {
          status = "contradicted";
          reason = "compensation-found";
        } else if (
          evidence.every((e) => e.outcome === "loss-in-line") &&
          results.every(
            (r) => cp(r.score) !== null && cp(r.score)! * victimSign < -75,
          )
        ) {
          status = "supported";
          reason = "stable-loss";
        }
        const comparison = compare(
          passes,
          context.before.turn === "w" ? 1 : -1,
        );
        return {
          status,
          reason,
          passes,
          comparison,
          attribution: attributeRestriction(passes, {
            lossSupported: status === "supported",
            alternativeBetter: comparison === "alternative-better",
            originalScores: results.map((result) => result.score),
            victimSide: victim.color,
          }),
          scope: "bounded-engine-check",
          explanation: null,
        };
      },
    );
  }
}
