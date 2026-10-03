import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { legalVariation, type ReviewResult } from "../model";
import {
  mechanismInput as fixture,
  mechanismCases as cases,
} from "./mechanismCases";
import { relationDraft } from "./relationDraft";
import { observeMechanism } from "./mechanisms";
import { extendBranch, relationContrast } from "./relationContrast";

import {
  RelationVerification,
  type RelationRequest,
} from "./RelationVerification";

const resultFor = (
  fen: string,
  moves: string[],
  score: number,
): ReviewResult => ({
  score: { kind: "cp", value: score },
  depth: 15,
  bestMove: moves[0] ?? null,
  bestSan: null,
  variation: legalVariation(fen, moves),
});
function scripted(test: (typeof cases)[number], req: RelationRequest) {
  const { context } = req.understanding,
    h = req.understanding.mechanisms[req.mechanismIndex];
  const results = new Map<string, { moves: string[]; score: number }>();
  results.set(context.before.command, {
    moves: [
      context.moves[context.decision].from + context.moves[context.decision].to,
    ],
    score: 0,
  });
  results.set(context.after.command, {
    moves: test.lineUci,
    score: test.actualScore,
  });
  const observation = observeMechanism(
    context,
    h,
    resultFor(context.after.fen, test.lineUci, test.actualScore),
  );
  if (observation.matched) {
    const branch = extendBranch(context, [...observation.prefix, h.capture]);
    results.set(branch.frames.at(-1)!.command, {
      moves: test.lineUci.slice(observation.prefix.length + 1),
      score: test.actualScore,
    });
  }
  const plan = relationContrast(
    context,
    h,
    observation,
    test.alternativeUci ?? null,
  );
  if (plan.setup)
    results.set(plan.setup.after.command, {
      moves: test.alternativeLineUci!,
      score: test.alternativeScore,
    });
  else if (test.alternativeUci) {
    const board = boardFromCommand(context.before.command);
    board.move(test.alternativeUci);
    const command =
      context.before.command +
      (context.before.command.includes(" moves ") ? " " : " moves ") +
      test.alternativeUci;
    results.set(command, {
      moves: test.alternativeLineUci!,
      score: test.alternativeScore,
    });
  }
  if (plan.branch)
    results.set(plan.branch.frames.at(-1)!.command, {
      moves: test.alternativeLineUci!.slice(plan.prefix.length),
      score: test.alternativeScore,
    });
  return { results, plan };
}
class ScriptEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(
    private answers: Map<string, { moves: string[]; score: number }>,
    private drift: (budget: number, score: number) => number = (_, s) => s,
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
    if (command.startsWith("position ")) this.command = command;
    if (command.startsWith("go ") && !this.hold) {
      const answer = this.answers.get(this.command);
      if (!answer) throw new Error(`Question inattendue ${this.command}`);
      const board = boardFromCommand(this.command),
        score =
          this.drift(Number(command.split(" ").at(-1)), answer.score) *
          (board.turn() === "w" ? 1 : -1);
      this.listener(
        `info depth 15 score cp ${score} pv ${answer.moves.join(" ")}`,
      );
      this.listener(`bestmove ${answer.moves[0]}`);
    }
  }
}
afterEach(() => vi.useRealTimers());
for (const test of cases)
  it(`mécanisme : ${test.id}`, async () => {
    const input = fixture(test);
    if (test.expected === "no-hypothesis") {
      expect(input.mechanismIndex).toBe(-1);
      return;
    }
    const hypothesis = input.understanding.mechanisms[input.mechanismIndex];
    expect(hypothesis.role).toBe(test.role);
    const req = {
      ...input,
      review: {},
      revision: 0,
      engineId: "script",
      alternative: test.alternativeUci,
    };
    const { results, plan } = scripted(test, req),
      engines: ScriptEngine[] = [];
    const check = new RelationVerification([10, 20]);
    const report = await check.verify(req, async () => {
      const e = new ScriptEngine(results);
      engines.push(e);
      return e;
    });
    expect(report, check.error).not.toBeNull();
    if (test.expected === "supported") {
      expect(report).toMatchObject({
        status: "supported",
        attribution: { status: "supported", reason: test.kind },
        explanation: null,
      });
      expect(report!.searches).toBe(test.kind === "defender-removal" ? 10 : 8);
      expect(
        report!.passes.every(
          (p) => p.evidence.scope === "conditional-engine-line",
        ),
      ).toBe(true);
    } else {
      expect(report!.attribution.status).toBe("not-established");
      if (test.expected === "line-still-open")
        expect(plan.reason).toBe("line-still-open");
      else expect(report!.reason).toBe(test.expected);
    }
    expect(report!.searches).toBeLessThanOrEqual(10);
    expect(engines.every((e) => e.disposed)).toBe(true);
    expect(
      engines
        .flatMap((e) => e.commands)
        .some((c) => /MultiPV|searchmoves/.test(c)),
    ).toBe(false);
  });
