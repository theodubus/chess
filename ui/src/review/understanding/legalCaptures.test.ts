import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { capturedSquare, decisionContext } from "./context";
import { corpus, corpusInput } from "./corpus";
import { externalCorpus } from "./externalCorpus";
import { legalCapturesOf } from "./legalCaptures";
import { boardFor } from "./possibilities";

for (const test of [...corpus, ...externalCorpus]) {
  it(`les captures ciblées gardent les faits et leur ordre : ${test.id}`, () => {
    const { position, result } = corpusInput(test), context = decisionContext(position, result);
    for (const frame of [context.before, context.after]) {
      for (const side of ["w", "b"] as const) {
        const board = boardFor(frame, side);
        if (!board) continue;
        const all = board.moves({ verbose: true }), original = board.fen();
        for (const piece of frame.pieces.filter((p) => p.color !== side)) {
          // L'oracle garde la génération exhaustive indépendante de l'aide
          // optimisée. Égalité des Move, dont ordre et quatre promotions.
          expect(legalCapturesOf(board, piece.square)).toEqual(all.filter((m) => capturedSquare(m) === piece.square));
          expect(board.fen()).toBe(original);
        }
      }
    }
  });
}
it("l'en passant cible la victime et filtre le candidat qui expose son roi", () => {
  const board = new Chess("3R4/8/8/8/3pPp2/8/8/3k3K b - e3 0 1");
  expect(legalCapturesOf(board, "e4").map((m) => m.lan)).toEqual(["f4e3"]);
  expect(legalCapturesOf(board, "e3")).toEqual([]);
});
it("conserve les quatre captures par promotion", () => {
  const board = new Chess("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  expect(legalCapturesOf(board, "b8").map((m) => m.lan)).toEqual(["a7b8n", "a7b8b", "a7b8r", "a7b8q"]);
});
it("une attaque géométrique clouée ne devient pas une capture légale", () => {
  const board = new Chess("4k3/8/8/4n3/2B5/8/8/4R2K b - - 0 1");
  expect(board.attackers("c4", "b")).toContain("e5");
  expect(legalCapturesOf(board, "c4")).toEqual([]);
});
