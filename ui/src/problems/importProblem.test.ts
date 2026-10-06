import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { MAX_PGN_BYTES, importPgn } from "../importPgn";
import { boardFromCommand } from "../review/StudyTree";
import { importProblem } from "./importProblem";

function mateProblem() {
  const board = new Chess();
  for (const san of ["f3", "e5", "g4"]) board.move(san);
  return board;
}

it("charge une FEN au trait noir, avec ses droits, pendules et numéro de coup", () => {
  const board = mateProblem();
  const problem = importProblem(`\uFEFF  ${board.fen()}\n`);
  expect(problem.position.fen).toBe(board.fen());
  expect(problem.position.turn).toBe("b");
  expect(problem.position.command).toBe(`position fen ${board.fen()}`);
  expect(boardFromCommand(problem.position.command).fen()).toBe(board.fen());
});

it("accepte un PGN contenant seulement une FEN sans assouplir l’import des parties", () => {
  const board = new Chess(mateProblem().fen());
  board.setHeader("Event", "Mat en un");
  const pgn = board.pgn();
  expect(importProblem(pgn).title).toBe("Mat en un");
  expect(importProblem(pgn).position.fen).toBe(board.fen());
  expect(() => importPgn(pgn)).toThrow("aucun coup");
});

it("part avant la solution écrite dans le PGN ou prend explicitement sa dernière position", () => {
  const board = new Chess(mateProblem().fen()), fen = board.fen();
  board.move("Qh4#");
  const start = importProblem(board.pgn());
  expect(start.position.command).toBe(`position fen ${fen}`);
  expect(start.position.terminal).toBeNull();
  const end = importProblem(board.pgn(), "final");
  expect(end.position.command).toBe(`position fen ${fen} moves d8h4`);
  expect(end.position.fen).toBe(board.fen());
  expect(end.position.terminal).toEqual({ kind: "mate", value: 0, winner: "b" });
});

it("conserve l’historique d’une partie pour résoudre sa dernière position, y compris la répétition", () => {
  const board = new Chess();
  for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) board.move(san);
  const problem = importProblem(board.pgn(), "final");
  expect(boardFromCommand(problem.position.command).isThreefoldRepetition()).toBe(true);
  expect(problem.position.terminal).toEqual({ kind: "cp", value: 0 });
});

it("ne modifie pas une position de promotion ni le PGN fourni", () => {
  const board = new Chess("7k/P7/8/8/8/8/7P/7K w - - 0 1");
  const fen = board.fen(), pgn = board.pgn();
  expect(importProblem(fen).position.fen).toBe(fen);
  expect(importProblem(pgn).position.fen).toBe(fen);
  expect(importProblem(pgn).title).toBe("Problème d’échecs");
  expect(board.pgn()).toBe(pgn);
});

it("refuse les entrées vides, malformées, plusieurs parties et les variantes non standard", () => {
  for (const text of ["", "du texte", "8/8/8", "1. e5 *", '[Event "Vide"]\n*',
    '[Variant "Crazyhouse"]\n\n1. e4 *', "1. e4 1-0\n\n1. d4 0-1",
    "P6k/8/8/8/8/8/8/K7 w - - 0 1"]) expect(() => importProblem(text)).toThrow();
  expect(() => importProblem("é".repeat(MAX_PGN_BYTES))).toThrow("volumineux");
});

it("refuse un roi adverse attaqué et des droits de roque sans la tour correspondante", () => {
  expect(() => importProblem("7k/7R/8/8/8/8/8/K7 w - - 0 1")).toThrow("roi");
  const board = new Chess(); board.remove("h1");
  const fields = board.fen().split(" "); fields[2] = "KQkq";
  expect(() => importProblem(fields.join(" "))).toThrow("roque");
});

it("refuse une prise en passant sur un pion absent et accepte la prise réellement possible", () => {
  expect(() => importProblem("8/8/8/3P4/8/8/8/K6k w - e6 0 1")).toThrow("en passant");
  const problem = importProblem("8/8/8/3Pp3/8/8/8/K6k w - e6 0 1");
  expect(boardFromCommand(problem.position.command).moves()).toContain("dxe6");
});
