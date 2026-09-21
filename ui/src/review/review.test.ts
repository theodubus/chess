import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { FakeEngine } from "../engine/FakeEngine";
import { parsePrincipalVariation } from "../engine/analysis";
import { GameReview } from "./GameReview";
import { estimatedLoss, gamePositions, legalVariation } from "./model";

function played(moves: string[]) {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return board;
}
const mate = () => played(["f3", "e5", "g4", "Qh4#"]);
class AnalysisEngine implements Engine {
  listener: (line: string) => void = () => {};
  commands: string[] = [];
  disposed = false;
  hold = false;
  malformed = false;
  scoreFor: ((time: number, board: Chess) => number | null) | null = null;
  board = new Chess();
  onLine(listener: (line: string) => void) {
    this.listener = listener;
    return () => {
      this.listener = () => {};
    };
  }
  async dispose() {
    this.disposed = true;
  }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") {
      this.listener("id name Analyse test");
      this.listener("uciok");
    }
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position startpos")) {
      this.board.reset();
      for (const move of command.split(" moves ")[1]?.split(" ") ?? [])
        this.board.move({
          from: move.slice(0, 2),
          to: move.slice(2, 4),
          promotion: move[4],
        });
    }
    if (command.startsWith("go") && !this.hold) {
      const move = this.board.moves({ verbose: true })[0];
      const uci = move.from + move.to + (move.promotion ?? "");
      const score = this.scoreFor
        ? this.scoreFor(Number(command.split(" ").at(-1)), this.board)
        : 100;
      if (score !== null)
        this.listener(`info depth 7 score cp ${score} pv ${uci}`);
      this.listener(`bestmove ${this.malformed ? "a1a8" : uci}`);
    }
  }
}
afterEach(() => vi.useRealTimers());

it("reconstruit chaque position sans modifier la partie, en gardant l’historique UCI complet", () => {
  const board = mate();
  expect(board.isCheckmate()).toBe(true);
  const fen = board.fen();
  const positions = gamePositions(board.pgn());
  expect(positions).toHaveLength(5);
  expect(positions[4].fen).toBe(fen);
  expect(positions[4].command).toBe(
    "position startpos moves f2f3 e7e5 g2g4 d8h4",
  );
  expect(positions[4].terminal).toEqual({
    kind: "mate",
    value: 0,
    winner: "b",
  });
  expect(positions[3].playedSan).toBe("Dh4#");
  expect(board.fen()).toBe(fen);
});

it("reconnaît une répétition grâce à l’historique et préserve une position initiale personnalisée", () => {
  const repeated = played([
    "Nf3",
    "Nf6",
    "Ng1",
    "Ng8",
    "Nf3",
    "Nf6",
    "Ng1",
    "Ng8",
  ]);
  expect(repeated.isThreefoldRepetition()).toBe(true);
  expect(gamePositions(repeated.pgn()).at(-1)?.terminal).toEqual({
    kind: "cp",
    value: 0,
  });
  const initial = played(["e4", "e5"]).fen();
  const custom = new Chess(initial);
  custom.move("Nf3");
  const positions = gamePositions(custom.pgn());
  expect(positions[0].fen).toBe(initial);
  expect(positions[1].command).toBe(`position fen ${initial} moves g1f3`);
});

it("valide toute la variante avant de la montrer et restitue le roque en SAN", () => {
  const board = played(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]);
  const fen = board.fen();
  board.move("O-O");
  const variation = legalVariation(fen, ["e1g1"]);
  expect(variation[0].fen).toBe(board.fen());
  expect(variation[0].label).toBe("4. O-O");
  expect(legalVariation(fen, ["e1g1", "a8a1"])).toEqual([]);
});

it("ne présente que des estimations comparables pour le camp qui joue", () => {
  const before = { kind: "cp" as const, value: 100 };
  const after = { kind: "cp" as const, value: -100 };
  expect(estimatedLoss(before, after, "w")).toBe(2);
  expect(estimatedLoss(after, before, "b")).toBe(2);
  expect(estimatedLoss(before, after, "b")).toBe(0);
  expect(estimatedLoss({ ...before, bound: "lower" }, after, "w")).toBeNull();
  expect(estimatedLoss(null, after, "w")).toBeNull();
  expect(
    estimatedLoss({ kind: "mate", value: 3, winner: "w" }, after, "w"),
  ).toBeNull();
});

