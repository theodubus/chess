import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { corpus, corpusInput, type CorpusCase } from "./corpus";
import { uci } from "./context";
import { planContrast } from "./contrast";
import { understandDecision } from "./prototype";
import { Verification, type VerificationRequest } from "./Verification";
import cases from "./verificationCases.json";

const example = (test = cases[0]) => {
  const { position, result } = corpusInput({
    ...test,
    prefix: [],
    family: "verification",
    expected: {},
    forbiddenClaims: [],
  } as CorpusCase);
  return understandDecision(position, result);
};
function request(understanding = example()): VerificationRequest {
  return {
    review: {},
    revision: 0,
    engineId: "test",
    understanding,
    hypothesisIndex: 0,
  };
}
class TestEngine implements Engine {
  listener: (line: string) => void = () => {};
  commands: string[] = [];
  board = new Chess();
  disposed = false;
  hold = false;
  constructor(
    private req: VerificationRequest,
    private change: (budget: number) => number = () => -200,
  ) {}
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
    if (command.startsWith("go ") && !this.hold) {
      const context = this.req.understanding.context,
        h = this.req.understanding.hypotheses[this.req.hypothesisIndex],
        frame = context.frames[h.threatPly + 1],
        budget = Number(command.split(" ").at(-1));
      let moves: string[],
        whiteScore = 0;
      if (this.board.fen() === frame.fen) {
        moves = context.moves.slice(h.threatPly + 1).map(uci);
        whiteScore = this.change(budget);
      } else if (this.board.fen() === context.before.fen)
        moves = [uci(context.moves[context.decision])];
      else if (this.board.fen() === context.after.fen)
        moves = [uci(context.moves[context.decision + 1])];
      else {
        moves = [uci(this.board.moves({ verbose: true })[0])];
        whiteScore = 400;
      }
      const score = whiteScore * (this.board.turn() === "w" ? 1 : -1);
      this.listener(`info depth 15 score cp ${score} pv ${moves.join(" ")}`);
      this.listener(`bestmove ${moves[0]}`);
    }
  }
}
afterEach(() => vi.useRealTimers());

