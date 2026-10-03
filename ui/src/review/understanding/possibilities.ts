import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";
import { materialBalance } from "../../material";
import {
  capturedSquare,
  opposite,
  uci,
  type PositionFrame,
  type TrackedPiece,
} from "./context";

export type CaptureWitness = {
  move: Move;
  recaptures: Move[];
  /** Bilan matériel depuis le départ du déplacement, avec la meilleure reprise
   * immédiate disponible. Aucune promesse sur les réponses plus lointaines. */
  balanceAfterImmediateRecapture: number;
};
export type MoveOption = { move: Move; captures: CaptureWitness[] };
export type PieceOptions = {
  piece: TrackedPiece;
  geometricAttackers: Square[];
  legalCapturers: { move: Move; attackerId: string }[] | null;
  moves: MoveOption[];
};
export type Possibilities = {
  status: "available" | "unavailable";
  reason?: "terminal" | "opponent-in-check";
  scope: "actual-turn" | "geometric-turn-probe";
  pieces: PieceOptions[];
};
export type ClosedRoute = {
  pieceId: string;
  from: Square;
  to: Square;
  blockerId: string;
  blocker: Square;
};
export type PossibilityChange = {
  pieceId: string;
  from: Square;
  to: Square;
  newAttackers: string[];
  removedAttackers: string[];
  removedDestinations: Square[];
  addedDestinations: Square[];
  closedRoutes: ClosedRoute[];
};

export function boardFor(frame: PositionFrame, side: Color) {
  const board = new Chess(frame.fen);
  if (board.turn() === side) return board;
  // Donner le trait à l'autre camp pendant un échec autoriserait des positions
  // impossibles. Une absence de faits dans ce cas n'est pas une absence de menace.
  if (board.isCheck()) return null;
  const fields = frame.fen.split(" ");
  fields[1] = side;
  fields[3] = "-";
  return new Chess(fields.join(" "));
}
function captureWitnesses(move: Move, balance: number): CaptureWitness[] {
  const board = new Chess(move.after),
    sign = move.color === "w" ? 1 : -1;
  return board
    .moves({ verbose: true })
    .filter((reply) => capturedSquare(reply) === move.to)
    .map((reply) => {
      const next = new Chess(reply.after);
      const recaptures = next
        .moves({ verbose: true })
        .filter((recapture) => capturedSquare(recapture) === reply.to);
      const balances = [
        materialBalance(next) * sign,
        ...recaptures.map(
          (recapture) => materialBalance(new Chess(recapture.after)) * sign,
        ),
      ];
      return {
        move: reply,
        recaptures,
        balanceAfterImmediateRecapture: Math.max(...balances) - balance * sign,
      };
    });
}
/** Inventaire de possibilités, pas évaluation stratégique. « Capturable » ne
 * signifie ni « mauvais coup » ni « pièce perdue ». Les réponses restent lisibles. */
export function possibilities(
  frame: PositionFrame,
  side: Color,
  pieceId?: string,
): Possibilities {
  const scope = frame.turn === side ? "actual-turn" : "geometric-turn-probe";
  if (frame.terminal)
    return { status: "unavailable", reason: "terminal", scope, pieces: [] };
  const board = boardFor(frame, side);
  if (!board)
    return {
      status: "unavailable",
      reason: "opponent-in-check",
      scope,
      pieces: [],
    };
  const moves = board.moves({ verbose: true }),
    enemy = boardFor(frame, opposite(side));
  const captures = enemy
    ?.moves({ verbose: true })
    .filter((move) => move.captured);
  const balance = materialBalance(board);
  return {
    status: "available",
    scope,
    pieces: frame.pieces
      .filter(
        (piece) => piece.color === side && (!pieceId || piece.id === pieceId),
      )
      .map((piece) => ({
        piece,
        geometricAttackers: board.attackers(piece.square, opposite(side)),
        legalCapturers:
          captures
            ?.filter((move) => capturedSquare(move) === piece.square)
            .map((move) => ({
              move,
              attackerId: frame.pieces.find(
                (piece) => piece.square === move.from,
              )!.id,
            })) ?? null,
        moves: moves
          .filter((move) => move.from === piece.square)
          .map((move) => ({ move, captures: captureWitnesses(move, balance) })),
      })),
  };
}
export function sliderRay(
  type: PieceSymbol,
  from: Square,
  to: Square,
): Square[] {
  const dx = to.charCodeAt(0) - from.charCodeAt(0),
    dy = Number(to[1]) - Number(from[1]);
  const straight = dx === 0 || dy === 0,
    diagonal = Math.abs(dx) === Math.abs(dy);
  if (
    !(
      (type === "q" && (straight || diagonal)) ||
      (type === "r" && straight) ||
      (type === "b" && diagonal)
    )
  )
    return [];
  return Array.from(
    { length: Math.max(Math.abs(dx), Math.abs(dy)) },
    (_, i) =>
      `${String.fromCharCode(from.charCodeAt(0) + Math.sign(dx) * (i + 1))}${Number(from[1]) + Math.sign(dy) * (i + 1)}` as Square,
  );
}
export function changedPossibilities(
  before: Possibilities,
  after: Possibilities,
  afterFrame: PositionFrame,
): PossibilityChange[] {
  if (before.status !== "available" || after.status !== "available") return [];
  const changes: PossibilityChange[] = [];
  for (const previous of before.pieces) {
    const current = after.pieces.find(
      (piece) => piece.piece.id === previous.piece.id,
    );
    if (!current) continue;
    const removed = previous.moves.filter(
      (option) =>
        !current.moves.some((next) => uci(next.move) === uci(option.move)),
    );
    const added = current.moves.filter(
      (option) =>
        !previous.moves.some((old) => uci(old.move) === uci(option.move)),
    );
    const oldAttackers = previous.legalCapturers?.map(
      (capture) => capture.attackerId,
    );
    const newAttackers = current.legalCapturers?.map(
      (capture) => capture.attackerId,
    );
    const closedRoutes: ClosedRoute[] = [];
    if (previous.piece.square === current.piece.square)
      for (const option of removed) {
        const squares = sliderRay(
          current.piece.type,
          current.piece.square,
          option.move.to,
        );
        const first = squares
          .map((square) =>
            afterFrame.pieces.find((piece) => piece.square === square),
          )
          .find((piece) => piece);
        if (first && first.color === current.piece.color)
          closedRoutes.push({
            pieceId: current.piece.id,
            from: current.piece.square,
            to: option.move.to,
            blockerId: first.id,
            blocker: first.square,
          });
      }
    changes.push({
      pieceId: current.piece.id,
      from: previous.piece.square,
      to: current.piece.square,
      newAttackers:
        oldAttackers && newAttackers
          ? newAttackers.filter((id) => !oldAttackers.includes(id))
          : [],
      removedAttackers:
        oldAttackers && newAttackers
          ? oldAttackers.filter((id) => !newAttackers.includes(id))
          : [],
      removedDestinations: removed.map((option) => option.move.to),
      addedDestinations: added.map((option) => option.move.to),
      closedRoutes,
    });
  }
  return changes;
}
