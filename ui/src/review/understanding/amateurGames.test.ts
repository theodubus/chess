import { Chess } from "chess.js";
import { expect, it } from "vitest";
import sample from "./amateurGames.json";
import { gamePositions } from "../model";
import { boardFromCommand } from "../StudyTree";

it("conserve la sélection avant mesure, sans annotation moteur utilisée comme vérité", () => {
  expect(sample).toMatchObject({ schema: 1, license: "CC0-1.0", independentSemanticValidation: false, usedForDevelopment: false });
  expect(sample.games.map((g) => g.ordinal)).toEqual([8, 9, 11]);
  expect(sample.games).toHaveLength(3);
  expect(sample.games.reduce((n, g) => n + g.plies, 0)).toBe(202);
});
it.each(sample.games)("rejoue toute la partie importée $id avec historique et résultat conservés", (game) => {
  const board = new Chess(); board.loadPgn(game.pgn, { strict: true });
  expect(board.history()).toHaveLength(game.plies);
  expect(board.getHeaders()).toMatchObject({ Site: game.source, White: "Blancs", Black: "Noirs", Termination: "Normal" });
  expect(board.getHeaders().Result).toBe(game.id === "1hi3aveq" ? "0-1" : "1-0");
  const positions = gamePositions(game.pgn);
  expect(positions).toHaveLength(game.plies + 1);
  for (const position of positions) expect(boardFromCommand(position.command).fen()).toBe(position.fen);
  expect(positions.at(-1)!.fen).toBe(board.fen());
  expect(game.semanticReview).toBe("pending");
  expect(game.pgn).not.toContain("[%eval");
});
