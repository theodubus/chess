import { boardFromCommand } from "../StudyTree";
import type { ReviewResult } from "../model";
import { uci, type DecisionContext, type PositionFrame } from "./context";
import { tacticalFrame, type TacticalHypothesis } from "./constraints";
import { extendBranch } from "./relationContrast";
import { captureRelations } from "./relations";
import { groupEvidence, type GroupEvidence } from "./tacticalEvidence";
import type { TacticalObservation } from "./tacticalObservation";
import { witnessLine } from "./witness";

export type TacticalContrast = {
  reason: "ready" | "different-pieces" | "constraint-retained" | "pressure-changed" | "different-threat";
  frame: PositionFrame;
  prefix: string[];
  restoredMoves: string[];
  scope: "free-alternative" | "conditional-same-threat";
};
const samePiece = (actual: PositionFrame, alternative: PositionFrame, id: string, square = true) => {
  const a = actual.pieces.find((p) => p.id === id), b = alternative.pieces.find((p) => p.id === id);
  return !!a && !!b && a.type === b.type && a.color === b.color && (!square || a.square === b.square);
};
const defenderKey = (capture: ReturnType<typeof captureRelations>["captures"][number]) =>
  JSON.stringify(capture.recaptures.map((r) => `${r.defenderId}/${r.move}`).sort());

/** Ne retirer qu'une contrainte identifiée, sans attribuer au clouage une
 * pression nouvelle ni à la fourchette une prise par une autre pièce. */
export function tacticalContrast(
  context: DecisionContext,
  h: TacticalHypothesis,
  actual: TacticalObservation,
  alternative: DecisionContext,
): TacticalContrast {
  let frame = alternative.after;
  const prefix: string[] = [];
  const scope = h.role === "allows-loss" ? "conditional-same-threat" : "free-alternative";
  const plan = (reason: TacticalContrast["reason"], restoredMoves: string[] = []): TacticalContrast =>
    ({ reason, frame, prefix, restoredMoves, scope });
  if (h.role === "allows-loss") {
    try {
      const threat = uci(context.moves[h.threatPly]);
      const branch = extendBranch(alternative, [threat]);
      frame = branch.frames.at(-1)!;
      prefix.push(threat);
      // Le même UCI doit aussi porter la même identité de pièce et de prise.
      const move = branch.moves.at(-1)!, original = context.moves[h.threatPly];
      if (move.captured !== original.captured || move.promotion !== original.promotion ||
          !samePiece(actual.root, frame, h.attackerId)) return plan("different-threat");
    } catch { return plan("different-threat"); }
  }
  if (![h.attackerId, ...h.targetIds].every((id) => samePiece(actual.root, frame, id, false)))
    return plan("different-pieces");
  const facts = tacticalFrame(frame);
  if (h.kind === "double-threat") {
    const attacker = frame.pieces.find((p) => p.id === h.attackerId)!;
    const board = boardFromCommand(frame.command);
    const threatCount = h.targetIds.filter((id) => {
      const target = frame.pieces.find((p) => p.id === id)!;
      return target.type === "k"
        ? board.attackers(target.square, attacker.color).includes(attacker.square)
        : captureRelations(frame, attacker.color).captures.some((c) => c.attackerId === attacker.id && c.victimId === id);
    }).length;
    // Sauver les deux cibles en remplaçant tout le mécanisme n'est pas ce contraste.
    return plan(threatCount === 1 ? "ready" : "constraint-retained");
  }
  if (h.kind !== "pin" || !("shield" in h.fact) || !actual.capture) return plan("pressure-changed");
  const pin = h.fact;
  if (!samePiece(actual.root, frame, pin.shield.id) || !samePiece(actual.root, frame, pin.rear.id))
    return plan("different-pieces");
  if (facts.pins.some((p) => p.kind === "absolute" && p.shield.id === pin.shield.id))
    return plan("constraint-retained");
  const capture = actual.capture;
  if (capture.attackerId === h.attackerId || !samePiece(actual.root, frame, capture.attackerId))
    return plan("pressure-changed");
  const side = frame.pieces.find((p) => p.id === capture.attackerId)!.color;
  const old = captureRelations(actual.root, side).captures.find((c) => c.move === capture.move && c.victimId === capture.targetId);
  const next = captureRelations(frame, side).captures.find((c) => c.move === capture.move && c.victimId === capture.targetId && c.attackerId === capture.attackerId);
  if (!old || !next || old.balanceAfterBestRecapture !== next.balanceAfterBestRecapture || defenderKey(old) !== defenderKey(next))
    return plan("pressure-changed");
  const moves = boardFromCommand(frame.command).moves({ verbose: true })
    .filter((m) => m.from === pin.shield.square).map(uci);
  const restored = moves.filter((move) => !pin.legalMoves?.includes(move));
  return plan(restored.length ? "ready" : "constraint-retained", restored);
}