it.each(cases)("la recherche réfute le mécanisme court : $id", async (test) => {
  const req = request(example(test)),
    check = new Verification([10, 20]);
  const engines: TestEngine[] = [];
  const report = await check.verify(req, async () => {
    const e = new TestEngine(req);
    engines.push(e);
    return e;
  });
  expect(report, check.error).toMatchObject({
    status: "contradicted",
    reason:
      test.expected === "mate-for-victim" ? "mate-found" : "defence-found",
    explanation: null,
  });
  expect(report?.searches).toBe(4);
  expect(report?.requestedSearchMs).toBe(60);
  expect(
    engines.flatMap((e) => e.commands).filter((c) => c.startsWith("go")),
  ).toEqual([
    "go movetime 10",
    "go movetime 10",
    "go movetime 20",
    "go movetime 20",
  ]);
  expect(engines.every((e) => e.disposed)).toBe(true);
});
it("ne transforme pas une perte stable dans la PV en explication du verdict", async () => {
  const input = corpusInput(
      corpus.find((c) => c.id === "queen-closes-retreat")!,
    ),
    req = request(understandDecision(input.position, input.result)),
    check = new Verification([10, 20]);
  const report = await check.verify(req, async () => new TestEngine(req));
  expect(report, check.error).toMatchObject({
    status: "supported",
    reason: "stable-loss",
    comparison: "unavailable",
    explanation: null,
  });
  expect(report?.searches).toBe(6);
  expect(report?.passes.every((p) => p.evidence?.materialDelta === -2)).toBe(
    true,
  );
});
it("une divergence de score entre budgets interdit de confirmer", async () => {
  const req = request(),
    check = new Verification([10, 20]);
  const report = await check.verify(
    req,
    async () => new TestEngine(req, (budget) => (budget === 10 ? -200 : 200)),
  );
  expect(report).toMatchObject({
    status: "indeterminate",
    reason: "unstable-search",
  });
});
it("compare une alternative légale du point de vue du joueur noir", async () => {
  const req = { ...request(), alternative: "h8g7" },
    check = new Verification([10, 20]);
  const board = new Chess(req.understanding.context.before.fen);
  expect(board.move("Kg7").from + "g7").toBe(req.alternative);
  const report = await check.verify(
    req,
    async () => new TestEngine(req, () => 0),
  );
  expect(report).toMatchObject({ comparison: "played-better", searches: 6 });
  expect(
    report?.passes.every((p) =>
      p.questions
        .find((q) => q.purpose === "alternative")
        ?.position.command.endsWith("h8g7"),
    ),
  ).toBe(true);
});
it("refuse une alternative illégale avant toute connexion", async () => {
  const factory = vi.fn(async () => new TestEngine(request()));
  await expect(
    new Verification().verify({ ...request(), alternative: "h8a1" }, factory),
  ).rejects.toThrow("illégale");
  expect(factory).not.toHaveBeenCalled();
});
it("sépare les caches par moteur et révision et protège le rapport stocké", async () => {
  const req = request(),
    check = new Verification([10, 20]);
  const factory = vi.fn(async () => new TestEngine(req));
  const first = await check.verify(req, factory);
  first!.status = "supported";
  first!.passes[0].questions[0].result.bestMove = "a1a8";
  expect((await check.verify(req, factory))?.status).toBe("contradicted");
  expect(await check.verify(req, factory)).toMatchObject({
    cached: true,
    searches: 0,
    requestedSearchMs: 0,
  });
  expect(factory).toHaveBeenCalledTimes(4);
  await check.verify({ ...req, revision: 1 }, factory);
  await check.verify({ ...req, engineId: "other" }, factory);
  expect(factory).toHaveBeenCalledTimes(12);
});
it("borne toute la vérification et libère une connexion arrivée après le délai", async () => {
  vi.useFakeTimers();
  const req = request(),
    check = new Verification([10, 20], 50);
  let connect!: (engine: Engine) => void;
  const pending = check.verify(
    req,
    () =>
      new Promise((resolve) => {
        connect = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(await pending).toBeNull();
  expect(check.state).toBe("timed-out");
  const late = new TestEngine(req);
  connect(late);
  await vi.advanceTimersByTimeAsync(0);
  expect(late.disposed).toBe(true);
  expect(late.commands).toEqual([]);
});
it("une nouvelle vérification arrête l'ancienne sans publier sa réponse", async () => {
  const req = request(),
    check = new Verification([10, 20]),
    held = new TestEngine(req);
  held.hold = true;
  const pending = check.verify(req, async () => held);
  await vi.waitFor(() => expect(held.commands).toContain("go movetime 10"));
  const fresh = await check.verify(
    { ...req, engineId: "fresh" },
    async () => new TestEngine(req),
  );
  expect(await pending).toBeNull();
  expect(fresh?.status).toBe("contradicted");
  expect(held.disposed).toBe(true);
  expect(check.state).toBe("complete");
});

it("une menace différente dans la nouvelle recherche laisse l'hypothèse indéterminée", async () => {
  const input = corpusInput(
      corpus.find((c) => c.id === "queen-closes-retreat")!,
    ),
    req = request(understandDecision(input.position, input.result));
  const report = await new Verification([10, 20]).verify(req, async () => {
    const engine = new TestEngine(req),
      original = engine.onLine.bind(engine);
    engine.onLine = (listener) =>
      original((line) => listener(line.replaceAll("f5f4", "h7h6")));
    return engine;
  });
  expect(report).toMatchObject({
    status: "indeterminate",
    reason: "threat-changed",
  });
});
it("une même FEN avec un historique différent ne partage pas ses recherches", async () => {
  const { position, result } = corpusInput({
    ...cases[0],
    prefix: ["Kg8", "Kh3", "Kh8", "Kh2"],
    family: "verification",
    expected: {},
    forbiddenClaims: [],
  } as CorpusCase);
  const req = request(understandDecision(position, result)),
    truncated = {
      ...req,
      understanding: understandDecision(
        { ...position, command: `position fen ${position.fen}` },
        result,
      ),
    },
    check = new Verification([10, 20]);
  expect(req.understanding.context.before.fen).toBe(
    truncated.understanding.context.before.fen,
  );
  expect(req.understanding.context.before.command).not.toBe(
    truncated.understanding.context.before.command,
  );
  const factory = vi.fn(async () => new TestEngine(req));
  expect((await check.verify(req, factory))?.status).toBe("contradicted");
  expect((await check.verify(truncated, factory))?.status).toBe("contradicted");
  expect(factory).toHaveBeenCalledTimes(8);
});

function comparativeRequest(alternative = "g1h1") {
  const input = corpusInput(
    corpus.find((c) => c.id === "queen-closes-retreat")!,
  );
  return {
    ...request(understandDecision(input.position, input.result)),
    alternative,
  };
}
function comparativeEngine(req: VerificationRequest) {
  const engine = new TestEngine(req, () => -300),
    plan = planContrast(
      req.understanding,
      req.understanding.hypotheses[0],
      req.alternative!,
    ),
    original = engine.onLine.bind(engine);
  engine.onLine = (listener) =>
    original((line) => {
      if (plan.position?.fen === engine.board.fen()) {
        if (line.startsWith("info "))
          return listener(`info depth 15 score cp 0 pv ${plan.routes[0].move}`);
        if (line.startsWith("bestmove "))
          return listener(`bestmove ${plan.routes[0].move}`);
      }
      listener(line);
    });
  return engine;
}
it("relie la perte et l'écart de score à la retraite restaurée, avec dix recherches au maximum", async () => {
  const req = comparativeRequest(),
    check = new Verification([10, 20]),
    factory = vi.fn(async () => comparativeEngine(req));
  const report = await check.verify(req, factory);
  expect(report, check.error).toMatchObject({
    status: "supported",
    comparison: "alternative-better",
    searches: 10,
    requestedSearchMs: 150,
    attribution: {
      status: "supported",
      reason: "closed-retreat",
      victimId: "w:b:e3",
      blockerId: "w:q:e2",
    },
    explanation: null,
  });
  expect(report!.passes.every((p) => p.contrast.usedRoute?.to === "d2")).toBe(
    true,
  );
  const cached = await check.verify(req, factory);
  expect(cached).toMatchObject({
    cached: true,
    searches: 0,
    attribution: report!.attribution,
  });
  expect(factory).toHaveBeenCalledTimes(10);
});
it("un meilleur score ne suffit pas si l'alternative bloque encore la même retraite", async () => {
  const req = comparativeRequest("f3d2"),
    check = new Verification([10, 20]),
    report = await check.verify(req, async () => comparativeEngine(req));
  expect(report, check.error).toMatchObject({
    comparison: "alternative-better",
    attribution: { status: "not-established", reason: "no-comparable-branch" },
    searches: 8,
  });
  expect(
    report!.passes.every((p) => p.contrast.reason === "same-restriction"),
  ).toBe(true);
  expect(
    report!.passes.every(
      (p) => !p.questions.some((q) => q.purpose === "same-threat"),
    ),
  ).toBe(true);
});
it("l'annulation couvre aussi la recherche supplémentaire dans l'alternative", async () => {
  const req = comparativeRequest(),
    check = new Verification([10, 20]),
    engines: TestEngine[] = [];
  const plan = planContrast(
    req.understanding,
    req.understanding.hypotheses[0],
    req.alternative,
  );
  const pending = check.verify(req, async () => {
    const engine = comparativeEngine(req),
      send = engine.send.bind(engine);
    engine.send = (command) => {
      if (
        command.startsWith("go ") &&
        engine.board.fen() === plan.position!.fen
      )
        engine.hold = true;
      send(command);
    };
    engines.push(engine);
    return engine;
  });
  await vi.waitFor(() =>
    expect(
      engines.some((e) => e.hold && e.commands.includes("go movetime 10")),
    ).toBe(true),
  );
  check.stop();
  expect(await pending).toBeNull();
  expect(check.state).toBe("stopped");
  expect(engines.every((e) => e.disposed)).toBe(true);
});

it("ne publie pas hors délai quand le timer n'a pas encore reçu la main", async () => {
  const req = request(),
    check = new Verification([10, 20], 50);
  let now = 0;
  const time = vi.spyOn(performance, "now").mockImplementation(() => now);
  try {
    const report = await check.verify(req, async () => {
      const engine = new TestEngine(req),
        send = engine.send.bind(engine);
      engine.send = (command) => {
        send(command);
        if (command.startsWith("go ")) now = 60;
      };
      return engine;
    });
    expect(report).toBeNull();
    expect(check.state).toBe("timed-out");
  } finally {
    time.mockRestore();
  }
});
