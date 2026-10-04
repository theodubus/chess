import { expect, it } from "vitest";
import { MovedPieceVerification } from "./MovedPieceVerification";
import { movedPieceInput, MovedPieceTestEngine } from "./movedPieceTestEngine";
import { captureLossDraft } from "./captureLossDraft";
import { confirmedConsequence } from "../directExplanation";
import { boardFromCommand } from "../StudyTree";

async function verify(id: string, mode?: ConstructorParameters<typeof MovedPieceTestEngine>[1]) {
  const input = movedPieceInput(id), engines: MovedPieceTestEngine[] = [];
  const report = await new MovedPieceVerification([10, 20]).verify(input.request, async () => { const e = new MovedPieceTestEngine(input, mode); engines.push(e); return e; });
  return { input, report, engines };
}
for (const [id, delta] of [["white", -5], ["black", -5], ["capture", -4], ["ep", -1], ["promotion", -1]] as const) {
  it(`vérifie l'exposition, le premier échange et la réponse comparée : ${id}`, async () => {
    const { input, report, engines } = await verify(id);
    expect(report).toMatchObject({ status: "supported", reason: "moved-piece-exposure", searches: 6 });
    expect(report!.passes.map(p => p.episode!.balanceSinceDecision)).toEqual([delta, delta]);
    expect(report!.passes.map(p => p.evidence!.materialDelta)).toEqual([delta, delta]);
    expect(engines.every(e => e.disposed)).toBe(true);
    const draft = captureLossDraft(input.source.position, report!)!;
    expect(draft.family).toBe("moved-piece-exposure"); expect(draft.evidence.scope).toBe("observed-consequence");
    const result = confirmedConsequence(draft, input.source.position);
    expect(result.steps[0].command).toBe(input.understanding.context.after.command);
    for (const step of result.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
    if (id === "ep") {
      expect(result.summary).toContain("en passant");
      expect(result.steps[0].marks).toEqual([{ from: "d4", to: "e3", tone: "threat" }, { from: "e4", tone: "threat" }]);
    }
    if (id === "promotion") { expect(result.summary).toContain("+8 points"); expect(result.summary).toContain("−1 point"); }
    if (id === "capture") expect(result.summary).toContain("tour noire en d4");
  });
}
for (const id of ["even", "defended"]) {
  it(`ne transforme pas une pièce capturée en échange perdant : ${id}`, async () => {
    const { report, input } = await verify(id);
    expect(report).toMatchObject({ status: "contradicted", reason: "compensation" });
    expect(captureLossDraft(input.source.position, report!)).toBeNull();
  });
}
it("n'explique pas la perte d'une autre pièce par la première capture neutre", async () => {
  const { report, input } = await verify("non-local-loss");
  expect(report).toMatchObject({ status: "indeterminate", reason: "episode-not-loss" });
  expect(report!.passes.map(p => p.evidence!.materialDelta)).toEqual([-5, -5]);
  expect(report!.passes.map(p => p.episode!.balanceSinceDecision)).toEqual([0, 0]);
  expect(captureLossDraft(input.source.position, report!)).toBeNull();
});
it("refuse l'épisode altéré avant de générer une explication", async () => {
  const { report, input } = await verify("capture");
  const changed = structuredClone(report!); changed.passes[1].episode!.balanceSinceDecision--;
  expect(() => captureLossDraft(input.source.position, changed)).toThrow("Épisode");
});
it("revalide le trait, les résultats et la fin de partie des questions sauvegardées", async () => {
  const { report, input } = await verify("capture");
  for (const change of [
    (r: NonNullable<typeof report>) => { r.passes[1].questions[0].result.variation = []; },
    (r: NonNullable<typeof report>) => { r.passes[1].questions[0].result.score!.bound = "lower"; },
    (r: NonNullable<typeof report>) => { r.passes[1].questions[2].position.turn = "w"; },
    (r: NonNullable<typeof report>) => { r.passes[1].questions[2].position.terminal = { kind: "mate", value: 0, winner: "w" }; },
  ]) {
    const changed = structuredClone(report!); change(changed);
    expect(() => captureLossDraft(input.source.position, changed)).toThrow("Question");
  }
});
it.each(["white", "black"])("accepte des issues de mat distinctes sans leur attribuer de points : %s", async id => {
  for (const mode of ["mate-loss", "mate-win-alternative"] as const) {
    const { report, input } = await verify(id, mode);
    expect(report).toMatchObject({ status: "supported", searches: 6 });
    const draft = captureLossDraft(input.source.position, report!)!;
    expect(draft.evidence.materialDelta).toBe(-5);
    expect(draft.summary).not.toMatch(/mat|forc[ée]|meilleur/i);
  }
  expect((await verify(id, "mate-both-loss")).report).toMatchObject({ status: "indeterminate", reason: "unstable-search" });
});
it("contrôle une alternative qui mate immédiatement sans demander de recherche terminale", async () => {
  const { input, report, engines } = await verify("terminal-defence");
  expect(report).toMatchObject({ status: "supported", searches: 4 });
  for (const pass of report!.passes) {
    const alternative = pass.questions.find(q => q.purpose === "alternative")!;
    expect(alternative.position.terminal).toEqual({ kind: "mate", value: 0, winner: "b" });
    expect(boardFromCommand(alternative.position.command).isCheckmate()).toBe(true);
    expect(pass.alternativeEvidence).toMatchObject({ outcome: "mate-for-victim", victimSquare: "h4", materialDelta: 0, moves: [] });
    expect(pass.episode!.balanceSinceDecision).toBe(-9);
  }
  expect(engines.flatMap(e => e.commands).some(c => c.endsWith("d8h4"))).toBe(false);
  const draft = captureLossDraft(input.source.position, report!)!;
  expect(draft.summary).toContain("−9 points"); expect(draft.summary).not.toContain("mat forcé");
  expect(draft.evidence.contextText).toContain("Dh4# donnait immédiatement mat");
  const changed = structuredClone(report!); changed.passes[1].questions.find(q => q.purpose === "alternative")!.result.score!.winner = "w";
  expect(() => captureLossDraft(input.source.position, changed)).toThrow();
});
