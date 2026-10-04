import { expect, it, vi } from "vitest";
import { confirmedConsequence, directExplanation } from "../directExplanation";
import { explainMove } from "../explanations";
import { boardFromCommand } from "../StudyTree";
import { mateConsequenceInput, MateConsequenceTestEngine } from "./mateConsequenceTestEngine";
import { MateConsequenceVerification } from "./MateConsequenceVerification";
import { mateConsequenceDraft } from "./mateConsequenceDraft";
import { eligibleConsequence, PedagogicalAnalysis } from "./PedagogicalAnalysis";
import { opposite } from "./context";

async function fixture(id = "fools-mate", mode: ConstructorParameters<typeof MateConsequenceTestEngine>[1] = "normal", nodes = 1200) {
  const { source, request } = mateConsequenceInput(id), checker = new MateConsequenceVerification([10, 20], 12000, nodes), engines: MateConsequenceTestEngine[] = [];
  const factory = vi.fn(async () => { const engine = new MateConsequenceTestEngine(source, mode); engines.push(engine); return engine; });
  const report = await checker.verify(request, factory);
  return { source, request, checker, factory, report, engines };
}
it.each(["fools-mate", "reverse-fools-mate", "quiet-mate", "two-defences", "legals-mate"])("confirme la route courte sans alternative : %s", async (id) => {
  const { report, checker, engines, source } = await fixture(id);
  expect(report, checker.error).toMatchObject({ status: "supported", reason: "forced-mate-confirmed", searches: 4, requestedSearchMs: 60 });
  const draft = mateConsequenceDraft(source.position, report!)!;
  expect(draft).toMatchObject({ family: "forced-mate", role: "allows-loss", alternative: [], evidence: { scope: "short-forcing-route", materialDelta: null } });
  const explanation = directExplanation(explainMove(source.position, null, source.result, null, false), confirmedConsequence(draft, source.position));
  expect(explanation.proof!.steps).toHaveLength(draft.played.length);
  expect(draft.played.length).toBeLessThanOrEqual(4);
  expect(draft.played[0].command.endsWith(` ${source.position.played}`)).toBe(true);
  expect(draft.played.at(-1)!.note).toContain("Aucune capture, interposition ou fuite légale");
  expect(boardFromCommand(draft.played.at(-1)!.command).isCheckmate()).toBe(true);
  expect(engines.every((e) => e.disposed)).toBe(true);
  expect(engines.flatMap((e) => e.commands).some((c) => /searchmoves|MultiPV/.test(c))).toBe(false);
  expect(draft.summary).not.toMatch(/gagnant|meilleur|seul bon/);
});
it("un mat annoncé avant la décision n'est pas attribué à celle-ci", async () => {
  const { report, source } = await fixture("quiet-mate", "pre-existing");
  expect(report).toMatchObject({ status: "indeterminate", reason: "pre-existing-mate" });
  expect(mateConsequenceDraft(source.position, report!)).toBeNull();
});
it.each(["cp", "wrong-winner", "drift"] as const)("ne publie pas une route prouvée sans deux annonces cohérentes : %s", async (mode) => {
  const { report, source } = await fixture("fools-mate", mode);
  expect(report).toMatchObject({ status: "indeterminate", reason: "mate-not-confirmed" });
  expect(mateConsequenceDraft(source.position, report!)).toBeNull();
});
it("une borne UCI finale est une réponse refusée, jamais une preuve", async () => {
  const { report, checker } = await fixture("fools-mate", "bound");
  expect(report).toBeNull(); expect(checker.state).toBe("error");
});
it("une PV tronquée est complétée explicitement et une PV non forcée reste inconnue", async () => {
  const short = await fixture("quiet-mate", "short"), draft = mateConsequenceDraft(short.source.position, short.report!)!;
  expect(draft.played.slice(1).map((s) => s.origin)).toEqual(["engine-line", "rules", "rules"]);
  expect(draft.limitation).toContain("pas attribués au moteur");
  const unforced = await fixture("unforced-line");
  expect(unforced.report).toMatchObject({ status: "indeterminate", reason: "mate-not-confirmed" });
  const limited = await fixture("two-defences", "normal", 2);
  expect(limited.report).toMatchObject({ status: "indeterminate", reason: "proof-incomplete" });
});
it("lie cache et rapport à l'historique, la révision et au moteur", async () => {
  const { checker, request, factory, report, source } = await fixture("two-defences");
  const cached = await checker.verify(request, factory);
  expect(cached).toMatchObject({ cached: true, searches: 0 }); expect(factory).toHaveBeenCalledTimes(4);
  cached!.passes[0].proof!.strategy!.branches.pop();
  expect((await checker.verify(request, factory))!.passes[0].proof!.strategy!.branches).toHaveLength(1);
  expect((await checker.verify({ ...request, revision: 1 }, factory))?.cached).toBe(false);
  expect((await checker.verify({ ...request, engineId: "other" }, factory))?.cached).toBe(false);
  const stale = structuredClone(report!); stale.passes[0].proof!.strategy!.branches[0].next.branches.pop();
  expect(() => mateConsequenceDraft(source.position, stale)).toThrow("incomplète");
  const invented = structuredClone(report!); invented.passes[0].witness!.origins[0] = "rules";
  expect(() => mateConsequenceDraft(source.position, invented)).toThrow("origine");
  const historical = await fixture();
  expect(() => mateConsequenceDraft({ ...historical.source.position, command: `position fen ${historical.source.position.fen}` }, historical.report!)).toThrow("autre décision");
});
it("arrêt et délai ferment la recherche sans résultat tardif", async () => {
  for (const stop of [true, false]) {
    const { source, request } = mateConsequenceInput(), checker = new MateConsequenceVerification([10, 20], stop ? 12000 : 50), engine = new MateConsequenceTestEngine(source);
    engine.hold = true;
    const pending = checker.verify(request, async () => engine);
    await vi.waitFor(() => expect(engine.commands.some((c) => c.startsWith("go "))).toBe(true), { interval: 1 });
    if (stop) checker.stop();
    expect(await pending).toBeNull(); expect(checker.state).toBe(stop ? "stopped" : "timed-out"); expect(engine.disposed).toBe(true);
  }
});
it("raccorde seulement les mauvais coups avec mat adverse court, et réutilise le résultat du coup", async () => {
  const { source, request } = mateConsequenceInput(), result = { ...source.result!, score: { kind: "mate" as const, value: -1, winner: opposite(source.position.turn) } },
    input = { ...request, result, category: "blunder" as const }, analysis = new PedagogicalAnalysis([10, 20]),
    factory = vi.fn(async () => new MateConsequenceTestEngine(source));
  expect(eligibleConsequence(input)).toBe(true);
  expect(await analysis.analyse(input, factory), analysis.error).toMatchObject({ status: "supported", attempts: 1, searches: 4 });
  expect((await analysis.analyse(input, factory))?.status).toBe("supported"); expect(analysis.cached).toBe(true); expect(factory).toHaveBeenCalledTimes(4);
  expect(eligibleConsequence({ ...input, result: { ...result, score: { ...result.score, value: -4 } } })).toBe(true);
  for (const score of [{ ...result.score, winner: source.position.turn }, { ...result.score, value: 0 }, { ...result.score, bound: "lower" as const }]) {
    expect(eligibleConsequence({ ...input, result: { ...result, score } })).toBe(false);
    expect((await analysis.analyse({ ...input, result: { ...result, score } }, factory))?.attempts).toBe(0);
  }
  expect(factory).toHaveBeenCalledTimes(4);
});