function setup() {
  const test = cases[0],
    req = {
      ...fixture(test),
      review: {},
      revision: 0,
      engineId: "script",
      alternative: test.alternativeUci,
    };
  return { req, ...scripted(test, req) };
}
it("une capture et des scores divergents ne sont pas confirmés", async () => {
  const { req, results } = setup();
  const check = new RelationVerification([10, 20]);
  const report = await check.verify(
    req,
    async () =>
      new ScriptEngine(
        results,
        (budget, score) => score + (budget === 20 ? 500 : 0),
      ),
  );
  expect(report).toMatchObject({
    status: "indeterminate",
    reason: "unstable-search",
    attribution: { status: "not-established" },
  });
});
it("un même motif sans écart d'évaluation ne devient pas une raison", async () => {
  const { req, results } = setup();
  const report = await new RelationVerification([10, 20]).verify(
    req,
    async () => new ScriptEngine(results, () => 0),
  );
  expect(report).toMatchObject({
    status: "supported",
    attribution: { status: "not-established", reason: "score-gap-missing" },
  });
});
it("conserve le cache, l'identité du moteur et les réponses originales", async () => {
  const { req, results } = setup(),
    check = new RelationVerification([10, 20]);
  const factory = vi.fn(async () => new ScriptEngine(results));
  const first = await check.verify(req, factory);
  first!.passes[0].contrast.retained[0] = "changed";
  const again = await check.verify(req, factory);
  expect(again).toMatchObject({
    cached: true,
    searches: 0,
    requestedSearchMs: 0,
  });
  expect(again!.passes[0].contrast.retained[0]).not.toBe("changed");
  expect(factory).toHaveBeenCalledTimes(10);
  await check.verify({ ...req, revision: 1 }, factory);
  await check.verify({ ...req, engineId: "other" }, factory);
  expect(factory).toHaveBeenCalledTimes(30);
});
it("refuse une alternative illégale avant la connexion", async () => {
  const { req, results } = setup(),
    factory = vi.fn(async () => new ScriptEngine(results));
  await expect(
    new RelationVerification().verify({ ...req, alternative: "h8a1" }, factory),
  ).rejects.toThrow();
  expect(factory).not.toHaveBeenCalled();
});
it("annule aussi la réponse de reprise dans la branche conditionnelle", async () => {
  const { req, results, plan } = setup(),
    check = new RelationVerification([10, 20]);
  const engines: ScriptEngine[] = [];
  const pending = check.verify(req, async () => {
    const e = new ScriptEngine(results),
      send = e.send.bind(e);
    e.send = (command) => {
      if (
        command.startsWith("go ") &&
        e.command === plan.branch!.frames.at(-1)!.command
      )
        e.hold = true;
      send(command);
    };
    engines.push(e);
    return e;
  });
  await vi.waitFor(() => expect(engines.some((e) => e.hold)).toBe(true));
  check.stop();
  expect(await pending).toBeNull();
  expect(engines.every((e) => e.disposed)).toBe(true);
});
it("borne l'attente de connexion et rejette son arrivée tardive", async () => {
  vi.useFakeTimers();
  const { req, results } = setup(),
    check = new RelationVerification([10, 20], 50);
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
  const late = new ScriptEngine(results);
  connect(late);
  await vi.advanceTimersByTimeAsync(0);
  expect(late.disposed).toBe(true);
});

for (const test of cases.filter((c) => c.expected === "supported"))
  it(`brouillon court et cohérent : ${test.id}`, async () => {
    const input = fixture(test),
      req = {
        ...input,
        review: {},
        revision: 0,
        engineId: "script",
        alternative: test.alternativeUci,
      };
    const { results } = scripted(test, req),
      report = await new RelationVerification([10, 20]).verify(
        req,
        async () => new ScriptEngine(results),
      );
    const draft = relationDraft(input.understanding, report!);
    expect(draft).toMatchObject({
      status: "draft",
      scope: "conditional-mechanism",
    });
    expect(draft!.played[0].fen).toBe(input.understanding.context.after.fen);
    expect(draft!.played).toHaveLength(test.id === "defence-left-full" ? 2 : 3);
    expect(
      draft!.played.some(
        (step) => step.command === input.understanding.context.before.command,
      ),
    ).toBe(false);
    expect(draft!.summary).toContain(
      test.kind === "opened-line" ? "ligne" : "reprise",
    );
    expect(draft!.comparisonText).toContain(
      test.kind === "opened-line" ? "obstacle" : "reprise",
    );
    if (test.kind === "opened-line") {
      expect(draft!.alternative).toHaveLength(1);
      expect(draft!.alternative[0].marks.some((m) => m.to)).toBe(true);
    }
    for (const line of [draft!.played, draft!.alternative])
      for (const step of line)
        expect(boardFromCommand(step.command).fen()).toBe(step.fen);
    expect(
      relationDraft(input.understanding, {
        ...report!,
        attribution: {
          status: "not-established",
          reason: "score-gap-missing",
          scope: "conditional-mechanism",
        },
      }),
    ).toBeNull();
  });

it("explique une perte relative même quand le camp reste évalué gagnant", async () => {
  const test = cases.find((c) => c.id === "line-left")!,
    req = {
      ...fixture(test),
      review: {},
      revision: 0,
      engineId: "script",
      alternative: test.alternativeUci,
    };
  const { results } = scripted(test, req);
  const report = await new RelationVerification([10, 20]).verify(
    req,
    async () =>
      new ScriptEngine(results, (_, score) =>
        score === test.actualScore
          ? 400
          : score === test.alternativeScore
            ? 900
            : score,
      ),
  );
  expect(report).toMatchObject({
    status: "supported",
    attribution: { status: "supported", reason: "opened-line" },
  });
  expect(report!.passes.every((p) => p.score?.value === 400)).toBe(true);
});
it("n'attribue pas la différence au défenseur si le moteur ne reprend pas avec lui", async () => {
  const { req, results, plan } = setup();
  results.set(plan.branch!.frames.at(-1)!.command, {
    moves: ["h8g8"],
    score: 100,
  });
  const report = await new RelationVerification([10, 20]).verify(
    req,
    async () => new ScriptEngine(results),
  );
  expect(report).toMatchObject({
    attribution: { status: "not-established", reason: "mechanism-not-used" },
  });
});
