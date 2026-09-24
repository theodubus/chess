import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { capturedMaterial } from "./material";
import CapturedPieces from "./CapturedPieces";
import { StudyTree } from "./review/StudyTree";
import { gamePositions } from "./review/model";

it("compte les prises par joueur et ne montre le delta que pour le camp en avance", () => {
  const board = new Chess();
  for (const move of ["e4", "d5", "exd5"]) board.move(move);
  let captures = capturedMaterial(board.history({ verbose: true }));
  expect(captures.w).toEqual({ pieces: ["p"], points: 1 });
  expect(
    renderToStaticMarkup(<CapturedPieces captures={captures} side="w" />),
  ).toContain(">+1</strong>");
  expect(
    renderToStaticMarkup(<CapturedPieces captures={captures} side="b" />),
  ).not.toContain("capture-advantage");
  board.move("Qxd5");
  captures = capturedMaterial(board.history({ verbose: true }));
  expect(captures.b).toEqual({ pieces: ["p"], points: 1 });
  expect(
    renderToStaticMarkup(<CapturedPieces captures={captures} side="w" />),
  ).not.toContain("capture-advantage");
  expect(
    capturedMaterial(board.history({ verbose: true }).slice(0, 2)).w.pieces,
  ).toEqual([]);
});
it("utilise les valeurs classiques et regroupe les pièces par type", () => {
  const captures = capturedMaterial([
    { color: "w", captured: "q" },
    { color: "w", captured: "p" },
    { color: "w", captured: "r" },
    { color: "w", captured: "b" },
    { color: "w", captured: "n" },
    { color: "b", captured: "r" },
  ]);
  expect(captures.w).toEqual({ pieces: ["p", "n", "b", "r", "q"], points: 21 });
  const html = renderToStaticMarkup(
    <CapturedPieces captures={captures} side="w" />,
  );
  expect(html).toContain(">+16</strong>");
  expect(html.match(/<img /g)).toHaveLength(5);
  expect(html).not.toContain('src="undefined"');
});
it("gère la prise en passant, les promotions et les FEN sans inventer de prises", () => {
  const board = new Chess();
  for (const move of ["e4", "a6", "e5", "d5", "exd6"]) board.move(move);
  expect(board.history({ verbose: true }).at(-1)?.isEnPassant()).toBe(true);
  expect(capturedMaterial(board.history({ verbose: true })).w.points).toBe(1);
  const promotion = new Chess("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  expect(capturedMaterial(promotion.history({ verbose: true })).w.points).toBe(
    0,
  );
  promotion.move("axb8=Q+");
  expect(capturedMaterial(promotion.history({ verbose: true })).w).toEqual({
    pieces: ["r"],
    points: 5,
  });
});
it("suit les prises de la variante sans les confondre avec la partie", () => {
  const board = new Chess();
  for (const move of ["e4", "d5", "exd5"]) board.move(move);
  const tree = new StudyTree(gamePositions(board.pgn())[2]);
  const capture = tree.play(0, "e4", "d5");
  const quiet = tree.play(0, "e4", "e5");
  expect(
    capturedMaterial(tree.board(capture).history({ verbose: true })).w.points,
  ).toBe(1);
  expect(
    capturedMaterial(tree.board(quiet).history({ verbose: true })).w.points,
  ).toBe(0);
  expect(capturedMaterial(board.history({ verbose: true })).w.points).toBe(1);
});
