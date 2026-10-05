import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { LiveStudy } from "../review/LiveStudy";
import { boardFromCommand } from "../review/StudyTree";
import { importProblem } from "./importProblem";
import { isCompleteMateLine } from "../review/completeMateLine";

afterEach(() => vi.restoreAllMocks());

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

const pitschelFen = "r5rk/2p1Nppp/3p3P/pp2p1P1/4P3/2qnPQK1/8/R6R w - - 0 1";
// Variante réellement émise par ShallowRed ; le roi reprend en g7, pas la tour.
const truncatedMate = ["h6g7", "h8g7", "h1h7", "g7h7", "f3f7", "g8g7"];
type Answer = { score: string; pv: string[]; delayed?: boolean };
class ContinuationEngine extends SolverEngine {
  next = 0;
  constructor(private answers: Answer[], private beforeAnswer = () => {}) { super(""); }
  answer() {
    const answer = this.answers[this.next];
    if (!answer) throw new Error("Recherche supplémentaire inattendue");
    if (answer.delayed) return;
    this.next++;
    this.beforeAnswer();
    this.listener(`info depth ${this.next === 1 ? 9 : 17} score ${answer.score} pv ${answer.pv.join(" ")}`);
    this.listener(`bestmove ${answer.pv[0]}`);
  }
}

it("complète la variante de Pitschel jusqu'au mat sans changer le score ni la profondeur de départ", async () => {
  const engine = new ContinuationEngine([
    { score: "mate 4", pv: truncatedMate },
    { score: "mate 1", pv: ["a1h1"] },
  ]), study = new LiveStudy(), source = importProblem(pitschelFen);
  await study.analyse(source.position.command, async () => engine, 30000, { completeMateLine: true });
  expect(study.state).toBe("complete");
  expect(study.result?.variation).toHaveLength(7);
  expect(study.result?.variation.at(-1)?.label).toBe("4. Th1#");
  expect(isCompleteMateLine(study.result!.score, "w", study.result!.variation)).toBe(true);
  expect(study.result?.score).toEqual({ kind: "mate", value: 4, winner: "w" });
  expect(study.result?.depth).toBe(9); expect(study.info?.depth).toBe(9);
  expect(engine.commands.filter(c => c.startsWith("position "))).toEqual([
    source.position.command, `${source.position.command} moves ${truncatedMate.join(" ")}`,
  ]);
  expect(engine.disposed).toBe(true);
});

it("ne complète pas les recherches d'analyse ordinaires sans l'option de résolution", async () => {
  const engine = new ContinuationEngine([{ score: "mate 4", pv: truncatedMate }]), study = new LiveStudy();
  await study.analyse(importProblem(pitschelFen).position.command, async () => engine);
  expect(study.result?.variation).toHaveLength(6);
  expect(engine.next).toBe(1);
});

it("partage un seul budget entre les recherches successives, même avec plusieurs fins de PV tronquées", async () => {
  let now = 100;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const engine = new ContinuationEngine([
    { score: "mate 4", pv: truncatedMate.slice(0, 1) },
    { score: "mate -3", pv: truncatedMate.slice(1) },
    { score: "mate 1", pv: ["a1h1"] },
  ], () => { now += 100; }), study = new LiveStudy();
  await study.analyse(importProblem(pitschelFen).position.command, async () => engine, 1000, { completeMateLine: true });
  expect(engine.commands.filter(c => c.startsWith("go "))).toEqual([
    "go movetime 1000", "go movetime 900", "go movetime 800",
  ]);
  expect(isCompleteMateLine(study.result!.score, "w", study.result!.variation)).toBe(true);
});

it("laisse la suite partielle quand le budget est épuisé, sans ajouter de coups ni attendre artificiellement", async () => {
  let now = 100;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const engine = new ContinuationEngine([{ score: "mate 4", pv: truncatedMate }], () => { now += 1000; });
  const study = new LiveStudy();
  await study.analyse(importProblem(pitschelFen).position.command, async () => engine, 1000, { completeMateLine: true });
  expect(engine.next).toBe(1); expect(study.result?.variation).toHaveLength(6);
  expect(isCompleteMateLine(study.result!.score, "w", study.result!.variation)).toBe(false);
});

it.each(["cp 20", "mate -1", "mate 2", "mate 1 lowerbound"])(
  "n'ajoute pas une fin de suite qui ne confirme pas le mat initial (%s)", async score => {
    const engine = new ContinuationEngine([
      { score: "mate 4", pv: truncatedMate }, { score, pv: ["a1h1"] },
    ]), study = new LiveStudy();
    await study.analyse(importProblem(pitschelFen).position.command, async () => engine, 3000, { completeMateLine: true });
    expect(study.state).toBe("complete"); expect(study.result?.variation).toHaveLength(6);
    expect(isCompleteMateLine(study.result!.score, "w", study.result!.variation)).toBe(false);
    expect(study.result?.score?.value).toBe(4);
  },
);

it("garde les coups PGN précédents et le bon camp quand la position de départ annonce un mat subi", async () => {
  const board = new Chess(pitschelFen); board.move("hxg7+");
  const source = importProblem(board.pgn(), "final"), study = new LiveStudy();
  const engine = new ContinuationEngine([
    { score: "mate -3", pv: truncatedMate.slice(1) }, { score: "mate 1", pv: ["a1h1"] },
  ]);
  await study.analyse(source.position.command, async () => engine, 1000, { completeMateLine: true });
  expect(study.result?.score).toEqual({ kind: "mate", value: 3, winner: "w" });
  expect(isCompleteMateLine(study.result!.score, "b", study.result!.variation)).toBe(true);
  expect(engine.commands.filter(c => c.startsWith("position ")).at(-1)).toBe(
    `${source.position.command} ${truncatedMate.slice(1).join(" ")}`,
  );
});

it("permet d'arrêter la complétion, sans afficher le score de la fin de la variante à la place du score de départ", async () => {
  const engine = new ContinuationEngine([
    { score: "mate 4", pv: truncatedMate }, { score: "mate 1", pv: ["a1h1"], delayed: true },
  ]), study = new LiveStudy();
  const pending = study.analyse(importProblem(pitschelFen).position.command, async () => engine, 1000, { completeMateLine: true });
  await vi.waitFor(() => expect(engine.commands.filter(c => c.startsWith("go "))).toHaveLength(2));
  expect(study.state).toBe("running"); expect(study.completingMate).toBe(true);
  engine.listener("info depth 17 score mate 1 pv a1h1");
  expect(study.info?.score?.value).toBe(4); expect(study.info?.depth).toBe(9);
  await study.stop(); engine.listener("bestmove a1h1"); await pending;
  expect(study.state).toBe("idle"); expect(study.completingMate).toBe(false);
  expect(study.result).toBeNull(); expect(engine.disposed).toBe(true);
});
