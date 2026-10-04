import { expect, it } from "vitest";
import { confirmedConsequence } from "../directExplanation";
import { boardFromCommand } from "../StudyTree";
import { ignoredThreat } from "./ignoredThreat";
import { ignoredThreatDraft } from "./ignoredThreatDraft";
import { IgnoredThreatVerification } from "./IgnoredThreatVerification";
import { ignoredThreatCases, ignoredThreatInput, IgnoredThreatTestEngine, type IgnoredMode } from "./ignoredThreatTestEngine";

async function verify(id = "white", mode: IgnoredMode = "normal") {
  const input = ignoredThreatInput(id), engines: IgnoredThreatTestEngine[] = [], checker = new IgnoredThreatVerification([10, 20]);
  const factory = async () => { const engine = new IgnoredThreatTestEngine(input, mode); engines.push(engine); return engine; };
  const report = await checker.verify(input.request, factory);
  return { input, engines, checker, factory, report };
}
for (const id of ["white", "black", "history"]) {
  it(`vérifie la menace déjà présente, la perte et une défense possible : ${id}`, async () => {
    const { report, input, engines } = await verify(id);
    expect(report).toMatchObject({ status: "supported", reason: "ignored-threat", searches: 6, requestedSearchMs: 90, scope: "one-defence-found" });
    expect(report!.passes.map(p => p.evidence?.materialDelta)).toEqual(id === "history" ? [-1, -1] : [-5, -5]);
    expect(report!.passes.every(p => p.alternativeEvidence?.outcome === "preserved")).toBe(true);
    expect(engines.every(e => e.disposed)).toBe(true);
    expect(engines.flatMap(e => e.commands).filter(c => c.startsWith("go ")).every(c => !/searchmoves|multipv/i.test(c))).toBe(true);
    const draft = ignoredThreatDraft(input.source.position, report!)!;
    expect(draft.summary).toContain("sous la menace");
    expect(draft.evidence.contextText).toContain("pas qu'il était le seul bon choix");
    expect(draft.alternative).toEqual([]);
    const view = confirmedConsequence(draft, input.source.position);
    expect(view.steps[0].command).toBe(input.understanding.context.after.command);
    expect(view.steps).toHaveLength(id === "history" ? 7 : 3);
    for (const step of view.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
  });
}
for (const [mode, reason] of [["different", "different-threat"], ["short", "unresolved"], ["reversal", "unstable-search"], ["no-defence", "no-defence"], ["same-decision", "no-defence"]] as const) {
  it(`s'abstient lorsque ${mode}`, async () => {
    const { report, input } = await verify("white", mode);
    expect(report).toMatchObject({ status: "indeterminate", reason });
    expect(ignoredThreatDraft(input.source.position, report!)).toBeNull();
  });
}
it("sépare la stabilité du mécanisme et du sens de comparaison de la magnitude CP", async () => {
  const { report } = await verify("white", "drift");
  expect(report).toMatchObject({ status: "supported", reason: "ignored-threat" });
  expect(report!.passes.map(p => p.evidence!.materialDelta)).toEqual([-5, -5]);
});
it("refuse le score borné et ferme le moteur", async () => {
  const { report, checker, engines } = await verify("white", "bound");
  expect(report).toBeNull(); expect(checker.state).toBe("error");
  expect(engines.every(e => e.disposed)).toBe(true);
});
it("ne présente pas une capture compensée comme une perte", async () => {
  const { report } = await verify("compensation");
  expect(report).toMatchObject({ status: "contradicted", reason: "compensation" });
});
for (const id of ["new", "moved"]) {
  it(`ne confond pas une nouvelle exposition (${id}) avec une menace ignorée`, () => {
    const input = ignoredThreatInput(id);
    expect(ignoredThreat(input.understanding)).toBeNull();
  });
}
it("refuse un bilan ou une identité altérés lors de la fabrication du texte", async () => {
  const { report, input } = await verify();
  const changed = structuredClone(report!); changed.passes[1].evidence!.materialDelta++;
  expect(() => ignoredThreatDraft(input.source.position, changed)).toThrow("altérés");
  const wrong = structuredClone(report!); wrong.threat.attackerId = wrong.threat.victimId;
  expect(() => ignoredThreatDraft(input.source.position, wrong)).toThrow("altérés");
});
it("isole les autres décisions et les commandes de preuve modifiées", async () => {
  const { report, input } = await verify();
  expect(() => ignoredThreatDraft({ ...input.source.position, played: input.source.result!.bestMove }, report!)).toThrow();
  const wrong = structuredClone(report!); wrong.passes[0].questions.find(q => q.purpose === "alternative")!.position.command = input.source.position.command;
  expect(() => ignoredThreatDraft(input.source.position, wrong)).toThrow("Preuve");
});
it("le cache conserve les budgets séparés et s'invalide avec le moteur et la révision", async () => {
  const { report, input, engines, checker, factory } = await verify();
  expect((await checker.verify(input.request, factory))!.cached).toBe(true);
  expect(engines).toHaveLength(6);
  expect((await checker.verify({ ...input.request, engineId: "other" }, factory))!.cached).toBe(false);
  expect((await checker.verify({ ...input.request, revision: 1 }, factory))!.cached).toBe(false);
  expect(engines).toHaveLength(18);
  expect(report!.passes.map(p => p.budgetMs)).toEqual([10, 20]);
});
it("l'arrêt ignore les réponses tardives et ferme la recherche", async () => {
  const input = ignoredThreatInput(), checker = new IgnoredThreatVerification([10, 20]);
  const engine = new IgnoredThreatTestEngine(input); engine.hold = true;
  const pending = checker.verify(input.request, async () => engine);
  await new Promise(resolve => setTimeout(resolve, 5)); checker.stop();
  expect(await pending).toBeNull(); expect(checker.state).toBe("stopped"); expect(engine.disposed).toBe(true);
  engine.listener("bestmove a1b1"); expect(checker.state).toBe("stopped");
});
it("le délai coupe une recherche qui ne répond pas", async () => {
  const input = ignoredThreatInput(), checker = new IgnoredThreatVerification([10, 20], 30);
  const engine = new IgnoredThreatTestEngine(input); engine.hold = true;
  expect(await checker.verify(input.request, async () => engine)).toBeNull();
  expect(checker.state).toBe("timed-out"); expect(engine.disposed).toBe(true);
});
it("les exemples exécutés ne placent pas le roi hors trait en échec", () => {
  for (const example of ignoredThreatCases) {
    const { source } = ignoredThreatInput(example.id), board = boardFromCommand(source.position.command);
    const color = board.turn() === "w" ? "b" : "w", king = board.findPiece({ type: "k", color })[0];
    expect(board.isAttacked(king, board.turn()), example.id).toBe(false);
  }
});
