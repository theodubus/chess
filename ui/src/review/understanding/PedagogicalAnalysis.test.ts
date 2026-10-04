import { afterEach, expect, it, vi } from "vitest";
import { corpusInput, type CorpusCase } from "./corpus";
import { tacticalInput } from "./tacticalCases";
import { ScriptEngine as TacticalEngine, type Mode } from "./tacticalTestEngine";
import { mechanismCases, mechanismInput } from "./mechanismCases";
import { scripted, ScriptEngine as RelationEngine } from "./relationTestEngine";
import { PedagogicalAnalysis, pedagogicalSignature, type PedagogicalRequest } from "./PedagogicalAnalysis";
import { boardFromCommand } from "../StudyTree";
import { directExplanation } from "../directExplanation";
import { explainMove } from "../explanations";
import type { Category } from "../annotations";
import type { Engine } from "../../engine/Engine";
import { ignoredThreatInput, IgnoredThreatTestEngine } from "./ignoredThreatTestEngine";
import { movedPieceInput, MovedPieceTestEngine } from "./movedPieceTestEngine";

afterEach(() => vi.restoreAllMocks());
it.each(["white", "black"])("un mat adverse plus long n'interdit pas d'expliquer l'échange court : %s", async id => {
  const input = movedPieceInput(id), analysis = new PedagogicalAnalysis([10, 20]);
  const result = await analysis.analyse({ ...input.request, result: { ...input.source.result!, score: { kind: "mate", value: id === "white" ? -8 : 8, winner: id === "white" ? "b" : "w" } }, category: "blunder" }, async () => new MovedPieceTestEngine(input, "mate-loss"));
  expect(result, analysis.error).toMatchObject({ status: "supported", attempts: 1, searches: 6, checks: [{ family: "exposure", status: "supported" }] });
  expect(result!.consequence!.summary).toContain("−5 points");
  expect(result!.consequence!.summary).not.toMatch(/mat|forcé/i);
});
it.each(["white", "black"])("raccorde la pièce déplacée et perdue avec le vérificateur commun : %s", async id => {
  const input = movedPieceInput(id), analysis = new PedagogicalAnalysis([10, 20]);
  const result = await analysis.analyse({ ...input.request, result: { ...input.source.result!, score: { kind: "cp", value: id === "white" ? -500 : 500 } }, category: "blunder" }, async () => new MovedPieceTestEngine(input));
  expect(result, analysis.error).toMatchObject({ status: "supported", searches: 6 });
  expect(result!.checks).toMatchObject([{ family: "exposure", status: "supported" }]);
  expect(result!.consequence!.title).toBe("Une pièce exposée à une capture");
  expect(result!.consequence!.steps[0].fen).toBe(input.understanding.context.after.fen);
});
it.each(["white", "black"])("raccorde la menace ignorée au mauvais coup : %s", async id => {
  const input = ignoredThreatInput(id), analysis = new PedagogicalAnalysis([10, 20]);
  const result = await analysis.analyse({ ...input.request, result: { ...input.source.result!, score: { kind: "cp", value: id === "white" ? -500 : 500 } }, category: "blunder" }, async () => new IgnoredThreatTestEngine(input));
  expect(result, analysis.error).toMatchObject({ status: "supported", attempts: 1, searches: 6 });
  expect(result!.checks).toMatchObject([{ family: "ignored-threat", status: "supported" }]);
  expect(result!.consequence!.summary).toContain("sous la menace");
  expect(result!.consequence!.steps).toHaveLength(3);
});
function tacticalRequest(id = "allows-fork") {
  const input = tacticalInput(id), source = corpusInput(input.example.test);
  const request: PedagogicalRequest = { review: {}, revision: 0, engineId: "script", ...source, category: "blunder",
    result: { ...source.result!, score: { kind: "cp", value: source.position.turn === "w" ? -300 : 300 } } };
  const engines: TacticalEngine[] = [];
  const factory = (mode: Mode = "normal") => vi.fn(async () => {
    const engine = new TacticalEngine({ ...input, ...request }, id, mode); engines.push(engine); return engine;
  });
  return { request, engines, factory };
}
it.each(["allows-fork", "allows-fork-white", "allows-fork-false-defence", "byrne-allows-fork"])(
  "raccorde directement la conséquence adverse sans alternative : %s", async (id) => {
    const { request, engines, factory } = tacticalRequest(id), check = new PedagogicalAnalysis([10, 20]);
    const states: string[] = []; check.subscribe(() => states.push(check.state));
    const result = await check.analyse(request, factory());
    expect(result, check.error).toMatchObject({ status: "supported", attempts: 1, searches: 4 });
    const base = explainMove(request.position, null, request.result, null, false);
    const explanation = directExplanation(base, result!.consequence);
    expect(explanation.concrete).toBe(true);
    expect(explanation.comparison).toBeUndefined(); expect(explanation.candidate).toBeUndefined();
    expect(explanation.proof!.steps[0].command).toBe(request.position.command + (request.position.command.includes(" moves ") ? " " : " moves ") + request.position.played);
    expect(explanation.proof!.steps[0].move).toBeNull();
    expect(explanation.proof!.steps.at(-1)!.text).toMatch(/bilan|points/);
    for (const step of explanation.proof!.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
    expect(explanation.proof!.steps.length).toBeLessThanOrEqual(9);
    expect(states).toContain("extracting"); expect(states).toContain("verifying");
    expect(engines.every((e) => e.disposed)).toBe(true);
    const commands = engines.flatMap((e) => e.commands).filter((c) => c.startsWith("position "));
    expect(new Set(commands)).toEqual(new Set([request.position.command, explanation.proof!.steps[0].command]));
  }, 10000,
);
it.each(["defence-left", "line-left", "defence-left-mirror", "line-left-mirror"])(
  "raccorde défense retirée / ligne ouverte avec contrôle des reprises : %s", async (id) => {
    const test = mechanismCases.find((c) => c.id === id)!;
    expect(test).toBeDefined();
    const input = mechanismInput(test), source = corpusInput({ ...test, prefix: [] } as unknown as CorpusCase);
    const request: PedagogicalRequest = { ...source, review: {}, revision: 0, engineId: "script", category: "mistake",
      result: { ...source.result!, score: { kind: "cp", value: test.actualScore } } };
    const { results } = scripted(test, { ...request, ...input }), engines: RelationEngine[] = [];
    const check = new PedagogicalAnalysis([10, 20]);
    const result = await check.analyse(request, async () => { const e = new RelationEngine(results); engines.push(e); return e; });
    expect(result, check.error).toMatchObject({ status: "supported", searches: 6 });
    expect(result!.consequence!.summary).toContain("bilan depuis la décision");
    expect(result!.consequence!.steps[0].fen).toBe(input.understanding.context.after.fen);
    expect(engines.every((e) => e.disposed)).toBe(true);
    expect(engines.flatMap((e) => e.commands).filter((c) => c.startsWith("position ")).some((c) => c.endsWith(test.alternativeUci!))).toBe(false);
  },
);
it.each(["short", "drift", "compensation"] as const)("une recherche non confirmée ne ressuscite pas l'ancienne cause : %s", async (mode) => {
  const { request, factory } = tacticalRequest("byrne-allows-fork"), check = new PedagogicalAnalysis([10, 20]);
  const result = await check.analyse(request, factory(mode));
  expect(result, check.error).toMatchObject({ status: "unconfirmed", consequence: null });
  const base = { ...explainMove(request.position, null, request.result, null), concrete: true, summary: "ancienne cause",
    proof: { title: "ancienne", steps: [], truncated: false } };
  const fallback = directExplanation(base, result!.consequence);
  expect(fallback.concrete).toBe(false); expect(fallback.proof).toBeUndefined(); expect(fallback.candidate).toBeUndefined();
});
it("isole cache, instantané, moteurs, révisions et PV améliorées sans changer la révision", async () => {
  const { request, factory } = tacticalRequest(), check = new PedagogicalAnalysis([10, 20], 12000, 2), connect = factory();
  const snapshot = { ...request, position: structuredClone(request.position), result: structuredClone(request.result) };
  const pending = check.analyse(request, connect);
  request.result!.score = { kind: "cp", value: 1 };
  const result = await pending;
  expect(check.matches(snapshot)).toBe(true); expect(check.matches(request)).toBe(false);
  expect(result?.status).toBe("supported");
  expect(() => result!.consequence!.steps.pop()).toThrow();
  expect(await check.analyse(snapshot, connect)).toBe(result);
  expect(check.cached).toBe(true); expect(connect).toHaveBeenCalledTimes(4);
  const changed = { ...snapshot, result: { ...snapshot.result!, depth: 16 } };
  expect(pedagogicalSignature(changed)).not.toBe(pedagogicalSignature(snapshot));
  expect(check.resultFor(changed)).toBeNull();
  expect((await check.analyse(changed, connect))?.status).toBe("supported");
  expect(connect).toHaveBeenCalledTimes(8);
  expect(check.resultFor({ ...snapshot, engineId: "other" })).toBeNull();
  expect(check.resultFor({ ...snapshot, review: {} })).toBeNull();
  expect(check.resultFor({ ...snapshot, category: "good" })).toBeNull();
  expect(check.resultFor({ ...snapshot, position: { ...snapshot.position, played: "a8b8" } })).toBeNull();
  await check.analyse({ ...snapshot, revision: 1 }, connect);
  expect(check.resultFor(snapshot)).toBeNull();
});
it.each(["good", "best", "forced", "book"] as Category[])("le verdict %s n'ouvre aucune connexion", async (category) => {
  const { request, factory } = tacticalRequest(), connect = factory(), check = new PedagogicalAnalysis([10, 20]);
  expect(await check.analyse({ ...request, category }, connect)).toMatchObject({ attempts: 0, searches: 0, consequence: null });
  expect(connect).not.toHaveBeenCalled();
});
it("refuse l'entrée incohérente ou sans score/PV, sans connexion", async () => {
  const { request, factory } = tacticalRequest(), connect = factory(), check = new PedagogicalAnalysis([10, 20]);
  for (const result of [null, { ...request.result!, score: null }, { ...request.result!, variation: [] },
    { ...request.result!, score: { kind: "cp" as const, value: 300, bound: "lower" as const } }])
    expect((await check.analyse({ ...request, result }, connect))?.consequence).toBeNull();
  expect(await check.analyse({ ...request, position: { ...request.position, command: "position startpos" } }, connect)).toMatchObject({ status: "unavailable" });
  expect(connect).not.toHaveBeenCalled();
});
it("navigation et annulation empêchent une réponse tardive de remplacer le nouveau coup", async () => {
  const { request, engines, factory } = tacticalRequest(), check = new PedagogicalAnalysis([10, 20]);
  const connect = factory();
  const held = vi.fn(async () => { const e = await connect(); e.hold = true; return e; });
  const old = check.analyse(request, held);
  await vi.waitFor(() => expect(engines.some((e) => e.commands.some((c) => c.startsWith("go ")))).toBe(true));
  const next = { ...request, revision: 1 };
  const fresh = check.analyse(next, connect);
  expect(await old).toBeNull(); expect((await fresh)?.status).toBe("supported");
  expect(check.resultFor(request)).toBeNull(); expect(check.matches(next)).toBe(true);
  expect(engines.every((e) => e.disposed)).toBe(true);
  check.stop();
});
it("ferme aussi un moteur qui arrive après l'abandon du coup", async () => {
  const { request, factory } = tacticalRequest(), check = new PedagogicalAnalysis([10, 20]);
  let resolve!: (engine: Engine) => void;
  const connection = vi.fn(() => new Promise<Engine>((done) => { resolve = done; }));
  const pending = check.analyse(request, connection);
  await vi.waitFor(() => expect(connection).toHaveBeenCalledTimes(1));
  check.stop();
  const late = await factory()(); resolve(late);
  expect(await pending).toBeNull(); expect(late.disposed).toBe(true);
  expect(late.commands.some((c) => c.startsWith("go "))).toBe(false);
  expect(check.resultFor(request)).toBeNull(); expect(check.state).toBe("stopped");
});
it("le délai commun coupe une connexion bloquée et les dépassements synchrones", async () => {
  const { request, engines, factory } = tacticalRequest(), check = new PedagogicalAnalysis([10, 20], 500);
  const connect = factory();
  expect(await check.analyse(request, async () => { const e = await connect(); e.hold = true; return e; })).toBeNull();
  expect(check.state).toBe("timed-out"); expect(engines.every((e) => e.disposed)).toBe(true);
  expect(check.resultFor(request)).toBeNull();
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const next = new PedagogicalAnalysis([10, 20], 50), connection = vi.fn(async () => connect());
  next.subscribe(() => { if (next.state === "verifying") elapsed = 51; });
  expect(await next.analyse(request, connection)).toBeNull();
  expect(next.state).toBe("timed-out"); expect(connection).not.toHaveBeenCalled();
});
it("un listener qui interrompt la publication ne reçoit pas un résultat tardif", async () => {
  const { request, factory } = tacticalRequest(), check = new PedagogicalAnalysis([10, 20]);
  const off = check.subscribe(() => { if (check.state === "complete") check.stop(); });
  expect(await check.analyse(request, factory())).toBeNull();
  off();
});
