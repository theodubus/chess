import { Chess } from "chess.js";
import { legalVariation, type ReviewResult } from "../model";
import {
  capturedSquare,
  decisionContext,
  uci,
  type DecisionContext,
} from "./context";
import {
  framePosition,
  conditionalEvidence,
  preventionEvidence,
  type DefenceEvidence,
} from "./evidence";
import {
  legalMove,
  type MechanismObservation,
  type RelationHypothesis,
} from "./mechanisms";
import {
  captureRelations,
  type DefenceChange,
  type OpenedLine,
} from "./relations";

export type RelationContrast = {
  reason:
    | "no-alternative"
    | "not-observed"
    | "different-pieces"
    | "prefix-changed"
    | "no-defence-restored"
    | "line-still-open"
    | "defence-restored"
    | "line-kept-closed";
  setup?: DecisionContext;
  branch?: DecisionContext;
  retained: string[];
  prefix: string[];
};
export function extendBranch(
  context: DecisionContext,
  moves: string[],
): DecisionContext {
  const variation = legalVariation(context.after.fen, moves);
  return decisionContext(
    {
      ...framePosition(context.before),
      played: uci(context.moves[context.decision]),
    },
    moves.length
      ? {
          score: null,
          depth: null,
          bestMove: moves[0],
          bestSan: null,
          variation,
        }
      : null,
  );
}
/** L'alternative conserve une défense ou un obstacle réels. Une pièce déplacée
 * ou une autre menace demande un autre mécanisme ; aucune case n'est effacée. */
export function relationContrast(
  context: DecisionContext,
  hypothesis: RelationHypothesis,
  observation: MechanismObservation,
  alternative: string | null,
): RelationContrast {
  const no = (reason: RelationContrast["reason"]): RelationContrast => ({
    reason,
    retained: [],
    prefix: [],
  });
  if (!alternative) return no("no-alternative");
  if (!observation.matched) return no("not-observed");
  const setup = decisionContext({
    ...framePosition(context.before),
    played: alternative,
  });
  if (
    ![hypothesis.attackerId, hypothesis.victimId].every((id) => {
      const a = context.after.pieces.find((p) => p.id === id),
        b = setup.after.pieces.find((p) => p.id === id);
      return a && b && a.type === b.type && a.square === b.square;
    })
  )
    return no("different-pieces");
  if (hypothesis.kind === "opened-line") {
    const line = hypothesis.fact as OpenedLine;
    const retained = line.vacated
      .filter((v) =>
        setup.after.pieces.some(
          (p) => p.id === v.pieceId && line.path.includes(p.square),
        ),
      )
      .map((v) => v.pieceId);
    return retained.length
      ? { reason: "line-kept-closed", retained, prefix: [], setup }
      : no("line-still-open");
  }
  const change = hypothesis.fact as DefenceChange;
  let branch = setup;
  for (const [index, move] of observation.prefix.entries()) {
    const candidate = legalMove(branch.frames.at(-1)!, move),
      original =
        observation.context.moves[observation.context.decision + index + 1];
    const originalFrame =
        observation.context.frames[observation.context.decision + index + 1],
      frame = branch.frames.at(-1)!;
    if (
      !candidate ||
      frame.pieces.find((p) => p.square === candidate.from)?.id !==
        originalFrame.pieces.find((p) => p.square === original.from)?.id ||
      frame.pieces.find((p) => p.square === capturedSquare(candidate))?.id !==
        originalFrame.pieces.find((p) => p.square === capturedSquare(original))
          ?.id ||
      new Chess(candidate.after).isCheck() !==
        new Chess(original.after).isCheck()
    )
      return no("prefix-changed");
    branch = extendBranch(setup, observation.prefix.slice(0, index + 1));
  }
  const frame = branch.frames.at(-1)!,
    original = observation.context.moves[observation.capturePly!];
  const attacker = frame.pieces.find((p) => p.id === hypothesis.attackerId)!;
  const captures = captureRelations(frame, attacker.color);
  const capture = captures.captures.find(
    (c) =>
      c.move === hypothesis.capture &&
      c.victimId === hypothesis.victimId &&
      c.attackerId === hypothesis.attackerId,
  );
  const retained = change.removed
    .filter((d) =>
      capture?.recaptures.some((r) => r.defenderId === d.defenderId),
    )
    .map((d) => d.defenderId);
  const actualCapture = legalMove(frame, hypothesis.capture);
  if (
    captures.scope !== "actual-turn" ||
    !capture ||
    !actualCapture ||
    !retained.length ||
    change.after.balanceAfterBestRecapture - capture.balanceAfterBestRecapture <
      1 ||
    new Chess(actualCapture.after).isCheck() !==
      new Chess(original.after).isCheck()
  )
    return no("no-defence-restored");
  const prefix = [...observation.prefix, hypothesis.capture];
  return {
    reason: "defence-restored",
    retained,
    prefix,
    setup,
    branch: extendBranch(setup, prefix),
  };
}
export type ContrastEvidence = {
  evidence: DefenceEvidence | null;
  usedDefender: string | null;
};
export function observeRelationContrast(
  plan: RelationContrast,
  hypothesis: RelationHypothesis,
  result: ReviewResult | null,
): ContrastEvidence {
  if (!plan.setup || !result) return { evidence: null, usedDefender: null };
  if (plan.reason === "line-kept-closed")
    return {
      evidence: preventionEvidence(plan.setup, hypothesis.victimId, result),
      usedDefender: null,
    };
  if (!plan.branch) return { evidence: null, usedDefender: null };
  const frame = plan.branch.frames.at(-1)!,
    move = legalMove(frame, result.bestMove ?? "");
  const defender =
    move && capturedSquare(move) === hypothesis.capture.slice(2, 4)
      ? frame.pieces.find((p) => p.square === move.from)?.id
      : null;
  return {
    evidence: conditionalEvidence(
      plan.setup,
      hypothesis.victimId,
      plan.prefix,
      result,
    ),
    usedDefender:
      defender && plan.retained.includes(defender) ? defender : null,
  };
}
