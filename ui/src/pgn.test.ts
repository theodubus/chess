import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import { GameController } from "./GameController";
import { downloadPgn } from "./pgn";
import { GameReview } from "./review/GameReview";
import { StudyTree } from "./review/StudyTree";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function downloads() {
  vi.useFakeTimers();
  const files: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((file) => {
    files.push(file as Blob);
    return "blob:partie";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("document", {
    createElement: () => ({ click() {}, remove() {} }),
    body: { appendChild() {} },
  });
  return files;
}

it("exporte les coups actuels du contrôleur, y compris ceux joués depuis le précédent export", async () => {
  const files = downloads();
  const controller = new GameController({ now: () => 0 });
  controller.move("g1", "f3");
  downloadPgn(controller);
  controller.move("g8", "f6");
  downloadPgn(controller);
  const histories = [];
  for (const file of files) {
    const board = new Chess();
    board.loadPgn(await file.text());
    histories.push(board.history());
  }
  expect(histories).toEqual([["Nf3"], ["Nf3", "Nf6"]]);
});

it("exporte la partie analysée entière avec sa FEN et ses commentaires, sans la branche explorée", async () => {
  const files = downloads();
  const game = new Chess();
  game.move("e4");
  game.move("e5");
  const initial = game.fen();
  const board = new Chess(initial);
  for (const san of ["Nf3", "Nc6", "Bb5", "a6"]) board.move(san);
  board.setHeader("White", "Alice");
  board.setHeader("Black", "Bob");
  board.setComment("Commentaire de la partie");
  const review = new GameReview(board.pgn());
  const branch = new StudyTree(review.positions[0]);
  branch.play(0, "d2", "d4");
  downloadPgn(review.pgn);
  const exported = new Chess();
  const text = await files[0].text();
  exported.loadPgn(text);
  expect(exported.history()).toEqual(["Nf3", "Nc6", "Bb5", "a6"]);
  expect(exported.getHeaders()).toMatchObject({ White: "Alice", Black: "Bob", SetUp: "1", FEN: initial });
  expect(exported.getComments()).toEqual(board.getComments());
  expect(text).toBe(board.pgn());
});
