import { expect, it } from "vitest";
import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext } from "./context";
import { captureEpisode } from "./captureEpisode";
import { divertedDefenceInput } from "./divertedDefenceTestEngine";
import { ignoredThreatInput } from "./ignoredThreatTestEngine";

function episode(fen: string, played: string, line: string[]) {
  const source = corpusInput({ id: "episode", family: "capture-episode", origin: "constructed", notes: "Bilan local sans verdict attendu.", expected: {}, forbiddenClaims: [], fen, played, line, prefix: [] } satisfies CorpusCase);
  return captureEpisode(decisionContext(source.position, source.result));
}
it("n'attribue pas une perte ultérieure à la première capture équilibrée", () => {
  const { source } = divertedDefenceInput(), context = decisionContext(source.position, source.result);
  expect(captureEpisode(context)).toMatchObject({ complete: true, balanceSinceDecision: 0, moves: ["f7d5", "d1d5"] });
});
it("inclut la prise faite par la décision avant de compter la perte de sa dame", () => {
  expect(episode("7k/7p/8/4p3/3r4/8/7P/3Q3K w - - 0 1", "Qxd4", ["exd4", "Kg1"])).toMatchObject({ complete: true, balanceSinceDecision: -4 });
  expect(episode("7k/7p/8/4p3/3q4/8/7P/3Q3K w - - 0 1", "Qxd4", ["exd4", "Kg1"])).toMatchObject({ complete: true, balanceSinceDecision: 0 });
});
it("garde la réponse à l'échec et distingue les deux camps", () => {
  for (const id of ["white", "black"]) {
    const { source } = ignoredThreatInput(id);
    expect(captureEpisode(decisionContext(source.position, source.result))).toMatchObject({ complete: true, balanceSinceDecision: -5 });
    expect(captureEpisode(decisionContext(source.position, source.result))!.moves).toHaveLength(2);
  }
});
it("ne clôt pas une capture dont l'échec n'a pas encore de réponse", () => {
  const { source } = ignoredThreatInput();
  expect(captureEpisode(decisionContext(source.position, { ...source.result!, variation: source.result!.variation.slice(0, 1) }))).toMatchObject({ complete: false, ending: "pending-check" });
});
it("inclut la promotion et la prise en passant dans le bilan depuis la décision", () => {
  expect(episode("1r5k/P7/8/8/8/8/7P/7K w - - 0 1", "a8=Q", ["Rxa8", "Kg1", "Kg8"])).toMatchObject({ complete: true, balanceSinceDecision: -1 });
  expect(episode("7k/8/8/8/3p4/8/4P3/7K w - - 0 1", "e4", ["dxe3", "Kg1", "Kg8"])).toMatchObject({ complete: true, balanceSinceDecision: -1 });
});
it("compte la reprise sans annoncer de perte pour une pièce simplement défendue", () => {
  expect(episode("1r5k/7p/8/8/8/7P/2Q5/R6K w - - 0 1", "Rb1", ["Rxb1+", "Qxb1", "Kg8"])).toMatchObject({ complete: true, balanceSinceDecision: 0, moves: ["b8b1", "c2b1"] });
});
