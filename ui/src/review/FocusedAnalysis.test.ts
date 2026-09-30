import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import {
  FocusedAnalysis,
  focusedDeadline,
  usableResult,
  type FocusRequest,
} from "./FocusedAnalysis";
import { GameReview } from "./GameReview";
import { boardFromCommand, StudyTree } from "./StudyTree";
import { gamePositions, legalVariation, type ReviewResult } from "./model";
import { BranchAnalysis } from "./BranchAnalysis";

class TestEngine implements Engine {
  listener: (line: string) => void = () => {};
  commands: string[] = [];
  board = new Chess();
  disposed = false;
  hold = false;
  score = "cp 20";
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
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.board = boardFromCommand(command);
    if (command.startsWith("go ") && !this.hold) this.answer();
  }
  answer() {
    const move = this.board.moves({ verbose: true })[0];
    const uci = move.from + move.to + (move.promotion ?? "");
    this.listener(`info depth 12 score ${this.score} pv ${uci}`);
    this.listener(`bestmove ${uci}`);
  }
}
function request(moves: string[] = ["e4"]): FocusRequest {
  const board = new Chess();
  moves.forEach((move) => board.move(move));
  return {
    review: {},
    revision: 1,
    engineId: "shallowred",
    positions: gamePositions(board.pgn()),
  };
}
function result(fen: string, moves: string[], value = 0): ReviewResult {
  const variation = legalVariation(fen, moves);
  expect(variation).toHaveLength(moves.length);
  return {
    score: { kind: "cp", value },
    depth: 12,
    bestMove: moves[0],
    bestSan: variation[0].label,
    variation,
  };
}
afterEach(() => vi.useRealTimers());

