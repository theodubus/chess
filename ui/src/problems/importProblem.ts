import { Chess, type Square } from "chess.js";
import { MAX_PGN_BYTES, readPgn } from "../importPgn";
import type { ReviewPosition } from "../review/model";

export type ProblemPoint = "initial" | "final";
export type ChessProblem = {
  title: string;
  source: string;
  position: ReviewPosition;
};

export function isFenSource(text: string) {
  return text.replace(/^\uFEFF/, "").trim().split(/\s+/)[0]?.includes("/") ?? false;
}

/** Rejeter les états que chess.js peut lire mais qu'un moteur ne doit pas recevoir. */
function validatePosition(board: Chess, fen = board.fen()) {
  const king = board.board().flat().find(p => p?.type === "k" && p.color !== board.turn());
  if (king && board.isAttacked(king.square, board.turn()))
    throw new Error("Position FEN incohérente : le roi du camp qui n’a pas le trait est en échec.");
  const fields = fen.trim().split(/\s+/), rights = fields[2];
  for (const [right, color, rook] of [
    ["K", "w", "h1"], ["Q", "w", "a1"],
    ["k", "b", "h8"], ["q", "b", "a8"],
  ] as const) {
    if (!rights.includes(right)) continue;
    const king = board.get(color === "w" ? "e1" : "e8"), piece = board.get(rook);
    if (king?.type !== "k" || king.color !== color || piece?.type !== "r" || piece.color !== color)
      throw new Error("Position FEN incohérente : un droit de roque ne correspond pas aux pièces présentes.");
  }
  const ep = fields[3];
  if (ep !== "-") {
    const pawn = board.get(`${ep[0]}${Number(ep[1]) + (board.turn() === "w" ? -1 : 1)}` as Square);
    if (board.get(ep as Square) || pawn?.type !== "p" || pawn.color === board.turn()
      || board.get(`${ep[0]}${board.turn() === "w" ? 7 : 2}` as Square) || Number(fields[4]) !== 0)
      throw new Error("Position FEN incohérente : la prise en passant ne correspond pas au dernier déplacement d’un pion.");
  }
}

/** Une FEN ou une seule ligne principale PGN ; aucune solution importée n'est envoyée au moteur. */
export function importProblem(text: string, point: ProblemPoint = "initial"): ChessProblem {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) throw new Error("Collez une FEN ou un PGN, ou choisissez un fichier.");
  if (new TextEncoder().encode(source).length > MAX_PGN_BYTES)
    throw new Error("Le problème est trop volumineux (maximum 1 Mo).");
  let board: Chess, command: string, title = "Problème d’échecs", origin: string;
  if (isFenSource(source)) {
    if (source.split(/\s+/).length !== 6)
      throw new Error("FEN invalide : la position doit contenir ses six champs.");
    try { board = new Chess(source.replace(/\s+/g, " ")); }
    catch { throw new Error("FEN invalide : vérifiez les pièces, le trait et les autres champs."); }
    validatePosition(board, source);
    command = `position fen ${board.fen()}`;
    origin = "Position FEN";
  } else {
    const game = readPgn(source, { allowEmpty: true });
    const fen = game.getHeaders().FEN;
    if (!fen && !game.history().length)
      throw new Error("Ce PGN ne contient ni position FEN ni coups.");
    const initial = new Chess(fen);
    validatePosition(initial, fen);
    board = point === "initial" ? initial : game;
    const moves = point === "final" ? game.history({ verbose: true }).map(m => m.lan) : [];
    command = `position ${fen ? `fen ${initial.fen()}` : "startpos"}${moves.length ? ` moves ${moves.join(" ")}` : ""}`;
    const event = game.getHeaders().Event;
    if (event && event !== "?") title = event;
    origin = point === "initial" ? "Position initiale du PGN" : "Dernière position du PGN";
  }
  validatePosition(board);
  return {
    title: title.slice(0, 160), source: origin,
    position: {
      fen: board.fen(), command, turn: board.turn(), label: "Position du problème",
      played: null, playedSan: null,
      terminal: board.isCheckmate()
        ? { kind: "mate", value: 0, winner: board.turn() === "w" ? "b" : "w" }
        : board.isDraw() ? { kind: "cp", value: 0 } : null,
    },
  };
}
