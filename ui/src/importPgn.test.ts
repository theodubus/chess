import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { importPgn, MAX_PGN_BYTES } from "./importPgn";
import { gamePositions } from "./review/model";

it("importe la ligne principale avec commentaires et variantes sans exiger une partie terminée", () => {
  const pgn = importPgn(
    '\uFEFF[White "Alice"]\n[Black "Bob"]\n\n1. e4 {bonjour} e5 (1... c5) 2. Nf3 $1 Nc6 *',
  );
  const game = new Chess();
  game.loadPgn(pgn);
  expect(game.history()).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  expect(game.getHeaders().White).toBe("Alice");
  expect(gamePositions(pgn)).toHaveLength(5);
});

it("préserve une position initiale FEN et le camp au trait", () => {
  const initial = new Chess();
  initial.move("e4");
  const game = new Chess(initial.fen());
  game.move("c5");
  const positions = gamePositions(importPgn(game.pgn()));
  expect(positions[0].fen).toBe(initial.fen());
  expect(positions[0].turn).toBe("b");
  expect(positions[1].fen).toBe(game.fen());
});

it("refuse texte vide, coups illégaux, variantes non standard et plusieurs parties", () => {
  for (const source of [
    "",
    "du texte",
    "1. e5 *",
    '[Event "Vide"]\n*',
    '[Variant "Crazyhouse"]\n\n1. e4 *',
    "1. e4 1-0\n\n1. d4 0-1",
  ])
    expect(() => importPgn(source)).toThrow();
  expect(() => importPgn("x".repeat(MAX_PGN_BYTES + 1))).toThrow("volumineux");
});

it("refuse une FEN structurellement lisible mais avec le roi adverse déjà en échec", () => {
  const game = new Chess("7k/7R/8/8/8/8/8/K7 w - - 0 1");
  expect(game.isAttacked("h8", "w")).toBe(true);
  game.move({ from: "h7", to: "a7" });
  expect(() => importPgn(game.pgn())).toThrow("FEN incohérente");
});
