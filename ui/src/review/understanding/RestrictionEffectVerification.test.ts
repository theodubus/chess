import { afterEach, expect, it, vi } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { directExplanation, confirmedConsequence } from "../directExplanation";
import { explainMove } from "../explanations";
import { closedRetreats, RestrictionEffectVerification } from "./RestrictionEffectVerification";
import { restrictionDraft } from "./restrictionDraft";
import { restrictionInput, RestrictionTestEngine, type RestrictionMode } from "./restrictionTestEngine";
import { PedagogicalAnalysis } from "./PedagogicalAnalysis";

afterEach(() => vi.restoreAllMocks());
it.each(["queen-closes-retreat", "queen-closes-retreat-black"])("raccorde une sortie fermée puis la perte, dans les deux camps : %s", async (id) => {
  const { request, source } = restrictionInput(id), engines: RestrictionTestEngine[] = [], check = new RestrictionEffectVerification([10, 20]);
  const factory = vi.fn(async () => { const e = new RestrictionTestEngine(request); engines.push(e); return e; });
  const report = await check.verify(request, factory);
  expect(report, check.error).toMatchObject({ status: "supported", reason: "stable-loss", searches: 6 });
  expect(report!.passes.every((p) => p.evidence?.materialDelta === -2)).toBe(true);
  expect(report!.passes.every((p) => p.capture?.handledThreat === false)).toBe(true);
  const draft = restrictionDraft(request.understanding, report!)!;
  expect(draft).toMatchObject({ family: "closed-retreat", role: "allows-loss", alternative: [], comparisonText: "" });
  expect(draft.summary).toContain(id.endsWith("black") ? "e6–d7" : "e3–d2");
  expect(draft.summary).toContain("−2 points");
  const view = directExplanation(explainMove(source.position, null, source.result, null, false), confirmedConsequence(draft, source.position));
  expect(view.proof!.steps[0].command).toBe(request.understanding.context.after.command);
  expect(view.proof!.steps).toHaveLength(5);
  expect(view.proof!.steps.at(-1)!.move!.captured).toBe("p");
  expect(view.proof!.steps.at(-1)!.text).toContain("Après les reprises");
  for (const step of view.proof!.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
  expect(view.comparison).toBeUndefined(); expect(engines.every((e) => e.disposed)).toBe(true);
  expect(factory).toHaveBeenCalledTimes(6);
  expect(await check.verify(request, factory)).toMatchObject({ cached: true, searches: 0 });
  expect(factory).toHaveBeenCalledTimes(6);
});
it.each(["queen-closes-retreat", "queen-closes-retreat-black"])("prendre l'attaquant puis se faire reprendre n'est pas un gain isolé : %s", async (id) => {
  const { request, source } = restrictionInput(id), check = new RestrictionEffectVerification([10, 20]), black = id.endsWith("black");
  const report = await check.verify(request, async () => new RestrictionTestEngine(request, "handled"));
  expect(report, check.error).toMatchObject({ status: "supported" });
  expect(report!.passes.every((p) => p.capture?.handledThreat && p.capture.threatAttackerId === (black ? "w:p:f4" : "b:p:f5") && p.capture.attackerId === (black ? "w:p:e4" : "b:p:e5"))).toBe(true);
  const draft = restrictionDraft(request.understanding, report!)!;
  expect(draft.summary).toContain(black ? "Fxf5 prend l'attaquant, mais exf5 reprend cette pièce" : "Fxf4 prend l'attaquant, mais exf4 reprend cette pièce");
  expect(draft.summary).toContain("−2 points");
  expect(draft.played).toHaveLength(4);
  expect(draft.played.at(-1)!.note).toContain(black ? "Fd8" : "Fd1");
  const view = confirmedConsequence(draft, source.position);
  expect(view.steps.at(-1)!.text).toContain("une reprise reste légale");
});
it.each([
  ["capture-compensates-decision", "compensated", "compensation-found"],
  ["another-piece-saves-restricted-bishop", "preserved", "defence-found"],
] as const)("refuse une perte malgré la fermeture physique : %s", async (id, outcome, reason) => {
  const { request } = restrictionInput(id), check = new RestrictionEffectVerification([10, 20]);
  const report = await check.verify(request, async () => new RestrictionTestEngine(request));
  expect(report, check.error).toMatchObject({ status: "contradicted", reason });
  expect(report!.passes.every((p) => p.evidence?.outcome === outcome)).toBe(true);
  if (outcome === "compensated") expect(report!.passes.every((p) => p.evidence!.materialDelta === 0)).toBe(true);
  expect(restrictionDraft(request.understanding, report!)).toBeNull();
});
it.each([
  ["short", "incomplete-evidence"], ["drift", "unstable-search"], ["different-threat", "threat-changed"],
  ["delayed", "incomplete-evidence"], ["other-target", "incomplete-evidence"],
  ["unblocked", "incomplete-evidence"],
] as [RestrictionMode, string][])("garde l'abstention pour une preuve insuffisante : %s", async (mode, reason) => {
  const { request } = restrictionInput(), check = new RestrictionEffectVerification([10, 20]);
  const report = await check.verify(request, async () => new RestrictionTestEngine(request, mode));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason });
  expect(restrictionDraft(request.understanding, report!)).toBeNull();
});
it.each(["escape", "compound-escape"] as const)("suit la victime vers une sortie déjà exposée : %s", async (mode) => {
  for (const id of ["queen-closes-retreat", "queen-closes-retreat-black"]) {
    const { request } = restrictionInput(id), check = new RestrictionEffectVerification([10, 20]);
    const report = await check.verify(request, async () => new RestrictionTestEngine(request, mode));
    expect(report, check.error).toMatchObject({ status: "supported", reason: "stable-loss" });
    expect(report!.passes.every((p) => p.capture?.escape && p.evidence?.materialDelta === -2)).toBe(true);
    const draft = restrictionDraft(request.understanding, report!)!;
    expect(draft.summary).toContain(id.endsWith("black") ? "tente de dégager le fou noir" : "tente de dégager le fou blanc");
    expect(draft.summary).toContain(id.endsWith("black") ? "−2 points pour les Noirs" : "−2 points pour les Blancs");
  }
});
it("deux défenses différentes confirment le même mécanisme et bilan, sans imposer une seule suite", async () => {
  const { request } = restrictionInput(), check = new RestrictionEffectVerification([10, 20]);
  const report = await check.verify(request, async () => new RestrictionTestEngine(request, "different-defence"));
  expect(report, check.error).toMatchObject({ status: "supported" });
  expect(report!.passes[0].capture!.move).not.toBe(report!.passes[1].capture!.move);
  expect(restrictionDraft(request.understanding, report!)!.summary).toContain("Fxf4 prend l'attaquant");
});
it("explique une perte matérielle même si son camp reste gagnant selon le score", async () => {
  const { request } = restrictionInput(), check = new RestrictionEffectVerification([10, 20]);
  const report = await check.verify(request, async () => new RestrictionTestEngine(request, "normal", 500));
  expect(report, check.error).toMatchObject({ status: "supported" });
});
it("refuse les réponses UCI bornées et ferme les moteurs", async () => {
  const { request } = restrictionInput(), check = new RestrictionEffectVerification([10, 20]), engines: RestrictionTestEngine[] = [];
  expect(await check.verify(request, async () => { const e = new RestrictionTestEngine(request, "bound"); engines.push(e); return e; })).toBeNull();
  expect(check.state).toBe("error"); expect(engines.every((e) => e.disposed)).toBe(true);
});
it("n'explique pas un blocage ancien, un autre bloqueur ou une autre position", async () => {
  const { request } = restrictionInput(), h = request.understanding.hypotheses[request.hypothesisIndex];
  expect(closedRetreats(request.understanding, { ...h, closedRoutes: h.closedRoutes.map((r) => ({ ...r, blockerId: "other" })) })).toEqual([]);
  expect(closedRetreats(request.understanding, { ...h, threatPly: h.threatPly + 1 })).toEqual([]);
  const check = new RestrictionEffectVerification([10, 20]), factory = vi.fn(async () => new RestrictionTestEngine(request));
  expect(() => check.verify({ ...request, hypothesisIndex: 100 }, factory)).toThrow();
  expect(factory).not.toHaveBeenCalled();
  const report = await check.verify(request, factory);
  expect(() => restrictionDraft(request.understanding, { ...report!, routes: [] })).toThrow("Sortie fermée");
  const forged = structuredClone(report!); forged.passes[0].questions.find((q) => q.purpose === "defence")!.position.command = request.understanding.context.before.command;
  expect(() => restrictionDraft(request.understanding, forged)).toThrow("périmé");
  const unrelated = structuredClone(report!); unrelated.passes[0].capture!.attackerId = "b:p:d6";
  expect(() => restrictionDraft(request.understanding, unrelated)).toThrow("périmé");
});
it("priorise cette cause dans le contrôleur de revue, sans alternative ni ancienne heuristique", async () => {
  const { request, source } = restrictionInput(), check = new PedagogicalAnalysis([10, 20]);
  const result = await check.analyse({ ...request, ...source, category: "blunder", result: { ...source.result!, score: { kind: "cp", value: -300 } } },
    async () => new RestrictionTestEngine(request));
  expect(result, check.error).toMatchObject({ status: "supported", attempts: 1, searches: 6 });
  expect(result!.consequence!.title).toContain("retraite fermée");
  expect(result!.consequence!.steps[0].fen).toBe(request.understanding.context.after.fen);
});
it("annule la recherche de défense et ignore une publication tardive", async () => {
  const { request } = restrictionInput(), check = new RestrictionEffectVerification([10, 20]), engines: RestrictionTestEngine[] = [];
  const pending = check.verify(request, async () => {
    const e = new RestrictionTestEngine(request), send = e.send.bind(e);
    e.send = (command) => { if (command.startsWith("go ") && e.command === request.understanding.context.frames[request.understanding.hypotheses[request.hypothesisIndex].threatPly + 1].command) e.hold = true; send(command); };
    engines.push(e); return e;
  });
  await vi.waitFor(() => expect(engines.some((e) => e.hold)).toBe(true));
  check.stop(); expect(await pending).toBeNull(); expect(check.state).toBe("stopped");
  expect(engines.every((e) => e.disposed)).toBe(true);
});
