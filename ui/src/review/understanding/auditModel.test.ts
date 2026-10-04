import { expect, it } from "vitest";
import data from "../../../dev/pedagogy-audit-data.json";
import sample from "./amateurGames.json";
import { auditReview, type AuditDocument } from "./auditModel";
import { notablePositions } from "../study";
import { boardFromCommand } from "../StudyTree";

const document = data as unknown as AuditDocument;
it("rejoue les six revues réelles et leurs repères sans les compter comme attentes pédagogiques", () => {
  expect(document.independentSemanticValidation).toBe(false);
  for (const game of document.games) {
    const source = sample.games.find((s) => s.id === game.id)!;
    const review = auditReview(game, source.pgn);
    expect(review.completed).toBe(game.plies + 1);
    for (const decision of game.decisions) {
      expect(decision.semanticAssessment).toBe("pending");
      expect(!!decision.consequence).toBe(decision.status === "supported");
      for (const step of decision.consequence?.steps ?? []) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
    }
    // Le même PGN, qu'il soit importé, humain/humain ou issu d'une partie bot,
    // garde les mêmes coups ; seul le filtre des moments change.
    const all = notablePositions(review.annotations, review.positions, "both");
    for (const side of ["w", "b"] as const) {
      const own = notablePositions(review.annotations, review.positions, side);
      expect(own.every((index) => all.includes(index) && review.positions[index - 1].turn === side)).toBe(true);
      expect(all.filter((index) => review.positions[index - 1].turn === side)).toEqual(own);
    }
  }
});
it("refuse un instantané incomplet, un verdict périmé et un repère d'une autre décision", () => {
  const original = document.games.find((g) => g.decisions.some((d) => d.consequence))!, source = sample.games.find((s) => s.id === original.id)!;
  expect(() => auditReview({ ...original, complete: false }, source.pgn)).toThrow("incomplète");
  const stale = structuredClone(original); stale.decisions[0].category = "unrecognised";
  expect(() => auditReview(stale, source.pgn)).toThrow("autre coup");
  const other = structuredClone(original), cause = other.decisions.find((d) => d.consequence)!;
  cause.consequence!.steps[0].command = "position startpos";
  expect(() => auditReview(other, source.pgn)).toThrow("après la décision");
  const skipped = structuredClone(original), proof = skipped.decisions.find((d) => d.consequence)!;
  proof.consequence!.steps[1].command += " " + proof.consequence!.steps[1].command.split(" ").at(-1);
  expect(() => auditReview(skipped, source.pgn)).toThrow("sautée");
});
