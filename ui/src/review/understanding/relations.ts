import { Chess, type Color, type Square } from "chess.js";
import { materialBalance } from "../../material";
import {
  capturedSquare,
  uci,
  type DecisionContext,
  type PositionFrame,
  type TrackedPiece,
} from "./context";
import { boardFor, sliderRay } from "./possibilities";
import { legalCapturesOf } from "./legalCaptures";

export type CaptureRelation = {
  attackerId: string;
  victimId: string;
  move: string;
  from: Square;
  to: Square;
  /** Une défense n'est retenue que si cette reprise résout aussi les échecs. */
  recaptures: { defenderId: string; move: string }[];
  balanceAfterBestRecapture: number;
};
export type CaptureRelations = {
  status: "available" | "unavailable";
  scope: "actual-turn" | "geometric-turn-probe";
  captures: CaptureRelation[];
};
export type DefenceChange = {
  attackerId: string;
  victimId: string;
  before: CaptureRelation;
  after: CaptureRelation;
  beforeScope: CaptureRelations["scope"];
  afterScope: CaptureRelations["scope"];
  removed: {
    defenderId: string;
    reason: "captured" | "moved" | "constrained";
  }[];
  added: string[];
};
export type OpenedLine = {
  sourceId: string;
  targetId: string;
  from: Square;
  to: Square;
  role: "attack" | "defence";
  path: Square[];
  vacated: { pieceId: string; square: Square; destination: Square | null }[];
  /** Une ligne géométrique ouverte peut rester inexploitable par un clouage. */
  capture: {
    status: "legal" | "illegal" | "unavailable";
    scope: CaptureRelations["scope"];
  } | null;
};
export type RelationChanges = {
  before: Record<Color, CaptureRelations>;
  after: Record<Color, CaptureRelations>;
  defences: DefenceChange[];
  openedLines: OpenedLine[];
};

/** Le trait sondé est annoncé explicitement. On ne simule jamais un coup nul
 * pendant un échec, et les reprises appartiennent à une branche de capture légale. */
export function captureRelations(
  frame: PositionFrame,
  side: Color,
): CaptureRelations {
  const scope = frame.turn === side ? "actual-turn" : "geometric-turn-probe";
  const board = !frame.terminal ? boardFor(frame, side) : null;
  if (!board) return { status: "unavailable", scope, captures: [] };
  const initial = materialBalance(board),
    sign = side === "w" ? 1 : -1;
  const captures = board
    .moves({ verbose: true })
    .filter((m) => m.captured)
    .map((move) => {
      const next = new Chess(move.after);
      const replies = legalCapturesOf(next, move.to);
      return {
        attackerId: frame.pieces.find((p) => p.square === move.from)!.id,
        victimId: frame.pieces.find((p) => p.square === capturedSquare(move))!
          .id,
        move: uci(move),
        from: move.from,
        to: move.to,
        recaptures: replies.map((reply) => ({
          defenderId: frame.pieces.find((p) => p.square === reply.from)!.id,
          move: uci(reply),
        })),
        // Une borne matérielle locale, pas une recherche d'échange ni un verdict.
        balanceAfterBestRecapture:
          Math.min(
            materialBalance(next) * sign,
            ...replies.map(
              (reply) => materialBalance(new Chess(reply.after)) * sign,
            ),
          ) -
          initial * sign,
      };
    });
  return { status: "available", scope, captures };
}
const unchanged = (piece: TrackedPiece, frame: PositionFrame) =>
  frame.pieces.some(
    (p) =>
      p.id === piece.id && p.square === piece.square && p.type === piece.type,
  );

/** Comparer des relations entre les mêmes pièces restées sur les mêmes cases.
 * Une cible déplacée ou un nouvel attaquant relève d'un autre changement. */
export function relationChanges(
  context: Pick<DecisionContext, "before" | "after">,
): RelationChanges {
  const { before, after } = context;
  const old = {
    w: captureRelations(before, "w"),
    b: captureRelations(before, "b"),
  };
  const next = {
    w: captureRelations(after, "w"),
    b: captureRelations(after, "b"),
  };
  const defences: DefenceChange[] = [];
  for (const side of ["w", "b"] as const) {
    if (old[side].status !== "available" || next[side].status !== "available")
      continue;
    for (const capture of old[side].captures) {
      if (
        ![capture.attackerId, capture.victimId].every((id) =>
          unchanged(before.pieces.find((p) => p.id === id)!, after),
        )
      )
        continue;
      const current = next[side].captures.find(
        (c) =>
          c.move === capture.move &&
          c.victimId === capture.victimId &&
          c.attackerId === capture.attackerId,
      );
      if (!current) continue;
      // Les quatre promotions possibles d'un pion sont quatre reprises,
      // mais toujours un seul défenseur.
      const previousIds = [
        ...new Set(capture.recaptures.map((r) => r.defenderId)),
      ];
      const currentIds = [
        ...new Set(current.recaptures.map((r) => r.defenderId)),
      ];
      const removed = previousIds
        .filter((id) => !currentIds.includes(id))
        .map((defenderId) => {
          const previous = before.pieces.find((p) => p.id === defenderId)!;
          const remaining = after.pieces.find((p) => p.id === defenderId);
          return {
            defenderId,
            reason: !remaining
              ? ("captured" as const)
              : remaining.square !== previous.square
                ? ("moved" as const)
                : ("constrained" as const),
          };
        });
      const added = currentIds.filter((id) => !previousIds.includes(id));
      if (removed.length || added.length)
        defences.push({
          attackerId: capture.attackerId,
          victimId: capture.victimId,
          before: capture,
          after: current,
          beforeScope: old[side].scope,
          afterScope: next[side].scope,
          removed,
          added,
        });
    }
  }
  const openedLines: OpenedLine[] = [];
  for (const source of before.pieces.filter(
    (p) => "brq".includes(p.type) && unchanged(p, after),
  )) {
    for (const target of before.pieces.filter(
      (p) => p.id !== source.id && unchanged(p, after),
    )) {
      const path = sliderRay(source.type, source.square, target.square).slice(
        0,
        -1,
      );
      if (
        !path.length ||
        path.some((square) => after.pieces.some((p) => p.square === square))
      )
        continue;
      const blockers = before.pieces.filter((p) => path.includes(p.square));
      if (!blockers.length) continue;
      const relations = next[source.color];
      openedLines.push({
        sourceId: source.id,
        targetId: target.id,
        from: source.square,
        to: target.square,
        role: source.color === target.color ? "defence" : "attack",
        path,
        vacated: blockers.map((p) => ({
          pieceId: p.id,
          square: p.square,
          destination: after.pieces.find((n) => n.id === p.id)?.square ?? null,
        })),
        capture:
          target.color === source.color || target.type === "k"
            ? null
            : {
                scope: relations.scope,
                status:
                  relations.status === "unavailable"
                    ? "unavailable"
                    : relations.captures.some(
                          (c) =>
                            c.attackerId === source.id &&
                            c.victimId === target.id,
                        )
                      ? "legal"
                      : "illegal",
              },
      });
    }
  }
  return { before: old, after: next, defences, openedLines };
}
