import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { corpusInput, type CorpusCase } from "./corpus";
import { understandDecision } from "./prototype";
import { movedPieceExposure } from "./movedPieceExposure";
import { ignoredThreatInput } from "./ignoredThreatTestEngine";

// Positions et continuations exécutées avant inscription. Aucune classification
// attendue : une capture géométrique n'est pas encore un verdict de perte.
const cases: CorpusCase[] = [
  { id: "white", fen: "1r5k/7p/8/8/8/7P/8/R6K w - - 0 1", played: "Rb1", line: ["Rxb1+", "Kh2"] },
  { id: "black", fen: "r6k/8/7p/8/8/8/7P/1R5K b - - 0 1", played: "Rb8", line: ["Rxb8+", "Kh7"] },
  { id: "capture", fen: "7k/7p/8/4p3/3r4/8/7P/3Q3K w - - 0 1", played: "Qxd4", line: ["exd4", "Kg1"] },
  { id: "even", fen: "7k/7p/8/4p3/3q4/8/7P/3Q3K w - - 0 1", played: "Qxd4", line: ["exd4", "Kg1"] },
  { id: "defended", fen: "1r5k/7p/8/8/8/7P/2Q5/R6K w - - 0 1", played: "Rb1", line: ["Rxb1+", "Qxb1", "Kg8"] },
  { id: "ep", fen: "7k/8/8/8/3p4/8/4P3/7K w - - 0 1", played: "e4", line: ["dxe3", "Kg1", "Kg8"] },
  { id: "promotion", fen: "1r5k/P7/8/8/8/8/7P/7K w - - 0 1", played: "a8=Q", line: ["Rxa8", "Kg1", "Kg8"] },
].map(c => ({ family: "moved-piece-exposure", origin: "constructed", notes: "Fait seul, aucune perte ou qualité déduite.", prefix: [], expected: {}, forbiddenClaims: ["forced-loss", "winning-exchange"], ...c }));
for (const test of cases) {
  it(`suit l'identité de la pièce déplacée puis capturée : ${test.id}`, () => {
    const source = corpusInput(test), understanding = understandDecision(source.position, source.result);
    const fact = movedPieceExposure(understanding)!;
    expect(fact).toMatchObject({ kind: "moved-piece-exposure", status: "hypothesis", scope: "actual-turn" });
    const before = understanding.context.before.pieces.find(p => p.id === fact.victimId)!;
    const after = understanding.context.after.pieces.find(p => p.id === fact.victimId)!;
    expect(before.square).toBe(understanding.context.moves[understanding.context.decision].from);
    expect(after.square).toBe(fact.destination);
    if (test.id === "promotion") { expect(before.type).toBe("p"); expect(after.type).toBe("q"); }
    if (test.id === "ep") { expect(fact.destination).toBe("e4"); expect(fact.capture).toBe("d4e3"); }
    const board = new Chess(test.fen), color = board.turn() === "w" ? "b" : "w", king = board.findPiece({ type: "k", color })[0];
    expect(board.isAttacked(king, board.turn())).toBe(false);
  });
}
it("ne confond pas une autre pièce prise avec la pièce tout juste déplacée", () => {
  const input = ignoredThreatInput();
  expect(movedPieceExposure(input.understanding)).toBeNull();
});
