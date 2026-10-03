import { expect, it, vi } from "vitest";
import { corpus, corpusInput } from "./corpus";
import { externalCorpus } from "./externalCorpus";
import { understandDecision } from "./prototype";
import { UnderstandingAnalysis, type UnderstandingRequest } from "./UnderstandingAnalysis";
import * as context from "./context";

function request(id = "queen-closes-retreat"): UnderstandingRequest {
  const test = corpus.find((c) => c.id === id)!;
  const { position, result } = corpusInput(test);
  return { review: {}, revision: 0, engineId: "script", position, result };
}
it("conserve tous les faits et l'ordre des 31 décisions en cédant la main à l'interface", async () => {
  const check = new UnderstandingAnalysis(3), phases = new Set<string>();
  check.subscribe(() => phases.add(check.phase));
  let yielded = false;
  const timer = setTimeout(() => { yielded = true; }, 0);
  try {
    for (const test of [...corpus, ...externalCorpus]) {
      const input = { ...request(), ...corpusInput(test) };
      const result = await check.analyse(input);
      expect(result, `${test.id}: ${check.error}`).not.toBeNull();
      expect(JSON.stringify(result)).toBe(JSON.stringify(understandDecision(input.position, input.result)));
      expect(result!.context.moves.every((m) => typeof m.isEnPassant === "function" && typeof m.isKingsideCastle === "function")).toBe(true);
      expect(check.state).toBe("complete");
    }
    expect(yielded).toBe(true);
    expect(phases.has("possibilities")).toBe(true);
    expect(phases.has("relations")).toBe(true);
    expect(phases.has("tactics")).toBe(true);
  } finally { clearTimeout(timer); check.stop(); }
}, 30000);
it("annule avant publication et empêche une ancienne extraction d'écraser la nouvelle", async () => {
  const check = new UnderstandingAnalysis(1), first = request();
  let stopped = false;
  const off = check.subscribe(() => {
    if (check.state === "running" && check.phase === "possibilities" && !stopped) {
      stopped = true; check.stop();
    }
  });
  expect(await check.analyse(first)).toBeNull();
  expect(check.state).toBe("stopped");
  expect(check.resultFor(first)).toBeNull();
  off();
  const old = check.analyse(first), next = { ...first, revision: 1 };
  const fresh = check.analyse(next);
  expect(await old).toBeNull();
  expect(await fresh).not.toBeNull();
  expect(check.matches(next)).toBe(true);
  expect(check.matches(first)).toBe(false);
  expect(check.state).toBe("complete");
});
it("une interruption pendant le retour de cache ne rend pas de résultat tardif", async () => {
  const check = new UnderstandingAnalysis(), input = request();
  expect(await check.analyse(input)).not.toBeNull();
  const off = check.subscribe(() => { if (check.cached) check.stop(); });
  expect(await check.analyse(input)).toBeNull();
  off();
});
it("prend un instantané des entrées et rend le cache immuable sans perdre les méthodes des coups", async () => {
  const check = new UnderstandingAnalysis(1), input = request();
  const snapshot = structuredClone({ position: input.position, result: input.result });
  const pending = check.analyse(input);
  input.position.command = "position startpos";
  if (input.result) input.result.variation.length = 0;
  const result = await pending;
  expect(result).not.toBeNull();
  const original = { ...input, ...snapshot };
  expect(check.matches(original)).toBe(true);
  expect(check.matches(input)).toBe(false);
  expect(() => result!.context.moves.pop()).toThrow();
  expect(result!.context.moves[0].isEnPassant()).toBe(false);
  const cached = await check.analyse(original);
  expect(cached).toBe(result);
  expect(check.cached).toBe(true);
  expect(check.slices).toBe(0);
});
it("le cache distingue moteur, révision, revue, historique et continuation et reste borné", async () => {
  const check = new UnderstandingAnalysis(8, 12000, 2), input = request();
  const original = await check.analyse(input);
  expect(check.resultFor(input)).toBe(original);
  const otherEngine = { ...input, engineId: "other" };
  expect(check.resultFor(otherEngine)).toBeNull();
  expect(check.resultFor({ ...input, review: {} })).toBeNull();
  expect(check.resultFor({ ...input, position: { ...input.position, command: input.position.command + " moves" } })).toBeNull();
  expect(check.resultFor({ ...input, result: null })).toBeNull();
  const revised = { ...input, revision: 1 };
  expect(await check.analyse(revised)).not.toBeNull();
  expect(await check.analyse(otherEngine)).not.toBeNull();
  expect(check.cached).toBe(false);
  expect(check.resultFor(input)).toBeNull();
  expect(check.resultFor(revised)).not.toBeNull();
});
it("vérifie le délai après une primitive synchrone avant de publier ou mémoriser", async () => {
  const check = new UnderstandingAnalysis(8, 10), input = request();
  let clock = 0;
  const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
  const realContext = context.decisionContext;
  const primitive = vi.spyOn(context, "decisionContext").mockImplementation((...args) => {
    const facts = realContext(...args); clock = 20; return facts;
  });
  try {
    expect(await check.analyse(input)).toBeNull();
    expect(check.state).toBe("timed-out");
    expect(check.resultFor(input)).toBeNull();
  } finally { now.mockRestore(); primitive.mockRestore(); }
});
it("refuse une position incohérente sans résultat ni cache", async () => {
  const check = new UnderstandingAnalysis(), input = request();
  input.position.turn = input.position.turn === "w" ? "b" : "w";
  expect(await check.analyse(input)).toBeNull();
  expect(check.state).toBe("error");
  expect(check.error).toContain("incohérents");
  expect(check.resultFor(input)).toBeNull();
});
