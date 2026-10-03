import { expect, it, vi } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { decisionContext } from "./context";
import { tacticalConstraints } from "./constraints";
import { framePosition } from "./evidence";
import { tacticalInput } from "./tacticalCases";
import { TacticalVerification, type TacticalRequest } from "./TacticalVerification";
import { ScriptEngine, type Mode } from "./tacticalTestEngine";

function request(id = "byrne-22"): TacticalRequest {
  const { understanding, hypothesisIndex, alternative } = tacticalInput(id);
  return { review: {}, revision: 0, engineId: "script", understanding, hypothesisIndex, alternative };
}
async function verify(id: string, mode: Mode = "normal") {
  const req = request(id), check = new TacticalVerification([10, 20]);
  const engines: ScriptEngine[] = [];
  const report = await check.verify(req, async () => { const engine = new ScriptEngine(req, id, mode); engines.push(engine); return engine; });
  expect(report, check.error).not.toBeNull();
  expect(engines.every((e) => e.disposed)).toBe(true);
  expect(engines.flatMap((e) => e.commands).some((c) => /MultiPV|searchmoves/.test(c))).toBe(false);
  expect(report!.searches).toBeLessThanOrEqual(10);
  expect(report!.explanation).toBeNull();
  return report!;
}

it.each(["fork-direct", "fork-black"])("vérifie les deux cibles et la réponse libre à l'échec : %s", async (id) => {
  const report = await verify(id);
  expect(report).toMatchObject({ status: "supported", reason: "material-loss", attribution: { status: "supported", reason: "double-targets" }, searches: 6 });
  expect(report.passes.every((p) => p.actual.evidence.moves.length === 2 && p.contrast.evidence?.outcome === "preserved")).toBe(true);
});
it("la fourchette échange un défenseur puis permet une autre prise, sans renommer l'échange égal", async () => {
  const report = await verify("byrne-22");
  expect(report).toMatchObject({ status: "supported", attribution: { status: "supported", reason: "exchanged-defender" }, searches: 8, requestedSearchMs: 120 });
  expect(report.passes.every((p) => p.actual.exchange?.balance === 0 && p.contrast.followUp?.usedDefender === "w:n:b1")).toBe(true);
  expect(report.passes[0].questions.map((q) => q.purpose)).toEqual(["decision", "played", "alternative", "restored-defender"]);
});
it("le clouage contribue à la perte seulement quand la même pression permet ailleurs une retraite choisie", async () => {
  const report = await verify("pin-retreat");
  expect(report).toMatchObject({ status: "supported", attribution: { status: "supported", reason: "blocked-retreat" }, searches: 6 });
  expect(report.passes.every((p) => p.contrast.usedRetreat === "c6b4" && p.actual.evidence.materialDelta === -2)).toBe(true);
});
it("une défense du roi retirée ne devient pas une explication par la seule immobilité du cavalier", async () => {
  const report = await verify("pin-defence-changed");
  expect(report).toMatchObject({ status: "supported", attribution: { status: "not-established", reason: "contrast-not-used" } });
  expect(report.passes.every((p) => p.contrast.reason === "pressure-changed" && p.contrast.evidence === null)).toBe(true);
});
it("sépare la réponse libre et la même menace après une autre décision humaine", async () => {
  const report = await verify("byrne-allows-fork");
  expect(report).toMatchObject({ status: "supported", attribution: { status: "supported", reason: "exchanged-defender" }, searches: 10 });
  expect(report.passes.every((p) => p.contrast.scope === "conditional-same-threat" && p.contrast.evidence?.outcome === "preserved")).toBe(true);
  expect(report.passes[0].questions.map((q) => q.purpose)).toEqual(["decision", "played", "alternative", "same-threat", "restored-defender"]);
});
it.each([
  ["byrne-22", "compensation", "compensation"],
  ["byrne-22", "short", "unresolved"],
  ["byrne-22", "drift", "unstable-search"],
  ["byrne-allows-fork", "different-threat", "different-line"],
] as const)("refuse de soutenir le gain matériel ou la cause : %s / %s", async (id, mode, reason) => {
  expect(await verify(id, mode)).toMatchObject({ status: "indeterminate", reason, attribution: { status: "not-established" } });
});
it.each([
  ["byrne-22", "no-gap", "score-gap-missing"],
  ["pin-retreat", "no-retreat", "contrast-not-used"],
  ["byrne-22", "unused-defender", "contrast-not-used"],
] as const)("un effet réel ne suffit pas à attribuer sa cause : %s / %s", async (id, mode, reason) => {
  expect(await verify(id, mode)).toMatchObject({ status: "supported", attribution: { status: "not-established", reason } });
});
it("refuse les alternatives absentes, identiques ou illégales avant connexion", async () => {
  const req = request("fork-direct"), check = new TacticalVerification([10, 20]);
  const factory = vi.fn(async () => new ScriptEngine(req, "fork-direct"));
  for (const alternative of ["", "d5c7", "d5d7", "d5b6q"])
    await expect(check.verify({ ...req, alternative }, factory)).rejects.toThrow();
  expect(factory).not.toHaveBeenCalled();
});
it("le cache reste lié au moteur, à la révision, à l'historique et à l'alternative", async () => {
  const req = request("fork-direct"), check = new TacticalVerification([10, 20]);
  const factory = vi.fn(async () => new ScriptEngine(req, "fork-direct"));
  expect((await check.verify(req, factory))?.cached).toBe(false);
  expect((await check.verify(req, factory))?.cached).toBe(true);
  expect(factory).toHaveBeenCalledTimes(6);
  expect((await check.verify({ ...req, revision: 1 }, factory))?.cached).toBe(false);
  expect((await check.verify({ ...req, engineId: "other" }, factory))?.cached).toBe(false);
  const changed = { ...req, alternative: "d5b4" };
  const compared = await check.verify(changed, async () => new ScriptEngine(changed, "fork-direct"));
  expect(compared).toMatchObject({ cached: false, attribution: { status: "not-established" } });
  const board = boardFromCommand(req.understanding.context.before.command);
  for (const move of ["Kg1", "Kf8", "Kh1", "Ke8"]) board.move(move);
  const context = decisionContext({ ...framePosition(req.understanding.context.before), fen: board.fen(),
    command: req.understanding.context.before.command + " moves h1g1 e8f8 g1h1 f8e8", played: "d5c7" });
  const constraints = tacticalConstraints(context);
  const historical = { ...req, understanding: { context, constraints }, hypothesisIndex: constraints.hypotheses.findIndex((h) => h.kind === "double-threat") };
  expect((await check.verify(historical, async () => new ScriptEngine(historical, "fork-direct")))?.cached).toBe(false);
});
it("annule aussi une question de cause en cours sans publier de résultat tardif", async () => {
  const req = request("fork-direct"), check = new TacticalVerification([10, 20]);
  const engine = new ScriptEngine(req, "fork-direct"); engine.hold = true;
  const pending = check.verify(req, async () => engine);
  await vi.waitFor(() => expect(engine.commands.some((c) => c.startsWith("go "))).toBe(true));
  check.stop();
  expect(await pending).toBeNull();
  expect(check.state).toBe("stopped");
  expect(engine.disposed).toBe(true);
});
