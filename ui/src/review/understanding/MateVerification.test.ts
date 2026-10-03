import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { corpusInput } from "./corpus";
import { externalCorpus } from "./externalCorpus";
import { decisionContext } from "./context";
import { tacticalConstraints } from "./constraints";
import { MateVerification, type MateRequest } from "./MateVerification";

function request(mirror = false): MateRequest {
  const test = externalCorpus.find((c) => c.id === "morphy-31")!;
  const { position, result } = corpusInput(mirror ? {
    ...test, fen: "2kr4/ppp2ppp/1q6/4p3/4P1b1/4Q3/P2N1PPP/4KB1R b K - 0 16",
    prefix: [], played: "Qb1+", line: ["Nxb1", "Rd1#"],
  } : test);
  const context = decisionContext(position, result);
  const understanding = { context, constraints: tacticalConstraints(context) };
  return {
    review: {}, revision: 0, engineId: "script", understanding,
    hypothesisIndex: understanding.constraints.hypotheses.findIndex((h) => h.kind === "deflection-mate"),
    alternative: mirror ? "b6a6" : "b3a3",
  };
}
class ScriptEngine implements Engine {
  listener: (line: string) => void = () => {};
  board = new Chess();
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(private req: MateRequest, private mode: "normal" | "short" | "cp" | "other-choice" | "different-line" | "distance" | "wrong-winner" = "normal") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) { this.board = boardFromCommand(command); this.command = command; }
    if (!command.startsWith("go ") || this.hold) return;
    const context = this.req.understanding.context;
    const reply = this.req.understanding.constraints.shortMate!.replies[0];
    let moves: string[], score: string;
    if (this.command === context.before.command) {
      moves = this.mode === "other-choice" ? ["b3e3"] : [context.moves[context.decision].lan, reply.move, reply.mates[0]];
      score = "mate 2";
    } else if (this.command === context.after.command) {
      moves = this.mode === "short" ? [reply.move] : this.mode === "different-line" ? [reply.move, "d1d2"] : [reply.move, reply.mates[0]];
      score = this.mode === "cp" ? "cp -500" : this.mode === "distance" ? "mate -2" : this.mode === "wrong-winner" ? "mate 1" : "mate -1";
    } else {
      moves = [this.board.moves({ verbose: true })[0].lan];
      score = "cp -500";
    }
    this.listener(`info depth 15 score ${score} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
afterEach(() => vi.useRealTimers());

it("compare librement avant/après et alternative, en gardant preuve et illustration minimales", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const engines: ScriptEngine[] = [];
  const report = await check.verify(req, async () => { const e = new ScriptEngine(req); engines.push(e); return e; });
  expect(report, check.error).toMatchObject({ status: "supported", reason: "short-mate-confirmed", quality: "best-choice-in-these-searches", contrast: { status: "short-route-absent", retainedBlocker: true }, searches: 6, requestedSearchMs: 90, explanation: null });
  expect(report!.passes.map((p) => p.illustration)).toEqual([["d7b8", "d1d8"], ["d7b8", "d1d8"]]);
  expect(report!.passes.every((p) => p.questions.map((q) => q.purpose).join() === "decision,played,alternative")).toBe(true);
  expect(engines.every((e) => e.disposed)).toBe(true);
  expect(engines.flatMap((e) => e.commands).some((c) => /searchmoves|MultiPV/.test(c))).toBe(false);
  expect(report!.contrast.proof.counterexample).toBeTruthy();
});
it.each(["different-line", "cp", "distance", "wrong-winner"] as const)("la preuve légale n'est pas une confirmation moteur si sa réponse diverge : %s", async (mode) => {
  const req = request(), check = new MateVerification([10, 20]);
  const report = await check.verify(req, async () => new ScriptEngine(req, mode));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason: "engine-line-differs", quality: "not-established", contrast: { status: "not-established" }, proof: { status: "proved" }, explanation: null });
  expect(report!.passes.every((p) => p.illustration.length === 0)).toBe(true);
});
it("complète une PV manquante seulement avec le mat immédiat prouvé, en gardant son origine", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const report = await check.verify(req, async () => new ScriptEngine(req, "short"));
  expect(report, check.error).toMatchObject({ status: "supported", explanation: null });
  expect(report!.passes.every((p) => p.continuation === "rules-completed" && p.illustration.join(" ") === "d7b8 d1d8")).toBe(true);
  expect(report!.passes.every((p) => p.questions.find((q) => q.purpose === "played")!.result.variation.length === 1)).toBe(true);
});
it("le même mat après la décision ne suffit pas à dire que le moteur préfère ce coup", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const report = await check.verify(req, async () => new ScriptEngine(req, "other-choice"));
  expect(report, check.error).toMatchObject({ status: "supported", quality: "not-established", explanation: null });
});
it("compare les mats sans inverser le gagnant quand le moteur joue les Noirs", async () => {
  const req = request(true), check = new MateVerification([10, 20]);
  const report = await check.verify(req, async () => new ScriptEngine(req));
  expect(report, check.error).toMatchObject({ status: "supported", quality: "best-choice-in-these-searches", explanation: null });
  expect(report!.passes.every((p) => p.illustration.join(" ") === "d2b1 d8d1")).toBe(true);
  expect(report!.passes.every((p) => p.questions.find((q) => q.purpose === "played")!.result.score?.winner === "b")).toBe(true);
});
it("le cache distingue historique, moteur et révision", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const factory = vi.fn(async () => new ScriptEngine(req));
  expect((await check.verify(req, factory))?.searches).toBe(6);
  expect((await check.verify(req, factory))?.cached).toBe(true);
  expect(factory).toHaveBeenCalledTimes(6);
  expect((await check.verify({ ...req, engineId: "other" }, factory))?.cached).toBe(false);
  expect((await check.verify({ ...req, revision: 1 }, factory))?.cached).toBe(false);
  const { position } = corpusInput(externalCorpus.find((c) => c.id === "morphy-31")!);
  const context = decisionContext({ ...position, command: `position fen ${position.fen}` });
  const constraints = tacticalConstraints(context);
  const truncated = { ...req, understanding: { context, constraints }, hypothesisIndex: constraints.hypotheses.findIndex((h) => h.kind === "deflection-mate") };
  expect((await check.verify(truncated, async () => new ScriptEngine(truncated)))?.cached).toBe(false);
});
it("refuse une alternative absente, illégale ou identique avant toute connexion", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const factory = vi.fn(async () => new ScriptEngine(req));
  for (const alternative of ["", "b3b8", "b3b7q", "a1a8"])
    await expect(check.verify({ ...req, alternative }, factory)).rejects.toThrow();
  expect(factory).not.toHaveBeenCalled();
});
it("n'étend pas ce vérificateur de mat à une simple menace conditionnelle", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const hypothesisIndex = req.understanding.constraints.hypotheses.findIndex((h) => h.kind === "mate-threat");
  await expect(check.verify({ ...req, hypothesisIndex }, async () => new ScriptEngine(req))).rejects.toThrow("Déviation");
});
it.each([
  { alternative: "d1d7", retainedBlocker: false },
  { alternative: "d1d2", retainedBlocker: true },
])("une alternative qui prend le bloqueur ou déplace l'attaquant n'est pas le même contraste : $alternative", async ({ alternative, retainedBlocker }) => {
  const req = { ...request(), alternative }, check = new MateVerification([10, 20]);
  const report = await check.verify(req, async () => new ScriptEngine(req));
  expect(report, check.error).toMatchObject({ status: "supported", contrast: { retainedBlocker, retainedRoute: false, status: "not-established" }, explanation: null });
});
it("annule la recherche sans résultat tardif", async () => {
  const req = request(), check = new MateVerification([10, 20]);
  const e = new ScriptEngine(req); e.hold = true;
  const pending = check.verify(req, async () => e);
  await vi.waitFor(() => expect(e.commands.some((c) => c.startsWith("go "))).toBe(true));
  check.stop();
  expect(await pending).toBeNull();
  expect(check.state).toBe("stopped");
  expect(e.disposed).toBe(true);
});