export function observeTacticalContrast(
  before: PositionFrame,
  h: TacticalHypothesis,
  plan: TacticalContrast,
  result: ReviewResult,
) {
  if (plan.reason !== "ready") return { evidence: null, usedRetreat: null };
  const ids = h.kind === "pin" && "shield" in h.fact ? [h.fact.shield.id] : h.targetIds;
  const evidence = groupEvidence(before, plan.frame, ids, result);
  const first = witnessLine(plan.frame, result.variation).moves[0];
  const usedRetreat = first && plan.restoredMoves.includes(uci(first)) ? uci(first) : null;
  return { evidence, usedRetreat };
}

export type DefenderContrast = { frame: PositionFrame; prefix: string[]; defenderId: string };
/** Le défenseur conservé doit pouvoir reprendre la même prise, immédiatement
 * après la réponse libre à l'attaque. On ne cherche pas une scène éloignée. */
export function defenderContrast(
  plan: TacticalContrast,
  actual: TacticalObservation,
  alternativeResult: ReviewResult,
): DefenderContrast | null {
  const follow = actual.followUp;
  if (plan.reason !== "ready" || !follow) return null;
  const first = witnessLine(plan.frame, alternativeResult.variation).moves[0];
  if (!first) return null;
  const response = uci(first);
  const branch = witnessLine(plan.frame, [{ from: first.from, to: first.to, fen: first.after, label: first.san }]);
  const frame = branch.frames[1];
  if (![follow.attackerId, follow.targetId, follow.defenderId].every((id) => samePiece(actual.root, frame, id))) return null;
  const attacker = frame.pieces.find((p) => p.id === follow.attackerId)!;
  const capture = captureRelations(frame, attacker.color).captures.find((c) =>
    c.move === follow.capture && c.victimId === follow.targetId && c.attackerId === follow.attackerId);
  if (!capture?.recaptures.some((r) => r.defenderId === follow.defenderId)) return null;
  const board = boardFromCommand(frame.command);
  const move = board.move(follow.capture);
  const extended = witnessLine(plan.frame, [
    { from: first.from, to: first.to, fen: first.after, label: first.san },
    { from: move.from, to: move.to, fen: move.after, label: move.san },
  ]);
  return { frame: extended.frames.at(-1)!, prefix: [response, follow.capture], defenderId: follow.defenderId };
}

export function observeDefenderContrast(
  before: PositionFrame,
  plan: TacticalContrast,
  actual: TacticalObservation,
  defence: DefenderContrast,
  result: ReviewResult,
): { evidence: GroupEvidence; usedDefender: string | null } {
  const board = boardFromCommand(plan.frame.command);
  const prefix = defence.prefix.map((uciMove) => {
    const move = board.move(uciMove);
    return { from: move.from, to: move.to, fen: move.after, label: move.san };
  });
  const evidence = groupEvidence(before, plan.frame, [
    ...actual.evidence.surviving, ...actual.evidence.captured.map((c) => c.targetId), actual.followUp!.targetId,
  ].filter((id, i, all) => all.indexOf(id) === i), { variation: [...prefix, ...result.variation] });
  const line = witnessLine(defence.frame, result.variation);
  const first = line.moves[0];
  const usedDefender = first?.captured && line.frames[0].pieces.find((p) => p.square === first.from)?.id === defence.defenderId &&
    first.to === actual.followUp!.capture.slice(2, 4) ? defence.defenderId : null;
  return { evidence, usedDefender };
}
