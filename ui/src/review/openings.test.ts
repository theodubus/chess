import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { gamePositions } from "./model";
import { isBookMove } from "./openings";
import { moveFacts, withMoveFacts } from "./annotations";
import { GameReview } from "./GameReview";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import AnnotationBadge from "./AnnotationBadge";

function positions(moves: string[], fen?: string) {
  const board = new Chess(fen);
  for (const move of moves) board.move(move);
  return gamePositions(board.pgn());
}

it("reconnaît les coups répertoriés, sans qualifier automatiquement tous les premiers coups de théoriques", () => {
  const game = positions(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  for (const position of game.slice(0, -1))
    expect(isBookMove(position)).toBe(true);
  expect(isBookMove(game.at(-1)!)).toBe(false);
  const unusual = positions(["e4", "a5", "Ke2"]);
  expect(isBookMove(unusual[2])).toBe(false);
  const late = { ...game[0], fen: game[0].fen.replace("0 1", "0 21") };
  expect(isBookMove(late)).toBe(false);
});

it("reconnaît les transpositions, mais conserve les droits de roque dans la clé", () => {
  const a = positions(["Nf3", "d5", "d4", "Nf6"]);
  const b = positions(["d4", "d5", "Nf3", "Nf6"]);
  expect(isBookMove(a[3])).toBe(true);
  expect(isBookMove(b[3])).toBe(true);
  expect(isBookMove({ ...a[3], fen: a[3].fen.replace("KQkq", "-") })).toBe(
    false,
  );
});

it("distingue un seul coup légal d’un coup seulement préféré par le moteur", () => {
  const [forced] = positions(["Kxb2"], "7k/8/8/8/8/8/1r6/K7 w - - 0 1");
  expect(new Chess(forced.fen).moves()).toEqual(["Kxb2"]);
  const fact = moveFacts(forced);
  expect(fact?.category).toBe("forced");
  expect(
    withMoveFacts({ category: "best", loss: 0, reason: "" }, fact)?.category,
  ).toBe("forced");
  const opening = positions(["e4"])[0];
  expect(moveFacts(opening)?.category).toBe("book");
  const promotion = positions(["a8=Q+"], "7k/P7/8/8/8/8/8/7K w - - 0 1")[0];
  expect(moveFacts(promotion)?.category).not.toBe("forced");
});

it("ne cache pas une gaffe ou un coup remarquable derrière la théorie", () => {
  const fact = moveFacts(positions(["e4"])[0]);
  expect(withMoveFacts(null, fact)?.category).toBe("book");
  expect(
    withMoveFacts({ category: "excellent", loss: 0, reason: "" }, fact)
      ?.category,
  ).toBe("book");
  for (const category of [
    "inaccuracy",
    "mistake",
    "blunder",
    "great",
    "brilliant",
    "miss",
  ] as const) {
    expect(
      withMoveFacts({ category, loss: 0.2, reason: "" }, fact)?.category,
    ).toBe(category);
  }
});

it("affiche les faits sans moteur et utilise des pictogrammes vectoriels monochromes", () => {
  const board = new Chess();
  board.move("e4");
  const review = new GameReview(board.pgn());
  expect(review.annotations[0]?.category).toBe("book");
  for (const category of ["excellent", "forced", "book"] as const) {
    const html = renderToStaticMarkup(
      createElement(AnnotationBadge, {
        annotation: { category, loss: null, reason: "" },
        provisional: true,
      }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("currentColor");
    expect(html).not.toContain("👍");
    if (category !== "excellent") expect(html).not.toContain("provisoire");
  }
});
