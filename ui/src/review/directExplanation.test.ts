import { expect, it } from "vitest";
import { confirmedConsequence, directExplanation } from "./directExplanation";
import { explainMove } from "./explanations";
import { tacticalInput } from "./understanding/tacticalCases";
import { corpusInput } from "./understanding/corpus";
import { TacticalEffectVerification } from "./understanding/TacticalVerification";
import { tacticalDraft } from "./understanding/tacticalDraft";
import { ScriptEngine } from "./understanding/tacticalTestEngine";
import { boardFromCommand } from "./StudyTree";

async function fixture() {
  const input = tacticalInput("allows-fork"), { position, result } = corpusInput(input.example.test);
  const req = { ...input, review: {}, revision: 0, engineId: "script" };
  const report = await new TacticalEffectVerification([10, 20]).verify(req, async () => new ScriptEngine(req, "allows-fork"));
  return { draft: tacticalDraft(input.understanding, report!)!, position, result };
}
it("texte, repères et bilan suivent la même suite, sans refaire le coup ni imposer un remplacement", async () => {
  const { draft, position, result } = await fixture();
  const consequence = confirmedConsequence(draft, position);
  const view = directExplanation(explainMove(position, null, result, null, false), consequence);
  expect(view.proof!.title).toContain("fourchette");
  expect(view.proof!.steps.map((s) => s.command.split(" ").at(-1))).toEqual(["d8e8", "d5c7", "e8d7", "c7a8"]);
  expect(view.proof!.steps[0].move).toBeNull();
  expect(view.proof!.steps.at(-1)!.move!.captured).toBe("r");
  expect(view.proof!.steps.at(-1)!.text).toContain("−5 points");
  expect(view.proof!.steps[1].marks).toEqual(draft.played[1].marks);
  expect(view.limitation).toContain("deux recherches");
  expect(view.comparison).toBeUndefined();
  for (const step of view.proof!.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
});
it("refuse une autre décision, un raccourci de commandes et une FEN incohérente", async () => {
  const { draft, position } = await fixture();
  expect(() => confirmedConsequence(draft, { ...position, played: "a8b8" })).toThrow();
  const skipped = { ...draft, played: [draft.played[0], ...draft.played.slice(2)] };
  expect(() => confirmedConsequence(skipped, position)).toThrow("historique");
  const stale = { ...draft, played: draft.played.map((s, i) => i === 1 ? { ...s, fen: position.fen } : s) };
  expect(() => confirmedConsequence(stale, position)).toThrow("incohérente");
  expect(() => confirmedConsequence({ ...draft, role: "creates-opportunity" }, position)).toThrow("adverse");
  expect(() => confirmedConsequence({ ...draft, evidence: { ...draft.evidence, scope: "conditional-contribution" } }, position)).toThrow("adverse");
});
