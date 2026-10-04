import type { EngineFactory } from "../../GameController";
import type { Score } from "../../engine/analysis";
import { boardFromCommand } from "../StudyTree";
import { legalVariation } from "../model";
import { BoundedVerification, type Question, type VerificationCost, type VerificationIdentity } from "./BoundedVerification";
import { capturedSquare, uci } from "./context";
import { boundedContinuation, framePosition, restrictionEvidence, type DefenceEvidence } from "./evidence";
import { possibilities, sliderRay, type ClosedRoute } from "./possibilities";
import type { RestrictionHypothesis, Understanding } from "./prototype";
import { witnessLine } from "./witness";

type Purpose = "decision" | "played" | "defence";
export type RestrictionEffectRequest = VerificationIdentity & { understanding: Understanding; hypothesisIndex: number };
export type RestrictionCapture = {
  victimId: string; attackerId: string; threatAttackerId: string;
  handledThreat: boolean; escape: string | null; move: string; ply: number;
};
export type RestrictionEffectPass = {
  budgetMs: number;
  questions: Question<Purpose>[];
  threatMatches: boolean;
  evidence: DefenceEvidence | null;
  capture: RestrictionCapture | null;
};
export type RestrictionEffectReport = {
  status: "supported" | "contradicted" | "indeterminate";
  reason: "stable-loss" | "defence-found" | "mate-found" | "unstable-search" | "threat-changed" | "incomplete-evidence" | "compensation-found";
  hypothesis: RestrictionHypothesis;
  routes: ClosedRoute[];
  passes: RestrictionEffectPass[];
  scope: "observed-consequence";
  explanation: null;
} & VerificationCost;

/** Une issue fermée doit appartenir à la pièce et au bloqueur réellement
 * déplacé. Le déplacement antérieur est légal et sans perte locale immédiate ;
 * cela ne le transforme pas en défense garantie contre la menace suivante. */
export function closedRetreats(understanding: Understanding, h: RestrictionHypothesis): ClosedRoute[] {
  const { context } = understanding, move = context.moves[context.decision];
  if (h.kind !== "allows-restriction" || h.threatPly !== context.decision + 1 || !context.moves[h.threatPly]) return [];
  const victim = context.before.pieces.find((p) => p.id === h.victimId),
    afterVictim = context.after.pieces.find((p) => p.id === h.victimId),
    blocked = context.frames[h.threatPly + 1],
    threatened = blocked.pieces.find((p) => p.id === h.victimId),
    mover = context.before.pieces.find((p) => p.square === move.from),
    blocker = context.after.pieces.find((p) => p.id === mover?.id);
  if (!victim || victim.color !== move.color || !afterVictim || !threatened || !blocker ||
    victim.square !== afterVictim.square || victim.square !== threatened.square ||
    victim.type !== threatened.type || victim.id === blocker.id || blocker.square !== move.to ||
    blocked.pieces.find((p) => p.id === blocker.id)?.square !== blocker.square) return [];
  const options = possibilities(context.before, victim.color, victim.id);
  if (options.status !== "available") return [];
  return h.closedRoutes.filter((route) => {
    const exit = options.pieces[0]?.moves.find((m) => m.move.from === route.from && m.move.to === route.to);
    const first = sliderRay(victim.type, victim.square, route.to)
      .map((square) => context.after.pieces.find((p) => p.square === square)).find((p) => p);
    return route.pieceId === victim.id && route.from === victim.square && route.blockerId === blocker.id &&
      route.blocker === blocker.square && first?.id === blocker.id && !!exit &&
      !exit.captures.some((capture) => capture.balanceAfterImmediateRecapture < 0);
  });
}
const cp = (s: Score | null) => s?.kind === "cp" && !s.bound && Number.isFinite(s.value) ? s.value : null;
const stable = (values: (number | null)[]) => values.length === 2 && values.every((v) => v !== null) && Math.abs(values[0]! - values[1]!) <= 100;

/** Suivre la même pièce, y compris lorsqu'elle tente une sortie déjà exposée.
 * Une autre perte dans la PV ne démontre jamais la restriction de cette victime.
 * La capture de sortie doit être celle inventoriée après la menace, avec le même
 * attaquant ; pas une nouvelle menace apparue plusieurs développements plus tard. */
