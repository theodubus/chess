import { afterEach, expect, it, vi } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { confirmedConsequence } from "../directExplanation";
import { DivertedDefenceVerification } from "./DivertedDefenceVerification";
import { divertedDefenceDraft } from "./divertedDefenceDraft";
import { divertedDefenceInput, DivertedDefenceTestEngine, type DivertedMode } from "./divertedDefenceTestEngine";
import { PedagogicalAnalysis } from "./PedagogicalAnalysis";
import { legalVariation } from "../model";
import { decisionContext } from "./context";

afterEach(() => vi.restoreAllMocks());
it.each(["white", "black", "history"])("suit la reprise et la seconde perte avec les identités et l'historique : %s", async (id) => {
  const { source, request } = divertedDefenceInput(id), check = new DivertedDefenceVerification([10, 20]), engines: DivertedDefenceTestEngine[] = [];
  const factory = vi.fn(async () => { const e = new DivertedDefenceTestEngine(source); engines.push(e); return e; });
  const report = await check.verify(request, factory);
  expect(report, check.error).toMatchObject({ status: "supported", reason: "stable-loss", searches: 8, requestedSearchMs: 120 });
  expect(report!.passes.every((p) => p.evidence?.materialDelta === -5 && p.evidence.outcome === "loss-in-line")).toBe(true);
  const draft = divertedDefenceDraft(source.position, report!)!;
  expect(draft).toMatchObject({ family: "diverted-defender", role: "allows-loss", alternative: [], comparisonText: "" });
  expect(draft.summary).toContain(id === "black" ? "d8" : "d1"); expect(draft.summary).toContain("−5 points");
  expect(draft.summary).not.toContain("échange gagnant"); expect(draft.played[2].note).toContain("0 point");
  expect(draft.played).toHaveLength(4);
  const consequence = confirmedConsequence(draft, source.position);
  expect(consequence.steps[0].command).toContain(source.position.played!);
  for (const step of consequence.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
  expect(consequence.steps.at(-1)!.text).toContain(id === "black" ? "Noirs" : "Blancs");
  expect(engines.every((e) => e.disposed)).toBe(true);
  expect(await check.verify(request, factory)).toMatchObject({ cached: true, searches: 0 }); expect(factory).toHaveBeenCalledTimes(8);
});
it("conserve la compensation ailleurs, son échec et la réponse du roi", async () => {
  const { source, request } = divertedDefenceInput("compensation"), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source));
  expect(report, check.error).toMatchObject({ status: "contradicted", reason: "compensation-found" });
  expect(report!.passes.every((p) => p.evidence?.materialDelta === 0 && p.evidence.moves.at(-1) === "h8g7")).toBe(true);
  expect(divertedDefenceDraft(source.position, report!)).toBeNull();
});
it("une continuation tronquée ne masque pas la compensation présente dans la PV initiale", async () => {
  const { source, request } = divertedDefenceInput("compensation"), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source, "short"));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason: "unstable-search" });
  expect(report!.passes[0].sourceEvidence?.materialDelta).toBe(0); expect(report!.passes[0].evidence?.materialDelta).toBe(-5);
});
it.each(["pre-existing", "still-defends"])("refuse de créer une cause que les relations légales ne confirment pas : %s", async (id) => {
  const { source, request } = divertedDefenceInput(id), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason: "unconfirmed-relation" });
  expect(divertedDefenceDraft(source.position, report!)).toBeNull();
});
it.each([
  ["decline", "different-defence"], ["drift", "unstable-search"], ["mate", "mate-score"], ["missing-sequence", "missing-sequence"],
] as [DivertedMode, string][])("garde l'abstention quand le moteur change la chaîne : %s", async (mode, reason) => {
  const { source, request } = divertedDefenceInput(), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source, mode));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason });
  expect(divertedDefenceDraft(source.position, report!)).toBeNull();
});
it("une autre seconde prise ne démontre pas la diversion de cette victime", async () => {
  const { source, request } = divertedDefenceInput("compensation"), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source, "other-capture"));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason: "different-capture" });
});
it.each(["before-mate", "before-drift"] as const)("le bilan de la suite ne chiffre pas l'écart au meilleur coup : %s", async (mode) => {
  const { source, request } = divertedDefenceInput(), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source, mode));
  expect(report, check.error).toMatchObject({ status: "supported", reason: "stable-loss" });
  const draft = divertedDefenceDraft(source.position, report!)!;
  expect(draft.evidence.materialDelta).toBe(-5); expect(draft.summary).not.toContain("centipion"); expect(draft.summary).not.toContain("mat");
});
it("refuse le score borné et ferme le moteur", async () => {
  const { source, request } = divertedDefenceInput(), check = new DivertedDefenceVerification([10, 20]), engines: DivertedDefenceTestEngine[] = [];
  expect(await check.verify(request, async () => { const e = new DivertedDefenceTestEngine(source, "bound"); engines.push(e); return e; })).toBeNull();
  expect(check.state).toBe("error"); expect(engines.every((e) => e.disposed)).toBe(true);
});
it("revalide les questions, les identités et le bilan avant de produire du texte", async () => {
  const { source, request } = divertedDefenceInput(), check = new DivertedDefenceVerification([10, 20]);
  const report = (await check.verify(request, async () => new DivertedDefenceTestEngine(source)))!;
  const wrong = structuredClone(report); wrong.passes[0].questions.find((q) => q.purpose === "exploitation")!.position.command = source.position.command;
  expect(() => divertedDefenceDraft(source.position, wrong)).toThrow("autre reprise");
  const falseBalance = structuredClone(report); falseBalance.passes[0].evidence!.materialDelta = -9;
  expect(() => divertedDefenceDraft(source.position, falseBalance)).toThrow("périmé");
  const wrongId = structuredClone(report); wrongId.passes[0].hypothesis!.defenderId = "other";
  expect(() => divertedDefenceDraft(source.position, wrongId)).toThrow("périmé");
  const compensated = divertedDefenceInput("compensation"), compensation = (await new DivertedDefenceVerification([10, 20]).verify(compensated.request, async () => new DivertedDefenceTestEngine(compensated.source)))!;
  expect(() => divertedDefenceDraft(compensated.source.position, { ...compensation, status: "supported" })).toThrow("périmé");
});
it("annule pendant la recherche de reprise sans résultat tardif", async () => {
  const { source, request } = divertedDefenceInput(), check = new DivertedDefenceVerification([10, 20]), engines: DivertedDefenceTestEngine[] = [];
  const pending = check.verify(request, async () => {
    const e = new DivertedDefenceTestEngine(source), send = e.send.bind(e);
    e.send = (command) => { if (command.startsWith("go ") && e.command.endsWith("f7d5")) e.hold = true; send(command); };
    engines.push(e); return e;
  });
  await vi.waitFor(() => expect(engines.some((e) => e.hold)).toBe(true));
  check.stop(); expect(await pending).toBeNull(); expect(check.state).toBe("stopped"); expect(engines.every((e) => e.disposed)).toBe(true);
});
it.each(["white", "black"])("raccorde le récit adverse complet dans la revue : %s", async (id) => {
  const { source, request } = divertedDefenceInput(id), check = new PedagogicalAnalysis([10, 20]);
  const result = await check.analyse({ ...request, result: { ...source.result!, score: { kind: "cp", value: id === "black" ? -200 : 200 } }, category: "mistake" },
    async () => new DivertedDefenceTestEngine(source));
  expect(result, check.error).toMatchObject({ status: "supported", attempts: 1, searches: 8 });
  expect(result!.checks).toEqual([expect.objectContaining({ family: "diversion", reason: "stable-loss" })]);
  expect(result!.consequence!.title).toContain("reprise détourne"); expect(result!.consequence!.steps).toHaveLength(4);
  expect(result!.consequence!.steps[2].text).toContain("0 point");
});
it("borne la PV initiale lorsque le moteur la prolonge après une nulle par matériel insuffisant", async () => {
  const { source, request } = divertedDefenceInput(), check = new PedagogicalAnalysis([10, 20]);
  // Réponse Stockfish réelle exécutée avant inscription ; chess.js permet les
  // déplacements géométriquement légaux après la nulle, le contexte les refuse.
  const context = decisionContext(source.position), moves = "f7d5 d1d5 b2a1 h1g2 h8g7 d5d6 a1e5 g2f3 e5d6 f3e4 g7f6 e4e3 d6b8 e3e2 b8a7 e2f1".split(" ");
  const variation = legalVariation(context.after.fen, moves);
  const board = boardFromCommand(context.after.command); moves.slice(0, 9).forEach((m) => board.move(m)); expect(board.isInsufficientMaterial()).toBe(true);
  expect(variation).toHaveLength(16);
  const result = await check.analyse({ ...request, result: { ...source.result!, variation, score: { kind: "cp", value: 25 } }, category: "mistake" },
    async () => new DivertedDefenceTestEngine(source));
  expect(result, check.error).toMatchObject({ status: "supported", searches: 8 });
  expect(result!.consequence!.steps).toHaveLength(4);
});
it("le cache sépare les révisions et le moteur, et le délai couvre une réponse suspendue", async () => {
  const { source, request } = divertedDefenceInput(), check = new DivertedDefenceVerification([10, 20]);
  const factory = vi.fn(async () => new DivertedDefenceTestEngine(source));
  await check.verify(request, factory);
  expect(await check.verify({ ...request, revision: 1 }, factory)).toMatchObject({ cached: false, searches: 8 });
  expect(await check.verify({ ...request, engineId: "other" }, factory)).toMatchObject({ cached: false, searches: 8 });
  const timeout = new DivertedDefenceVerification([10, 20], 50), engines: DivertedDefenceTestEngine[] = [];
  expect(await timeout.verify(request, async () => { const e = new DivertedDefenceTestEngine(source); e.hold = true; engines.push(e); return e; })).toBeNull();
  expect(timeout.state).toBe("timed-out"); expect(engines.every((e) => e.disposed)).toBe(true);
});
