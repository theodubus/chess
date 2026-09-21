import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { annotationPlacement } from "./annotationPlacement";

it("utilise les cases réelles dans les deux orientations et garde les badges dans le plateau", () => {
  const board = new Chess();
  for (const orientation of ["white", "black"] as const) {
    for (const file of "abcdefgh")
      for (let rank = 1; rank <= 8; rank++) {
        const square = `${file}${rank}`;
        const result = annotationPlacement(board.fen(), square, orientation);
        expect(result).toEqual(
          annotationPlacement(board.fen(), square, orientation),
        );
        if (result.row === 0) expect(result.corner).toMatch(/^bottom/);
        if (result.row === 7) expect(result.corner).toMatch(/^top/);
        if (result.column === 0) expect(result.corner).toMatch(/right$/);
        if (result.column === 7) expect(result.corner).toMatch(/left$/);
      }
  }
  expect(annotationPlacement(board.fen(), "h4", "white")).toMatchObject({
    column: 7,
    row: 4,
  });
  expect(annotationPlacement(board.fen(), "h4", "black")).toMatchObject({
    column: 0,
    row: 3,
  });
});

it("privilégie un coin supérieur quand il est libre et change seulement de coin en présence d’obstacles", () => {
  const board = new Chess();
  board.move("e4");
  expect(annotationPlacement(board.fen(), "e4", "white").corner).toBe(
    "top-right",
  );
  board.move("f5");
  expect(annotationPlacement(board.fen(), "e4", "white").corner).toBe(
    "top-left",
  );
});
