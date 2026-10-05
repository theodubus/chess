import type { EngineFactory } from "../../GameController";
import type { ReviewPosition } from "../model";
import { boardFromCommand } from "../StudyTree";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext, opposite, uci } from "./context";
import { framePosition } from "./evidence";
import { mateWitness, proveMate, type ForcedMateProof } from "./forcedMate";

type Purpose = "decision" | "played";
export type MateConsequenceRequest = VerificationIdentity & { position: ReviewPosition };
export type MateConsequencePass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  proof: ForcedMateProof | null;
  witness: ReturnType<typeof mateWitness> | null;
  matched: boolean;
  preExisting: boolean;
};
export type MateConsequenceReport = {
  status: "supported" | "indeterminate";
  reason: "forced-mate-confirmed" | "mate-not-confirmed" | "proof-incomplete" | "pre-existing-mate";
  passes: MateConsequencePass[];
  scope: "short-forcing-route";
  explanation: null;
} & VerificationCost;

/** Les recherches confirment l'annonce et le premier coup de mat ; les règles
 * vérifient toutes les réponses dans l'horizon annoncé (au plus mat en trois).
 * Un score de mat antérieur empêche d'imputer sa création au coup examiné. */
export class MateConsequenceVerification extends BoundedVerification<MateConsequencePass, Omit<MateConsequenceReport, keyof VerificationCost>, Purpose> {
  private proofAbort?: AbortController;
  constructor(budgets: [number, number] = [300, 900], deadlineMs = 12000, private maxNodes = 1200) {
    super(budgets, deadlineMs);
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 1200) throw new Error("Borne de preuve invalide.");
  }
  override stop() { this.proofAbort?.abort(); this.proofAbort = undefined; super.stop(); }
  verify(request: MateConsequenceRequest, factory: EngineFactory): Promise<MateConsequenceReport | null> {
    this.stop();
    const context = decisionContext(request.position), winner = opposite(context.before.turn);
    return this.run(request, JSON.stringify([context.before.command, context.after.command, this.maxNodes]), factory,
      async ({ ask, budgetMs, questions }) => {
        const pass: MateConsequencePass = { budgetMs, questions, proof: null, witness: null, matched: false, preExisting: false };
        const before = await ask("decision", framePosition(context.before));
        if (!before) return null;
        const after = await ask("played", framePosition(context.after));
        if (!after) return null;
        pass.preExisting = before.score?.kind === "mate" && before.score.winner === winner;
        const score = after.score;
        if (pass.preExisting || score?.kind !== "mate" || score.winner !== winner ||
          !Number.isInteger(score.value) || Math.abs(score.value) < 1 || Math.abs(score.value) > 3) return pass;
        const board = boardFromCommand(context.after.command), hint = after.variation.map((item) => {
          const move = board.moves({ verbose: true }).find((m) => m.from === item.from && m.to === item.to && m.after === item.fen)!;
          return uci(board.move(move));
        });
        this.proofAbort = new AbortController();
        const proof = await proveMate(context.after.command, winner, Math.abs(score.value) * 2 - 1, hint, this.proofAbort.signal, this.maxNodes);
        if (!proof) return null;
        pass.proof = proof;
        if (proof.strategy) {
          const witness = mateWitness(proof.strategy, hint);
          pass.matched = witness.moves[0] === after.bestMove;
          if (pass.matched) pass.witness = witness;
        }
        return pass;
      }, (passes) => {
        const supported = passes.every((p) => p.matched && p.proof?.status === "proved");
        return { status: supported ? "supported" : "indeterminate", passes, scope: "short-forcing-route", explanation: null,
          reason: supported ? "forced-mate-confirmed" : passes.some((p) => p.preExisting) ? "pre-existing-mate"
            : passes.some((p) => p.proof?.status === "incomplete") ? "proof-incomplete" : "mate-not-confirmed" };
      });
  }
}