it("borne la recherche et réutilise une racine déjà approfondie sans nouveau moteur", async () => {
  const focused = new FocusedAnalysis(),
    req = request();
  const engines: TestEngine[] = [];
  const factory = vi.fn(async () => {
    const engine = new TestEngine();
    engines.push(engine);
    return engine;
  });
  const single = { ...req, positions: req.positions.slice(0, 1) };
  await focused.analyse(single, factory);
  const pair = await focused.analyse(req, factory);
  expect(pair).toHaveLength(2);
  expect(factory).toHaveBeenCalledTimes(2);
  expect(
    engines.flatMap((e) => e.commands).filter((c) => c.startsWith("go")),
  ).toEqual(["go movetime 3000", "go movetime 3000"]);
  expect(engines.every((e) => e.disposed)).toBe(true);
  expect(await focused.analyse(req, factory)).toBe(pair);
  expect(factory).toHaveBeenCalledTimes(2);
  expect(focused.resultFor(req, req.positions[1])).toBe(pair![1]);
  expect(focused.completed).toBe(2);
});
it("sépare les caches par moteur, révision et objet de revue", async () => {
  const focused = new FocusedAnalysis(),
    req = request([]);
  const factory = vi.fn(async () => new TestEngine());
  for (const current of [
    req,
    { ...req, engineId: "stockfish" },
    { ...req, revision: 2 },
    { ...req, review: {} },
  ]) {
    await focused.analyse(current, factory);
    await focused.analyse(current, factory);
  }
  expect(factory).toHaveBeenCalledTimes(4);
});
it("ne confond pas une même FEN issue de deux historiques différents", async () => {
  const focused = new FocusedAnalysis(),
    req = request(["Nf3", "Nf6", "Ng1", "Ng8"]);
  const position = req.positions.at(-1)!;
  const single = { ...req, positions: [position] };
  const fromFen = {
    ...single,
    positions: [{ ...position, command: `position fen ${position.fen}` }],
  };
  const factory = vi.fn(async () => new TestEngine());
  await focused.analyse(single, factory);
  await focused.analyse(fromFen, factory);
  expect(factory).toHaveBeenCalledTimes(2);
});
it("annule sans garder une moitié de paire et libère la connexion tardive", async () => {
  const focused = new FocusedAnalysis(),
    req = request();
  let connect!: (engine: Engine) => void;
  let calls = 0;
  const pending = focused.analyse(req, async () =>
    ++calls === 1
      ? new TestEngine()
      : new Promise<Engine>((resolve) => {
          connect = resolve;
        }),
  );
  await vi.waitFor(() => expect(connect).toBeDefined());
  expect(focused.completed).toBe(1);
  focused.stop();
  expect(await pending).toBeNull();
  expect(focused.state).toBe("stopped");
  expect(focused.has(req)).toBe(false);
  expect(focused.resultFor(req, req.positions[0])).toBeNull();
  const late = new TestEngine();
  connect(late);
  await vi.waitFor(() => expect(late.disposed).toBe(true));
  expect(late.commands).toEqual([]);
});
it("un changement de moteur ignore les réponses de l’ancienne recherche", async () => {
  const focused = new FocusedAnalysis(),
    req = request([]),
    old = new TestEngine();
  old.hold = true;
  const pending = focused.analyse(req, async () => old);
  await vi.waitFor(() => expect(old.commands).toContain("go movetime 3000"));
  const next = { ...req, engineId: "stockfish" };
  const fresh = await focused.analyse(next, async () => new TestEngine());
  old.answer();
  expect(await pending).toBeNull();
  expect(focused.state).toBe("complete");
  expect(focused.matches(next)).toBe(true);
  expect(focused.has(req)).toBe(false);
  expect(focused.resultFor(next, next.positions[0])).toBe(fresh![0]);
  expect(old.disposed).toBe(true);
});
it("borne aussi une connexion bloquée, puis permet de réessayer", async () => {
  vi.useFakeTimers();
  const focused = new FocusedAnalysis(),
    req = request([]);
  let connect!: (engine: Engine) => void;
  const pending = focused.analyse(
    req,
    () =>
      new Promise((resolve) => {
        connect = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(focusedDeadline);
  expect(await pending).toBeNull();
  expect(focused.state).toBe("error");
  expect(focused.error).toContain("délai prévu");
  expect(focused.has(req)).toBe(false);
  const late = new TestEngine();
  connect(late);
  await vi.advanceTimersByTimeAsync(0);
  expect(late.disposed).toBe(true);
  expect(await focused.analyse(req, async () => new TestEngine())).toHaveLength(
    1,
  );
});
it("arrête le processus si la réponse bestmove ne vient pas", async () => {
  vi.useFakeTimers();
  const focused = new FocusedAnalysis(),
    req = request([]),
    engine = new TestEngine();
  engine.hold = true;
  const pending = focused.analyse(req, async () => engine);
  await vi.advanceTimersByTimeAsync(focusedDeadline);
  expect(await pending).toBeNull();
  expect(engine.disposed).toBe(true);
  expect(focused.state).toBe("error");
});
it("mémorise l’absence de score exact sans lancer une boucle de recherches", async () => {
  const focused = new FocusedAnalysis(),
    req = request([]);
  const factory = vi.fn(async () => {
    const engine = new TestEngine();
    engine.score = "cp 20 lowerbound";
    return engine;
  });
  expect(await focused.analyse(req, factory)).toBeNull();
  expect(focused.state).toBe("unavailable");
  expect(await focused.analyse(req, factory)).toBeNull();
  expect(factory).toHaveBeenCalledTimes(1);
  expect(focused.resultFor(req, req.positions[0])).toBeNull();
});
it("refuse une demande étendue à toute la partie", async () => {
  const factory = vi.fn(async () => new TestEngine());
  await expect(
    new FocusedAnalysis().analyse(request(["e4", "e5"]), factory),
  ).rejects.toThrow("une ou deux");
  expect(factory).not.toHaveBeenCalled();
});
it("accepte une position terminale sans lancer de processus", async () => {
  const req = request(["f3", "e5", "g4", "Qh4#"]),
    focused = new FocusedAnalysis();
  const factory = vi.fn(async () => new TestEngine());
  const terminal = { ...req, positions: [req.positions.at(-1)!] };
  const results = await focused.analyse(terminal, factory);
  expect(results![0].score).toMatchObject({
    kind: "mate",
    value: 0,
    winner: "b",
  });
  expect(factory).not.toHaveBeenCalled();
});
it("rejette les résultats étrangers, bornés ou dont le meilleur coup ne correspond pas à la PV", () => {
  const req = request(),
    position = req.positions[0],
    valid = result(position.fen, ["e2e4", "e7e5"]);
  expect(usableResult(position, valid)).toBe(true);
  expect(usableResult(position, { ...valid, bestMove: "d2d4" })).toBe(false);
  expect(
    usableResult({ ...position, command: req.positions[1].command }, valid),
  ).toBe(false);
  expect(
    usableResult(position, { ...valid, score: { kind: "cp", value: NaN } }),
  ).toBe(false);
  expect(
    usableResult(position, {
      ...valid,
      variation: [{ ...valid.variation[0], fen: req.positions[0].fen }],
    }),
  ).toBe(false);
});
it("publie la paire complète dans la revue, mais refuse une ancienne révision ou une analyse en cours", async () => {
  const game = new Chess();
  game.move("e4");
  const review = new GameReview(game.pgn());
  const before = result(review.positions[0].fen, ["d2d4"]),
    after = result(review.positions[1].fen, ["e7e5"], -400);
  const listener = vi.fn();
  review.subscribe(listener);
  expect(review.applyRefinement(review.revision, 0, [before, after])).toBe(
    true,
  );
  expect(review.results).toEqual([before, after]);
  expect(review.annotations[0]?.category).toBe("blunder");
  expect([...review.verified]).toEqual([0, 1]);
  expect(listener).toHaveBeenCalledTimes(1);
  const revision = review.revision;
  await review.stop();
  expect(review.applyRefinement(revision, 0, [after, before])).toBe(false);
  expect(review.applyRefinement(review.revision, -1, [before, after])).toBe(
    false,
  );
  review.state = "running";
  expect(review.applyRefinement(review.revision, 0, [after, before])).toBe(
    false,
  );
  expect(review.results).toEqual([before, after]);
});
it("conserve un verdict inconnu si le calcul ciblé reste contradictoire, dans la partie et sa variante", async () => {
  const board = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
  board.move("a8=Q");
  const review = new GameReview(board.pgn());
  const before = result(review.positions[0].fen, ["a7a8q"], 0),
    after = result(review.positions[1].fen, ["h8h7"], 500);
  review.applyRefinement(review.revision, 0, [before, after]);
  expect(review.annotations[0]).toBeNull();
  const tree = new StudyTree(review.positions[0]),
    node = tree.play(0, "a7", "a8", "q"),
    live = new BranchAnalysis();
  live.remember(tree, 0, before, true);
  live.remember(tree, node, after, true);
  const factory = vi.fn(async () => new TestEngine());
  await live.analyse(tree, node, factory, null, null);
  expect(live.state).toBe("complete");
  expect(live.annotation).toBeNull();
  expect(factory).not.toHaveBeenCalled();
});
