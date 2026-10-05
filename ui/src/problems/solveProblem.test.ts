import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { LiveStudy } from "../review/LiveStudy";
import { boardFromCommand } from "../review/StudyTree";
import { importProblem } from "./importProblem";

class SolverEngine implements Engine {
  commands: string[] = [];
  board = new Chess();
  listener: (line: string) => void = () => {};
  disposed = false;
  constructor(private best: string, private score = "mate 1", private delayed = false) {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") { this.listener("id name Test"); this.listener("uciok"); }
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.board = boardFromCommand(command);
    if (command.startsWith("go ") && !this.delayed) this.answer();
  }
  answer() {
    this.listener(`info depth 12 score ${this.score} pv ${this.best}`);
    this.listener(`bestmove ${this.best}`);
  }
}

function problem() {
  const board = new Chess();
  for (const move of ["f3", "e5", "g4"]) board.move(move);
  return importProblem(board.fen());
}

it("cherche une solution UCI au trait noir et transforme le mat en suite légale française", async () => {
  const source = problem(), engine = new SolverEngine("d8h4"), study = new LiveStudy();
  await study.analyse(source.position.command, async () => engine, 3000);
  expect(engine.commands).toContain(source.position.command);
  expect(engine.commands).toContain("go movetime 3000");
  expect(study.state).toBe("complete");
  expect(study.result?.score).toEqual({ kind: "mate", value: -1, winner: "b" });
  expect(study.result?.bestSan).toBe("Dh4#");
  expect(new Chess(study.result!.variation[0].fen).isCheckmate()).toBe(true);
  expect(engine.disposed).toBe(true);
});

it("une recommandation évaluée en pions ne devient pas une annonce de mat", async () => {
  const study = new LiveStudy();
  await study.analyse(problem().position.command, async () => new SolverEngine("d8h4", "cp 500"));
  expect(study.result?.score).toEqual({ kind: "cp", value: -500 });
});

it("conserve la promotion conseillée dans la solution", async () => {
  const source = importProblem("7k/P7/8/8/8/8/7P/7K w - - 0 1"), study = new LiveStudy();
  await study.analyse(source.position.command, async () => new SolverEngine("a7a8n", "cp 300"));
  expect(study.result?.bestMove).toBe("a7a8n");
  expect(new Chess(study.result!.variation[0].fen).get("a8")?.type).toBe("n");
});

it("signale un moteur indisponible ou une réponse illégale sans produire une solution", async () => {
  const study = new LiveStudy(), source = problem();
  await study.analyse(source.position.command, async () => { throw Error("Connexion refusée"); });
  expect(study.state).toBe("error"); expect(study.result).toBeNull();
  await study.analyse(source.position.command, async () => new SolverEngine("e2e5"));
  expect(study.state).toBe("error"); expect(study.error).toContain("illégal");
  expect(study.result).toBeNull();
});

it("annule le calcul et ignore une réponse tardive", async () => {
  const study = new LiveStudy(), engine = new SolverEngine("d8h4", "mate 1", true);
  const pending = study.analyse(problem().position.command, async () => engine);
  await vi.waitFor(() => expect(engine.commands.some(c => c.startsWith("go "))).toBe(true));
  await study.stop(); engine.answer(); await pending;
  expect(engine.disposed).toBe(true); expect(study.state).toBe("idle"); expect(study.result).toBeNull();
});

it("une ancienne connexion ne peut pas remplacer la solution d’un autre problème", async () => {
  const study = new LiveStudy(), old = new SolverEngine("d8h4");
  let connect!: (engine: Engine) => void;
  const pending = study.analyse(problem().position.command, () => new Promise(resolve => { connect = resolve; }));
  await vi.waitFor(() => expect(connect).toBeDefined());
  const next = importProblem("7k/P7/8/8/8/8/7P/7K w - - 0 1");
  await study.analyse(next.position.command, async () => new SolverEngine("a7a8q", "cp 900"));
  connect(old); await pending;
  expect(old.disposed).toBe(true); expect(study.command).toBe(next.position.command);
  expect(study.result?.bestMove).toBe("a7a8q");
});

it("ne lance pas le moteur pour une position déjà terminée, répétition comprise", async () => {
  const board = new Chess();
  for (const san of ["f3", "e5", "g4", "Qh4#"]) board.move(san);
  const study = new LiveStudy(), factory = vi.fn(async () => new SolverEngine("0000"));
  await study.analyse(importProblem(board.fen()).position.command, factory);
  expect(factory).not.toHaveBeenCalled(); expect(study.result?.bestMove).toBeNull();
  const draw = new Chess();
  for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) draw.move(san);
  await study.analyse(importProblem(draw.pgn(), "final").position.command, factory);
  expect(factory).not.toHaveBeenCalled(); expect(study.result?.score).toEqual({ kind: "cp", value: 0 });
});