it("écarte les commentaires, variantes secondaires et coups mal formés du protocole", () => {
  expect(
    parsePrincipalVariation("info depth 8 score cp 15 pv e2e4 e7e5"),
  ).toEqual(["e2e4", "e7e5"]);
  for (const line of [
    "info string pv e2e4",
    "info depth 4 string pv e2e4",
    "info multipv 2 pv e2e4",
    "info pv",
    "info pv e2e4 nope",
  ])
    expect(parsePrincipalVariation(line)).toBeNull();
});

it("analyse les deux camps, valide les coups et ne recherche pas une position terminale", async () => {
  const engine = new AnalysisEngine();
  const board = mate();
  const original = board.pgn();
  const review = new GameReview(original);
  await review.start(async () => engine, 100);
  expect(review.error).toBe("");
  expect(review.state).toBe("complete");
  expect(review.completed).toBe(5);
  expect(review.results[0]?.score?.value).toBe(100);
  expect(review.results[1]?.score?.value).toBe(-100);
  expect(review.results[0]?.depth).toBe(7);
  expect(review.results[0]?.variation).toHaveLength(1);
  expect(
    engine.commands.filter((command) => command === "go movetime 100"),
  ).toHaveLength(4);
  expect(
    engine.commands.filter((command) => command === "go movetime 1000"),
  ).toHaveLength(4);
  expect(review.verificationTotal).toBe(4);
  expect(review.verified.size).toBe(4);
  expect(engine.disposed).toBe(true);
  expect(board.pgn()).toBe(original);
});

it("permet d’arrêter la confirmation sans perdre la première passe, puis de relancer", async () => {
  const engine = new AnalysisEngine();
  const review = new GameReview(mate().pgn());
  const unsubscribe = review.subscribe(() => {
    if (review.phase === "verification") engine.hold = true;
  });
  const task = review.start(async () => engine, 100);
  await vi.waitFor(() => expect(engine.commands).toContain("go movetime 1000"));
  expect(review.state).toBe("running");
  expect(review.completed).toBe(5);
  const results = structuredClone(review.results);
  const late = engine.listener;
  await review.stop();
  late("info depth 99 score cp 900");
  late("bestmove e2e4");
  await task;
  expect(review.state).toBe("stopped");
  expect(review.results).toEqual(results);
  expect(review.verified.size).toBe(0);
  unsubscribe();
  await review.start(async () => new AnalysisEngine(), 100);
  expect(review.state).toBe("complete");
  expect(review.verified.size).toBe(4);
});

it("garde un score inconnu lorsqu’un moteur ne publie aucune évaluation", async () => {
  const review = new GameReview(mate().pgn());
  await review.start(async () => new FakeEngine(), 100);
  expect(review.state).toBe("complete");
  expect(review.results[0]?.score).toBeNull();
  expect(review.results[0]?.bestMove).toBeTruthy();
});

it("résout les scores contradictoires avec un budget ciblé et s’arrête dès que les coups sont classés", async () => {
  const engine = new AnalysisEngine();
  engine.scoreFor = (time) => (time >= 3000 ? 0 : -100);
  const game = played(["f3", "f6", "g4", "g5", "h3", "h6"]);
  const review = new GameReview(game.pgn());
  const searched: number[] = [];
  const affected = new Set<number>();
  let captured = false;
  review.subscribe(() => {
    if (review.phase === "resolution") {
      if (!captured) {
        captured = true;
        review.annotations.forEach((annotation, index) => {
          if (!annotation && review.positions[index].played) {
            affected.add(index);
            affected.add(index + 1);
          }
        });
      }
      searched.push(review.current);
    }
  });
  await review.start(async () => engine, 100);
  expect(review.state).toBe("complete");
  expect(review.unclassifiedCount).toBe(0);
  expect(
    engine.commands.filter((command) => command === "go movetime 3000"),
  ).toHaveLength(affected.size);
  expect(engine.commands).not.toContain("go movetime 6000");
  expect(searched.length).toBeGreaterThan(0);
});

