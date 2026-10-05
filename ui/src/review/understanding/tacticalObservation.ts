import { Chess } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import type { ReviewResult } from "../model";
import { capturedSquare, uci, type DecisionContext, type PositionFrame } from "./context";
import { tacticalFrame, type TacticalHypothesis } from "./constraints";
import { boundedContinuation } from "./evidence";
import { extendBranch } from "./relationContrast";
import { captureRelations, type CaptureRelation } from "./relations";
import { groupEvidence, targetExchange, type GroupEvidence, type TargetCapture } from "./tacticalEvidence";
import { witnessLine } from "./witness";

export type ExchangedDefender = {
  targetId: string;
  attackerId: string;
  defenderId: string;
  capture: string;
  ply: number;
  before: CaptureRelation;
  after: CaptureRelation;
};
export type TacticalObservation = {
  matched: boolean;
  reason: "observed" | "different-threat" | "constraint-absent" | "capture-not-used" | "different-attacker";
  root: PositionFrame;
  prefix: string[];
  evidence: GroupEvidence;
  capture: TargetCapture | null;
  handledTargets: string[];
  exchange: ReturnType<typeof targetExchange> | null;
  followUp: ExchangedDefender | null;
};
export function observeTactic(
  context: DecisionContext,
  h: TacticalHypothesis,
  result: ReviewResult,
): TacticalObservation {
  const bounded = boundedContinuation(context.after, result);
  const moves = witnessLine(context.after, bounded.variation).moves;
  const fresh = extendBranch(context, moves.map(uci));
  const offset = h.threatPly - context.decision;
  const root = fresh.frames[context.decision + offset + 1] ?? context.after;
  const targetIds = h.kind === "pin" && "shield" in h.fact ? [h.fact.shield.id] : h.targetIds;
  const evidence = groupEvidence(context.before, context.after, targetIds, bounded, offset === 1 ? 1 : 0);
  const observation: TacticalObservation = {
    matched: false, reason: "constraint-absent", root,
    prefix: offset === 1 && moves[0] ? [uci(moves[0])] : [],
    evidence, capture: null, handledTargets: [], exchange: null, followUp: null,
  };
  if (![0, 1].includes(offset)) return observation;
  if (offset === 1 && (!moves[0] || uci(moves[0]) !== uci(context.moves[h.threatPly])))
    return { ...observation, reason: "different-threat" };
  const facts = tacticalFrame(root);
  const shieldId = "shield" in h.fact ? h.fact.shield.id : null;
  const exists = h.kind === "double-threat"
    ? facts.doubleAttacks.some((a) => a.attacker.id === h.attackerId && h.targetIds.every((id) =>
      a.targets.some((t) => t.piece.id === id && (t.check || t.captures === null || t.captures.length))))
    : h.kind === "pin" && shieldId && facts.pins.some((p) =>
      p.kind === "absolute" && p.attacker.id === h.attackerId && p.shield.id === shieldId);
  if (!exists) return observation;
  const capture = evidence.captured.find((c) => c.ply === offset + 1) ?? null;
  if (!capture) return { ...observation, reason: "capture-not-used" };
  if (h.kind === "double-threat" && capture.attackerId !== h.attackerId)
    return { ...observation, reason: "different-attacker" };
  const defendedFrame = fresh.frames[context.decision + offset + 2];
  const defendedBoard = boardFromCommand(defendedFrame.command);
  const legal = defendedBoard.moves({ verbose: true });
  const attacker = defendedFrame.pieces.find((p) => p.id === h.attackerId);
  const handledTargets = h.targetIds.filter((id) => {
    const target = defendedFrame.pieces.find((p) => p.id === id);
    if (!target) return false;
    return target.type === "k"
      ? !attacker || !defendedBoard.attackers(target.square, attacker.color).includes(attacker.square)
      : !legal.some((m) => m.from === attacker?.square && capturedSquare(m) === target.square);
  });
  const exchange = targetExchange(context.after, bounded, capture, evidence.moves.length);
  let followUp: ExchangedDefender | null = null;
  if (h.kind === "double-threat" && exchange.complete && exchange.balance! >= 0) {
    const old = captureRelations(root, context.after.pieces.find((p) => p.id === h.attackerId)!.color);
    // Seule la première prise du camp attaquant après cet échange est examinée,
    // pas une prise éloignée choisie parce qu'elle arrange le récit.
    const index = moves.findIndex((m, i) => i > exchange.to && m.color === root.pieces.find((p) => p.id === h.attackerId)!.color);
    const move = moves[index];
    if (move?.captured && index < evidence.moves.length && old.status === "available") {
      const frame = fresh.frames[context.decision + index + 1];
      const next = captureRelations(frame, move.color).captures.find((c) => c.move === uci(move));
      const previous = next && old.captures.find((c) => c.attackerId === next.attackerId && c.victimId === next.victimId && c.move === next.move);
      const removed = previous?.recaptures.filter((r) => !next!.recaptures.some((n) => n.defenderId === r.defenderId)) ?? [];
      const samePieces = next && [next.attackerId, next.victimId].every((id) => {
        const oldPiece = root.pieces.find((p) => p.id === id);
        const piece = frame.pieces.find((p) => p.id === id);
        return oldPiece && piece && oldPiece.square === piece.square && oldPiece.type === piece.type;
      });
      if (next && previous && removed.length && removed.every((r) => r.defenderId === capture.targetId) &&
          samePieces &&
          next.balanceAfterBestRecapture > previous.balanceAfterBestRecapture &&
          new Chess(frame.fen).turn() === move.color) {
        followUp = { targetId: next.victimId, attackerId: next.attackerId,
          defenderId: capture.targetId, capture: next.move, ply: index, before: previous, after: next };
      }
    }
  }
  return { ...observation, matched: true, reason: "observed", capture, handledTargets, exchange, followUp };
}
