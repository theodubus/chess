import { Chess } from "chess.js";
import type { EngineFactory } from "../../GameController";
import { materialBalance } from "../../material";
import type { ReviewPosition } from "../model";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { decisionContext } from "./context";
import { delayedTacticContrastWork, delayedTacticEffect, tacticalTimelineWork, type DelayedContrast, type DelayedTactic } from "./delayedTactics";
import { boundedContinuation, framePosition } from "./evidence";
import { scorePreference } from "./scorePreference";
import { groupEvidence, type GroupEvidence } from "./tacticalEvidence";
import { completeWork } from "./work";

type Purpose = "decision" | "played" | "alternative";
export type DelayedTacticRequest = VerificationIdentity & {
  position: ReviewPosition;
  event: Pick<DelayedTactic, "key" | "ply">;
};
export type DelayedTacticPass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  event: DelayedTactic | null;
  effect: ReturnType<typeof delayedTacticEffect> | null;
  contrast: DelayedContrast | null;
  alternative: string | null;
  alternativeEvidence: GroupEvidence | null;
  alternativeSafe: boolean;
};
export type DelayedTacticReport = {
  scope: "bounded-lines-and-conditional-prefix";
  status: "corroborated-candidate" | "unconfirmed";
  reason: "matching-lines" | "motif-changed" | "effect-unconfirmed" | "contrast-unconfirmed" | "alternative-unconfirmed" | "unstable-search";
  publishable: false;
  passes: DelayedTacticPass[];
} & VerificationCost;

/** Expérience hors produit : les deux recherches libres et l'intervention
 * légale corroborent un candidat. Elles ne prouvent pas toutes les défenses
 * et ne suffisent pas à publier automatiquement une explication causale. */
export class DelayedTacticVerification extends BoundedVerification<DelayedTacticPass, Omit<DelayedTacticReport, keyof VerificationCost>, Purpose> {
  private inspection?: AbortController;
  override stop() { this.inspection?.abort(); this.inspection = undefined; super.stop(); }
  verify(input: DelayedTacticRequest, factory: EngineFactory): Promise<DelayedTacticReport | null> {
    this.stop();
    const request = { ...input, position: structuredClone(input.position), event: { ...input.event } };
    const root = decisionContext(request.position);
    return this.run(request, JSON.stringify([request.position, request.event]), factory, async ({ ask, budgetMs, questions }) => {
      const abort = new AbortController(); this.inspection = abort;
      const decision = await ask("decision", framePosition(root.before)), played = decision && await ask("played", framePosition(root.after));
      if (!decision || !played || abort.signal.aborted) return null;
      const result = boundedContinuation(root.after, played), context = decisionContext(request.position, result);
      const timeline = await completeWork(tacticalTimelineWork(context), abort.signal);
      if (!timeline) return null;
      const event = timeline.events.find(e => e.key === request.event.key && e.ply === request.event.ply && e.role === "allows-loss") ?? null;
      const effect = event ? delayedTacticEffect(context, event) : null;
      const alternative = decision.bestMove && decision.bestMove !== request.position.played ? decision.bestMove : null;
      const pass: DelayedTacticPass = { budgetMs, questions, event, effect, alternative, contrast: null, alternativeEvidence: null, alternativeSafe: false };
      if (!event || !alternative || event.preexisting || !event.rootPath || effect?.status !== "loss-observed") return pass;
      pass.contrast = await completeWork(delayedTacticContrastWork(context, event, alternative), abort.signal);
      if (!pass.contrast) return null;
      if (pass.contrast.status !== "conditional-contribution") return pass;
      const setup = decisionContext({ ...request.position, played: alternative });
      const response = await ask("alternative", framePosition(setup.after));
      if (!response || abort.signal.aborted) return null;
      const bounded = boundedContinuation(setup.after, response), other = decisionContext({ ...request.position, played: alternative }, bounded);
      const targetIds = event.kind === "pin" && "shield" in event.fact ? [event.fact.shield.id] : event.targetIds;
      if (!targetIds.every(id => setup.after.pieces.some(p => p.id === id))) return pass;
      pass.alternativeEvidence = groupEvidence(root.before, setup.after, targetIds, bounded);
      const otherTimeline = await completeWork(tacticalTimelineWork(other), abort.signal);
      if (!otherTimeline) return null;
      // Ne pas s'arrêter à une sauvegarde immédiate si la même PV libre montre
      // ensuite une autre perte. La borne de huit demi-coups reste explicite.
      const delta = (materialBalance(new Chess(other.frames.at(-1)!.fen)) - materialBalance(new Chess(root.before.fen))) * (root.before.turn === "w" ? 1 : -1);
      pass.alternativeSafe = pass.alternativeEvidence.outcome === "preserved" && delta >= 0 &&
        !otherTimeline.events.some(e => e.role === "allows-loss" && delayedTacticEffect(other, e).status === "loss-observed");
      return pass;
    }, passes => {
      let reason: DelayedTacticReport["reason"] = "matching-lines";
      const question = (pass: DelayedTacticPass, purpose: Purpose) => pass.questions.find(q => q.purpose === purpose);
      if (passes.some(p => !p.event || p.event.preexisting || !p.event.rootPath)) reason = "motif-changed";
      else if (passes.some(p => p.effect?.status !== "loss-observed")) reason = "effect-unconfirmed";
      else if (passes.some(p => p.contrast?.status !== "conditional-contribution")) reason = "contrast-unconfirmed";
      else if (passes.some(p => !p.alternativeSafe)) reason = "alternative-unconfirmed";
      else if (passes.length !== 2 || passes[0].alternative !== passes[1].alternative ||
        passes[0].effect?.evidence.materialDelta !== passes[1].effect?.evidence.materialDelta ||
        passes[0].effect?.capture?.targetId !== passes[1].effect?.capture?.targetId ||
        passes.some(p => !scorePreference(question(p, "played")?.result.score, question(p, "alternative")?.result.score, root.before.turn))) reason = "unstable-search";
      return { scope: "bounded-lines-and-conditional-prefix", status: reason === "matching-lines" ? "corroborated-candidate" : "unconfirmed", reason, publishable: false, passes };
    });
  }
}
