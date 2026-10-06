import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { gamePositions, legalVariation, type ReviewResult } from "./model";
import { StudyTree } from "./StudyTree";
import { playStudySuggestion, studySuggestion } from "./studySuggestion";

function result(board: Chess, bestMove: string): ReviewResult {
  return { score: null, depth: 12, bestMove, bestSan: null,
    variation: legalVariation(board.fen(), [bestMove]) };
}

it("propose la réponse au coup exploré et la joue sans modifier le PGN ni remplacer les branches", () => {
  const original = new Chess(); original.move("f3");
  const pgn = original.pgn(), root = gamePositions(pgn)[0];
  const tree = new StudyTree(root), node = tree.play(0, "f2", "f3");
  const board = tree.board(node), suggestion = result(board, "e7e5");
  expect(studySuggestion(board, suggestion)?.san).toBe("e5");
  expect(studySuggestion(board, result(new Chess(), "e2e4"))).toBeNull();
  const alternative = tree.play(node, "d7", "d5");
  const next = playStudySuggestion(tree, node, suggestion)!;
  expect(tree.board(next).history()).toEqual(["f3", "e5"]);
  expect(tree.nodes[node].children).toEqual([alternative, next]);
  expect(playStudySuggestion(tree, node, suggestion)).toBe(next);
  expect(playStudySuggestion(tree, next, suggestion)).toBeNull();
  expect(original.pgn()).toBe(pgn);
  expect(tree.root).toEqual(root);
});

it.each(["q", "r", "b", "n"])("joue directement la promotion conseillée : %s", promotion => {
  const board = new Chess("7k/P7/8/8/8/8/7P/7K w - - 0 1");
  const tree = new StudyTree(gamePositions(board.pgn())[0]);
  const next = playStudySuggestion(tree, 0, result(board, `a7a8${promotion}`))!;
  expect(tree.board(next).get("a8")).toEqual({ type: promotion, color: "w" });
  expect(tree.nodes[next].uci).toBe(`a7a8${promotion}`);
});

it("conserve l’historique pour une réponse en passant", () => {
  const board = new Chess(); for (const san of ["e4", "a6", "e5", "d5"]) board.move(san);
  const tree = new StudyTree(gamePositions(board.pgn())[4]);
  const next = playStudySuggestion(tree, 0, result(board, "e5d6"))!;
  expect(tree.board(next).get("d5")).toBeUndefined();
  expect(tree.board(next).get("d6")).toEqual({ type: "p", color: "w" });
  expect(tree.command(next)).toBe("position startpos moves e2e4 a7a6 e4e5 d7d5 e5d6");
});

it("n’invente aucun conseil absent, illégal ou dans une position terminée", () => {
  const board = new Chess(), tree = new StudyTree(gamePositions(board.pgn())[0]);
  expect(playStudySuggestion(tree, 0, null)).toBeNull();
  expect(playStudySuggestion(tree, 0, result(board, "e2e5"))).toBeNull();
  expect(tree.nodes).toHaveLength(1);
  for (const san of ["f3", "e5", "g4", "Qh4#"]) board.move(san);
  expect(studySuggestion(board, result(board, "e1f2"))).toBeNull();
});
