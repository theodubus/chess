import { Chess } from "chess.js";
import { expect, it } from "vitest";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { uci } from "./context";
import { delayedTacticInput } from "./delayedTacticCases";
import { tacticalTimeline } from "./delayedTactics";
import { DelayedTacticVerification } from "./DelayedTacticVerification";

type Mode = "normal" | "no-gap" | "changed" | "hold";
function input(id = "delayed-fork") {
  const source = delayedTacticInput(id), event = tacticalTimeline(source.context).events.find(e => e.kind === "double-threat")!;
  return { source, request: { review: {}, revision: 0, engineId: "simulated", position: source.position, event: { key: event.key, ply: event.ply } } };
}
// Ces scores inventés vérifient le protocole et les refus, pas les échecs.
class DelayedEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = "";
  disposed = false;
  constructor(private data: ReturnType<typeof input>, private mode: Mode) {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (!command.startsWith("go ") || this.mode === "hold") return;
    const { context, test } = this.data.source, black = test.id === "delayed-fork-black";
    let moves: string[], actorScore = 0;
    if (this.command === context.before.command) moves = [test.alternative!];
    else if (this.command === context.after.command) {
      moves = test.line;
      if (this.mode === "changed" && command.endsWith("20")) moves = moves.slice(0, 1);
      actorScore = this.mode === "no-gap" ? 0 : -500;
    } else moves = black ? ["Rb8+", "Ke7", "Nf5+", "Kf6"] : ["Rg1+", "Kd2", "Nc4+", "Kc3"];
    const board = boardFromCommand(this.command), turn = board.turn();
    const pv = moves.map(m => uci(board.move(m))), score = actorScore * (black ? -1 : 1) * (turn === "w" ? 1 : -1);
    this.listener(`info depth 15 score cp ${score} pv ${pv.join(" ")}`);
    this.listener(`bestmove ${pv[0]}`);
  }
}
it.each(["delayed-fork", "delayed-fork-black"])("corrobore deux suites libres sans publier ni prouver toutes les défenses : %s", async id => {
  const data = input(id), engines: DelayedEngine[] = [];
  const report = await new DelayedTacticVerification([10, 20]).verify(data.request, async () => {
    const e = new DelayedEngine(data, "normal"); engines.push(e); return e;
  });
  expect(report).toMatchObject({ status: "corroborated-candidate", reason: "matching-lines", publishable: false, searches: 6 });
  expect(report!.passes.map(p => p.effect!.evidence.materialDelta)).toEqual([-5, -5]);
  expect(report!.passes.map(p => p.alternativeEvidence!.materialDelta)).toEqual([0, 0]);
  for (const p of report!.passes) for (const q of p.questions) {
    expect(boardFromCommand(q.position.command).fen()).toBe(q.position.fen);
    const board = new Chess(q.position.fen);
    for (const m of q.result.variation) expect(board.move({ from: m.from, to: m.to })?.after).toBe(m.fen);
  }
  expect(engines.every(e => e.disposed)).toBe(true);
});
it.each(["no-gap", "changed"] as const)("refuse les recherches insuffisantes : %s", async mode => {
  const data = input();
  const report = await new DelayedTacticVerification([10, 20]).verify(data.request, async () => new DelayedEngine(data, mode));
  expect(report).toMatchObject({ status: "unconfirmed", publishable: false, reason: mode === "no-gap" ? "unstable-search" : "motif-changed" });
});
it("cache le rapport par revue, révision et moteur ; arrête la recherche sans publication", async () => {
  const data = input(), verification = new DelayedTacticVerification([10, 20]);
  const factory = async () => new DelayedEngine(data, "normal");
  await verification.verify(data.request, factory);
  expect(await verification.verify(data.request, factory)).toMatchObject({ cached: true, searches: 0, publishable: false });
  expect(await verification.verify({ ...data.request, engineId: "other" }, factory)).toMatchObject({ cached: false, searches: 6 });
  const pending = verification.verify({ ...data.request, revision: 1 }, async () => new DelayedEngine(data, "hold"));
  await new Promise(resolve => setTimeout(resolve, 0));
  verification.stop();
  expect(await pending).toBeNull(); expect(verification.state).toBe("stopped");
});
