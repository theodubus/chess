import { Chess, type Move, type Square } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import type { ReviewResult } from "../model";
import {
  capturedSquare,
  decisionContext,
  uci,
  type PositionFrame,
} from "./context";

export type WitnessLine = { frames: PositionFrame[]; moves: Move[] };
/** Rejouer le témoin avec les identités et l'historique connus. La borne porte
 * sur la continuation, pas sur le passé nécessaire aux règles de nulle. */
export function witnessLine(
  frame: PositionFrame,
  variation: ReviewResult["variation"],
  maxPlies = 8,
): WitnessLine {
  if (!Number.isInteger(maxPlies) || maxPlies < 1 || maxPlies > 8)
    throw new Error("Témoin limité à huit demi-coups.");
  const board = boardFromCommand(frame.command);
  if (board.fen() !== frame.fen)
    throw new Error("Témoin d'une autre position.");
  const moves: Move[] = [],
    items: ReviewResult["variation"] = [];
  for (const item of variation.slice(0, maxPlies)) {
    if (board.isGameOver()) break;
    const move = board
      .moves({ verbose: true })
      .find(
        (m) => m.from === item.from && m.to === item.to && m.after === item.fen,
      );
    if (!move) throw new Error("Variante de défense incohérente.");
    board.move(move);
    moves.push(move);
    items.push(item);
  }
  if (!moves.length) return { frames: [frame], moves: [] };
  const context = decisionContext(
    {
      command: frame.command,
      fen: frame.fen,
      turn: frame.turn,
      label: "Témoin",
      played: uci(moves[0]),
      playedSan: moves[0].san,
      terminal: null,
    },
    moves.length > 1
      ? {
          score: null,
          depth: null,
          bestMove: uci(moves[1]),
          bestSan: null,
          variation: items.slice(1),
        }
      : null,
  );
  return {
    frames: context.frames.slice(context.decision),
    moves: context.moves.slice(context.decision),
  };
}

export type CaptureReply = {
  capturePly: number;
  capture: string;
  capturerId: string;
  square: Square;
  command: string;
  available: string[];
  state:
    | "unavailable"
    | "recaptured"
    | "not-chosen"
    | "pending"
    | "unavailable-after-check";
  /** Indice du coup qui règle la réponse, ou de la dernière réponse à un échec
   * quand la reprise n'est plus disponible. Null : le témoin ne le montre pas. */
  resolvedAt: number | null;
  choice: {
    ply: number;
    command: string;
    move: string;
    available: string[];
    inCheck: boolean;
  } | null;
  intermediateChecks: { ply: number; move: string }[];
};
const recaptures = (frame: PositionFrame, square: Square) =>
  frame.terminal
    ? []
    : boardFromCommand(frame.command)
        .moves({ verbose: true })
        .filter((move) => capturedSquare(move) === square)
        .map(uci);

/** La réponse est observée, jamais évaluée. Un échec intermédiaire diffère la
 * décision de reprendre ; une autre réponse calme la clôt seulement dans cette PV. */
export function captureReplies(line: WitnessLine): CaptureReply[] {
  return line.moves.flatMap((capture, ply) => {
    if (!capture.captured) return [];
    const capturerId = line.frames[ply].pieces.find(
      (p) => p.square === capture.from,
    )!.id;
    const available = recaptures(line.frames[ply + 1], capture.to);
    const reply: CaptureReply = {
      capturePly: ply,
      capture: uci(capture),
      capturerId,
      square: capture.to,
      command: line.frames[ply + 1].command,
      available,
      state: available.length ? "pending" : "unavailable",
      resolvedAt: available.length ? null : ply,
      choice: null,
      intermediateChecks: [],
    };
    if (!available.length) return [reply];
    for (let cursor = ply + 1; cursor < line.frames.length; cursor++) {
      const frame = line.frames[cursor];
      if (frame.turn === capture.color) continue;
      const piece = frame.pieces.find((p) => p.id === capturerId);
      const options =
        piece?.square === capture.to ? recaptures(frame, capture.to) : [];
      if (!options.length) {
        reply.state = "unavailable-after-check";
        reply.resolvedAt = cursor - 1;
        break;
      }
      const move = line.moves[cursor];
      if (!move) break;
      const taken = frame.pieces.find((p) => p.square === capturedSquare(move));
      if (taken?.id !== capturerId && new Chess(move.after).isCheck()) {
        reply.intermediateChecks.push({ ply: cursor, move: uci(move) });
        continue;
      }
      reply.choice = {
        ply: cursor,
        command: frame.command,
        move: uci(move),
        available: options,
        inCheck: new Chess(frame.fen).isCheck(),
      };
      reply.state = taken?.id === capturerId ? "recaptured" : "not-chosen";
      reply.resolvedAt = cursor;
      break;
    }
    return [reply];
  });
}
