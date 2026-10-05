import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";
import { boardFromCommand } from "../StudyTree";
import type { ReviewPosition, ReviewResult } from "../model";

export type TrackedPiece = {
  id: string;
  color: Color;
  type: PieceSymbol;
  square: Square;
};
export type PositionFrame = {
  fen: string;
  command: string;
  turn: Color;
  terminal: boolean;
  pieces: TrackedPiece[];
};
export type DecisionContext = {
  frames: PositionFrame[];
  moves: Move[];
  decision: number;
  before: PositionFrame;
  after: PositionFrame;
  priorHistory: "complete" | "unknown";
};
export const uci = (move: Move) => move.from + move.to + (move.promotion ?? "");
export const opposite = (color: Color): Color => (color === "w" ? "b" : "w");
export function capturedSquare(move: Move): Square | null {
  return !move.captured
    ? null
    : move.isEnPassant()
      ? (`${move.to[0]}${move.from[1]}` as Square)
      : move.to;
}

/** L'identité survit aux déplacements, au roque et à la promotion. Elle évite
 * d'attribuer une menace à une autre pièce ayant rejoint la même case. */
export function decisionContext(
  source: ReviewPosition,
  result: ReviewResult | null = null,
): DecisionContext {
  if (!/^position (startpos|fen )/.test(source.command))
    throw new Error("Commande de position inconnue.");
  const original = boardFromCommand(source.command);
  if (original.fen() !== source.fen || original.turn() !== source.turn)
    throw new Error("Position et historique incohérents.");
  if (original.isGameOver()) throw new Error("Position déjà terminale.");
  const played = original
    .moves({ verbose: true })
    .find((move) => uci(move) === source.played);
  if (!played) throw new Error("Décision illégale ou absente.");
  const history = original.history({ verbose: true });
  const startCommand = source.command.split(" moves ")[0];
  const board = new Chess(history[0]?.before ?? original.fen());
  const identities = new Map<Square, string>(
    board
      .board()
      .flat()
      .filter((piece) => piece !== null)
      .map((piece) => [
        piece.square,
        `${piece.color}:${piece.type}:${piece.square}`,
      ]),
  );
  let command = startCommand;
  const frame = (): PositionFrame => ({
    fen: board.fen(),
    command,
    turn: board.turn(),
    terminal: board.isGameOver(),
    pieces: board
      .board()
      .flat()
      .filter((piece) => piece !== null)
      .map((piece) => ({ ...piece, id: identities.get(piece.square)! })),
  });
  const frames = [frame()],
    moves: Move[] = [];
  const push = (input: Move | string) => {
    const move = board.move(input);
    const identity = identities.get(move.from)!;
    const taken = capturedSquare(move);
    if (taken) identities.delete(taken);
    identities.delete(move.from);
    identities.set(move.to, identity);
    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const from =
        `${move.isKingsideCastle() ? "h" : "a"}${move.from[1]}` as Square;
      const to =
        `${move.isKingsideCastle() ? "f" : "d"}${move.from[1]}` as Square;
      identities.set(to, identities.get(from)!);
      identities.delete(from);
    }
    command += `${command.includes(" moves ") ? " " : " moves "}${uci(move)}`;
    moves.push(move);
    frames.push(frame());
  };
  history.forEach(push);
  const decision = moves.length;
  push(played);
  if (result) {
    const first = result.variation[0];
    if (result.variation.length > 128 || (!first && result.bestMove))
      throw new Error("Variante de réponse absente ou trop longue.");
    if (!first && !board.isGameOver())
      throw new Error("Variante de réponse absente.");
    for (const [index, item] of result.variation.entries()) {
      if (board.isGameOver())
        throw new Error("La variante continue après la fin de partie.");
      const move = board
        .moves({ verbose: true })
        .find(
          (move) =>
            move.from === item.from &&
            move.to === item.to &&
            move.after === item.fen,
        );
      if (!move || (index === 0 && uci(move) !== result.bestMove))
        throw new Error("Variante de réponse incohérente.");
      push(move);
    }
  }
  return {
    frames,
    moves,
    decision,
    before: frames[decision],
    after: frames[decision + 1],
    priorHistory: startCommand === "position startpos" ? "complete" : "unknown",
  };
}
