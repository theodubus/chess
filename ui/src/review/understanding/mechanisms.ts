import type { Square } from "chess.js";
import { usableResult } from "../FocusedAnalysis";
import { boardFromCommand } from "../StudyTree";
import type { ReviewResult } from "../model";
import {
  capturedSquare,
  decisionContext,
  uci,
  type DecisionContext,
} from "./context";
import {
  boundedContinuation,
  framePosition,
  preventionEvidence,
  type DefenceEvidence,
} from "./evidence";
import {
  captureRelations,
  type DefenceChange,
  type OpenedLine,
  type RelationChanges,
} from "./relations";

export type RelationHypothesis = {
  kind: "defender-removal" | "opened-line";
  status: "hypothesis";
  role: "allows-loss" | "creates-opportunity";
  victimId: string;
  victimSquare: Square;
  attackerId: string;
  capture: string;
  fact: DefenceChange | OpenedLine;
  unverified: readonly [
    "reply",
    "compensation",
    "alternative",
    "causal-contribution",
  ];
};
/** Une relation n'est une hypothèse de gain que si une capture légale existe et
 * que retirer cette défense améliore son bilan local. La qualité reste inconnue. */
export function relationHypotheses(
  context: DecisionContext,
  relations: RelationChanges,
): RelationHypothesis[] {
  const result: RelationHypothesis[] = [];
  const add = (
    kind: RelationHypothesis["kind"],
    victimId: string,
    attackerId: string,
    capture: string,
    fact: RelationHypothesis["fact"],
  ) => {
    const victim = context.after.pieces.find((p) => p.id === victimId)!;
    result.push({
      kind,
      status: "hypothesis",
      role:
        victim.color === context.before.turn
          ? "allows-loss"
          : "creates-opportunity",
      victimId,
      victimSquare: victim.square,
      attackerId,
      capture,
      fact,
      unverified: [
        "reply",
        "compensation",
        "alternative",
        "causal-contribution",
      ],
    });
  };
  for (const change of relations.defences) {
    if (
      !change.removed.length ||
      change.after.balanceAfterBestRecapture -
        change.before.balanceAfterBestRecapture <
        1
    )
      continue;
    add(
      "defender-removal",
      change.victimId,
      change.attackerId,
      change.after.move,
      change,
    );
  }
  for (const line of relations.openedLines) {
    if (
      line.role !== "attack" ||
      line.capture?.status === "illegal" ||
      !line.capture
    )
      continue;
    const source = context.after.pieces.find((p) => p.id === line.sourceId)!;
    let captures = relations.after[source.color];
    if (line.capture.status === "unavailable") {
      // Un échec peut interdire la sonde. Attendre une vraie réponse légale
      // de la variante connue, sans fabriquer le trait de l'attaquant.
      const reply = context.frames[context.decision + 2];
      if (
        !reply ||
        reply.turn !== source.color ||
        ![line.sourceId, line.targetId].every((id) => {
          const before = context.after.pieces.find((p) => p.id === id),
            after = reply.pieces.find((p) => p.id === id);
          return (
            before &&
            after &&
            before.square === after.square &&
            before.type === after.type
          );
        })
      )
        continue;
      captures = captureRelations(reply, source.color);
    }
    const capture = captures.captures.find(
      (c) => c.attackerId === line.sourceId && c.victimId === line.targetId,
    );
    if (!capture || capture.balanceAfterBestRecapture <= 0) continue;
    add("opened-line", line.targetId, line.sourceId, capture.move, line);
  }
  return result;
}
export type MechanismObservation = {
  matched: boolean;
  reason: "capture-observed" | "different-continuation";
  capturePly: number | null;
  prefix: string[];
  context: DecisionContext;
  evidence: DefenceEvidence;
};
/** La capture doit exploiter les mêmes pièces au prochain tour de l'attaquant,
 * avec au plus une réponse intermédiaire. On ne cherche pas loin dans la PV. */
export function observeMechanism(
  context: DecisionContext,
  hypothesis: RelationHypothesis,
  result: ReviewResult,
): MechanismObservation {
  if (!usableResult(framePosition(context.after), result))
    throw new Error("Réponse inexploitable pour la décision.");
  const fresh = decisionContext(
    {
      ...framePosition(context.before),
      played: uci(context.moves[context.decision]),
    },
    boundedContinuation(context.after, result),
  );
  let capturePly: number | null = null;
  for (const ply of [fresh.decision + 1, fresh.decision + 2]) {
    const move = fresh.moves[ply];
    if (!move) continue;
    const frame = fresh.frames[ply];
    if (
      uci(move) === hypothesis.capture &&
      frame.pieces.find((p) => p.square === move.from)?.id ===
        hypothesis.attackerId &&
      frame.pieces.find((p) => p.square === capturedSquare(move))?.id ===
        hypothesis.victimId
    ) {
      capturePly = ply;
      break;
    }
  }
  return {
    matched: capturePly !== null,
    reason: capturePly === null ? "different-continuation" : "capture-observed",
    capturePly,
    prefix:
      capturePly === null
        ? []
        : fresh.moves.slice(fresh.decision + 1, capturePly).map(uci),
    context: fresh,
    evidence: preventionEvidence(fresh, hypothesis.victimId, result),
  };
}
export function legalMove(frame: DecisionContext["after"], move: string) {
  const board = boardFromCommand(frame.command);
  return !board.isGameOver()
    ? board.moves({ verbose: true }).find((m) => uci(m) === move)
    : undefined;
}