export function restrictionCapture(understanding: Understanding, h: RestrictionHypothesis, evidence: DefenceEvidence): RestrictionCapture | null {
  const { context } = understanding, frame = context.frames[h.threatPly + 1],
    prior = possibilities(context.frames[h.threatPly], context.before.turn, h.victimId),
    attacks = prior.status === "available" ? h.attack?.filter((a) =>
      !prior.pieces[0]?.legalCapturers?.some((old) => old.attackerId === a.attackerId)) ?? [] : [],
    line = witnessLine(context.after, legalVariation(context.after.fen, evidence.moves)),
    ply = line.moves.findIndex((m, index) => line.frames[index].pieces.find((p) => p.square === capturedSquare(m))?.id === h.victimId);
  if (ply < 0 || !attacks.length) return null;
  const move = line.moves[ply], attacker = line.frames[ply].pieces.find((p) => p.square === move.from)!;
  const blocker = context.after.pieces.find((p) => p.square === context.moves[context.decision].to)!;
  const departurePly = line.moves.findIndex((m, index) => line.frames[index].pieces.find((p) => p.square === m.from)?.id === h.victimId);
  const departure = line.moves[departurePly], taken = departure && line.frames[departurePly].pieces.find((p) => p.square === capturedSquare(departure)),
    direct = departurePly < 0 && attacks.some((a) => a.attackerId === attacker.id),
    handled = departurePly === 1 && ply === 2 && taken && attacks.some((a) => a.attackerId === taken.id),
    exit = departure && h.exits.find((e) => uci(e.move) === uci(departure)),
    escape = departurePly > 0 && ply === departurePly + 1 && exit?.captures.some((c) =>
      uci(c.move) === uci(move) && frame.pieces.find((p) => p.square === c.move.from)?.id === attacker.id &&
      c.balanceAfterImmediateRecapture < 0) &&
      h.closedRoutes.some((r) => r.blockerId === blocker.id && r.blocker === blocker.square &&
        line.frames[departurePly].pieces.find((p) => p.id === r.blockerId)?.square === r.blocker);
  if (!direct && !handled && !escape) return null;
  return { victimId: h.victimId, attackerId: attacker.id, threatAttackerId: direct ? attacker.id : handled ? taken!.id : attacks[0].attackerId,
    handledThreat: !!handled, escape: !direct && !handled && escape ? uci(departure) : null, move: uci(move), ply };
}

/** La menace est choisie librement après la décision, puis le moteur recherche
 * une défense depuis cette position exacte. Aucune variante d'un remplacement
 * n'est nécessaire. La perte doit rester liée au même attaquant et à la victime,
 * avec bilan depuis la décision (pas seulement depuis l'attaque du pion). */
export class RestrictionEffectVerification extends BoundedVerification<RestrictionEffectPass, Omit<RestrictionEffectReport, keyof VerificationCost>, Purpose> {
  verify(request: RestrictionEffectRequest, factory: EngineFactory): Promise<RestrictionEffectReport | null> {
    this.stop();
    const { understanding } = request, { context } = understanding,
      h = understanding.hypotheses[request.hypothesisIndex];
    if (!h) throw new Error("Restriction absente.");
    const routes = closedRetreats(understanding, h);
    if (!routes.length) throw new Error("Retraite utile fermée par la décision requise.");
    const threat = uci(context.moves[h.threatPly]), defence = context.frames[h.threatPly + 1];
    return this.run(request, JSON.stringify([context.before.command, context.after.command, defence.command, h, routes]), factory,
      async ({ ask, budgetMs, questions }) => {
        const pass: RestrictionEffectPass = { budgetMs, questions, threatMatches: false, evidence: null, capture: null };
        if (!await ask("decision", framePosition(context.before))) return null;
        const actual = await ask("played", framePosition(context.after));
        if (!actual) return null;
        pass.threatMatches = actual.bestMove === threat;
        if (!pass.threatMatches) return pass;
        const response = await ask("defence", framePosition(defence));
        if (!response) return null;
        const board = boardFromCommand(defence.command);
        const moves = boundedContinuation(defence, response).variation.map((item) => {
          const legal = board.moves({ verbose: true }).find((m) => m.from === item.from && m.to === item.to && m.after === item.fen);
          if (!legal) throw new Error("Défense d'une autre position.");
          return uci(board.move(legal));
        });
        pass.evidence = restrictionEvidence(context, h.victimId, { ...actual, variation: legalVariation(context.after.fen, [threat, ...moves]) });
        pass.capture = restrictionCapture(understanding, h, pass.evidence);
        return pass;
      }, (passes) => {
        let status: RestrictionEffectReport["status"] = "indeterminate", reason: RestrictionEffectReport["reason"] = "incomplete-evidence";
        const evidence = passes.map((p) => p.evidence),
          scores = (purpose: Purpose) => passes.map((p) => cp(p.questions.find((q) => q.purpose === purpose)?.result.score ?? null));
        if (passes.some((p) => !p.threatMatches)) reason = "threat-changed";
        else if (evidence.every((e) => e?.outcome === "mate-for-victim")) { status = "contradicted"; reason = "mate-found"; }
        else if (!stable(scores("played")) || !stable(scores("defence")) || evidence[0]?.outcome !== evidence[1]?.outcome ||
          evidence[0]?.materialDelta !== evidence[1]?.materialDelta) reason = "unstable-search";
        else if (evidence.every((e) => e?.outcome === "preserved")) { status = "contradicted"; reason = "defence-found"; }
        else if (evidence.every((e) => e?.outcome === "compensated")) { status = "contradicted"; reason = "compensation-found"; }
        else if (passes.every((p) => p.capture && p.evidence?.outcome === "loss-in-line" && p.evidence.materialDelta < 0)) {
          status = "supported"; reason = "stable-loss";
        }
        return { status, reason, hypothesis: h, routes, passes, scope: "observed-consequence", explanation: null };
      });
  }
}
