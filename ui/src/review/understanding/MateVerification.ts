import type { EngineFactory } from "../../GameController";
import { Chess } from "chess.js";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext, uci } from "./context";
import { shortMateProof, type ShortMateProof, type TacticalHypothesis } from "./constraints";
import { framePosition } from "./evidence";
import type { Understanding } from "./prototype";

type Purpose = "decision" | "played" | "alternative";
export type MateRequest = VerificationIdentity & {
  understanding: Pick<Understanding, "context" | "constraints">;
  hypothesisIndex: number;
  /** Explicite : aucun deuxième choix moteur ne peut être déduit sans MultiPV. */
  alternative: string;
};
export type MatePass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  matched: boolean;
  illustration: string[];
  continuation: "engine-line" | "rules-completed" | null;
};
export type MateReport = {
  status: "supported" | "indeterminate";
  reason: "short-mate-confirmed" | "engine-line-differs";
  hypothesis: TacticalHypothesis;
  proof: ShortMateProof;
  contrast: {
    status: "short-route-absent" | "not-established";
    retainedBlocker: boolean;
    retainedRoute: boolean;
    proof: ShortMateProof;
    alternative: string;
    /** L'absence de mat en deux demi-coups ne prouve pas l'absence de mat long. */
    scope: "same-short-horizon";
  };
  quality: "best-choice-in-these-searches" | "not-established";
  passes: MatePass[];
  scope: "short-forcing-route";
  explanation: null;
} & VerificationCost;

/** Comparaison spécialisée, sans généraliser les scores de mat aux centipions.
 * La preuve locale couvre toutes les réponses ; le moteur doit en choisir une
 * et montrer le même mat immédiat aux deux budgets. L'alternative reste libre. */
export class MateVerification extends BoundedVerification<MatePass, Omit<MateReport, keyof VerificationCost>, Purpose> {
  async verify(request: MateRequest, factory: EngineFactory): Promise<MateReport | null> {
    this.stop();
    const { context, constraints } = request.understanding;
    const hypothesis = constraints.hypotheses[request.hypothesisIndex];
    if (!hypothesis || hypothesis.kind !== "deflection-mate" || !("proof" in hypothesis.fact))
      throw new Error("Déviation avec preuve courte requise.");
    const fact = hypothesis.fact, playedMove = uci(context.moves[context.decision]);
    if (request.alternative === playedMove) throw new Error("Alternative identique.");
    const alternative = decisionContext({ ...framePosition(context.before), played: request.alternative });
    const proof = shortMateProof(context.after);
    if (proof.status !== "proved") throw new Error("Mat court non démontré.");
    const alternativeProof = shortMateProof(alternative.after);
    const blocker = context.after.pieces.find((p) => p.id === fact.blockerId)!;
    const retainedBlocker = alternative.after.pieces.some((p) => p.id === blocker.id && p.square === blocker.square);
    const attacker = context.after.pieces.find((p) => p.id === hypothesis.attackerId)!;
    const king = context.after.pieces.find((p) => hypothesis.targetIds.includes(p.id) && p.type === "k")!;
    const samePiece = (piece: typeof attacker) => alternative.after.pieces.some((p) =>
      p.id === piece.id && p.square === piece.square && p.type === piece.type);
    const retainedRoute = retainedBlocker && samePiece(attacker) && samePiece(king) &&
      alternative.after.pieces.filter((p) => fact.ray.slice(0, -1).includes(p.square))
        .every((p) => p.id === blocker.id) &&
      alternative.after.pieces.find((p) => p.square === fact.mate.slice(2, 4))?.id ===
        context.after.pieces.find((p) => p.square === fact.mate.slice(2, 4))?.id;
    const key = JSON.stringify([context.before.command, context.after.command, hypothesis, alternative.after.command]);
    return this.run(request, key, factory, async ({ ask, budgetMs, questions }) => {
      const before = await ask("decision", framePosition(context.before));
      if (!before) return null;
      const after = await ask("played", framePosition(context.after));
      if (!after) return null;
      if (!await ask("alternative", framePosition(alternative.after))) return null;
      const board = new Chess(context.after.fen);
      const sequence = after.variation.slice(0, 2).map((item) => {
        const move = board.moves({ verbose: true }).find((m) => m.from === item.from && m.to === item.to && m.after === item.fen)!;
        board.move(move);
        return uci(move);
      });
      const legalReply = proof.replies.find((r) => r.move === sequence[0]);
      // Certains moteurs terminent leur PV juste avant le mat annoncé. Ici,
      // seule la preuve exhaustive peut compléter CE mat légal immédiat ;
      // ce complément n'est jamais attribué à la variante émise par le moteur.
      const completed = sequence.length === 1 && legalReply?.mates.includes(fact.mate);
      if (completed) {
        board.move(fact.mate);
        sequence.push(fact.mate);
      }
      const matched = sequence.length === 2 && !!legalReply?.mates.includes(sequence[1]) &&
        board.isCheckmate() && after.score?.kind === "mate" && !after.score.bound &&
        after.score.winner === context.before.turn && Math.abs(after.score.value) === 1;
      return {
        budgetMs, questions, matched, illustration: matched ? sequence : [],
        continuation: matched ? completed ? "rules-completed" : "engine-line" : null,
      };
    }, (passes) => {
      const supported = passes.every((p) => p.matched);
      return {
        status: supported ? "supported" : "indeterminate",
        reason: supported ? "short-mate-confirmed" : "engine-line-differs",
        hypothesis, proof,
        contrast: {
          status: supported && retainedRoute && alternativeProof.status === "refuted" ? "short-route-absent" : "not-established",
          retainedBlocker, retainedRoute, proof: alternativeProof, alternative: request.alternative, scope: "same-short-horizon",
        },
        quality: supported && passes.every((p) => {
          const r = p.questions.find((q) => q.purpose === "decision")!.result;
          return r.bestMove === playedMove && r.score?.kind === "mate" &&
            r.score.winner === context.before.turn && Math.abs(r.score.value) === 2;
        })
          ? "best-choice-in-these-searches" : "not-established",
        passes, scope: "short-forcing-route", explanation: null,
      };
    });
  }
}