it("borne les tentatives quand le moteur ne fournit toujours pas de score", async () => {
  const engine = new AnalysisEngine();
  engine.scoreFor = () => null;
  const review = new GameReview(played(["f3", "f6", "g4", "g5"]).pgn());
  await review.start(async () => engine, 100);
  expect(review.unclassifiedCount).toBeGreaterThan(0);
  const first = engine.commands.filter(
    (command) => command === "go movetime 3000",
  ).length;
  const second = engine.commands.filter(
    (command) => command === "go movetime 6000",
  ).length;
  expect(first).toBeGreaterThan(0);
  expect(second).toBe(first);
  expect(
    engine.commands.filter((command) => command.startsWith("go")),
  ).toHaveLength(review.positions.length + first + second);
  expect(review.state).toBe("complete");
});

it("interrompt l’approfondissement ciblé et ignore sa réponse tardive", async () => {
  const engine = new AnalysisEngine();
  engine.scoreFor = () => null;
  const review = new GameReview(played(["f3", "f6", "g4", "g5"]).pgn());
  review.subscribe(() => {
    if (review.phase === "resolution") engine.hold = true;
  });
  const task = review.start(async () => engine, 100);
  await vi.waitFor(() => expect(engine.commands).toContain("go movetime 3000"));
  const results = structuredClone(review.results);
  const late = engine.listener;
  await review.stop();
  late("info depth 50 score cp 0");
  late("bestmove e2e4");
  await task;
  expect(review.state).toBe("stopped");
  expect(review.results).toEqual(results);
});

it("conserve les résultats partiels après arrêt et ignore les réponses tardives", async () => {
  const engine = new AnalysisEngine();
  const review = new GameReview(mate().pgn());
  review.subscribe(() => {
    if (review.completed === 1) engine.hold = true;
  });
  const task = review.start(async () => engine, 100);
  await vi.waitFor(() =>
    expect(
      engine.commands.filter((command) => command.startsWith("go")),
    ).toHaveLength(2),
  );
  const late = engine.listener;
  await review.stop();
  late("info depth 99 score cp 900");
  late("bestmove e7e5");
  await task;
  expect(review.state).toBe("stopped");
  expect(review.completed).toBe(1);
  expect(engine.disposed).toBe(true);
  await review.start(async () => new AnalysisEngine(), 100);
  expect(review.state).toBe("complete");
});

it("annule aussi une connexion encore en attente et libère le moteur à son arrivée", async () => {
  const engine = new AnalysisEngine();
  let resolve!: (engine: Engine) => void;
  const review = new GameReview(mate().pgn());
  const task = review.start(
    () =>
      new Promise<Engine>((done) => {
        resolve = done;
      }),
    100,
  );
  await Promise.resolve();
  await review.stop();
  resolve(engine);
  await task;
  expect(engine.disposed).toBe(true);
  expect(engine.commands).toEqual([]);
  expect(review.state).toBe("stopped");
});

it("signale un moteur absent ou un coup illégal au lieu de fabriquer une analyse", async () => {
  const review = new GameReview(mate().pgn());
  await review.start(async () => {
    throw new Error("Connexion refusée");
  }, 100);
  expect(review.error).toBe("Connexion refusée");
  const engine = new AnalysisEngine();
  engine.malformed = true;
  await review.start(async () => engine, 100);
  expect(review.state).toBe("error");
  expect(review.error).toContain("Coup invalide");
  expect(review.completed).toBe(0);
  expect(engine.disposed).toBe(true);
});

it("borne l’attente d’un moteur silencieux pendant la connexion", async () => {
  vi.useFakeTimers();
  const review = new GameReview(mate().pgn());
  const engine = {
    send: vi.fn(),
    onLine: () => () => {},
    dispose: vi.fn(async () => {}),
  };
  const task = review.start(async () => engine, 100);
  await vi.advanceTimersByTimeAsync(5001);
  await task;
  expect(review.state).toBe("error");
  expect(review.error).toContain("Délai");
  expect(engine.dispose).toHaveBeenCalled();
});
