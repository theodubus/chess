import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { corpus, corpusInput, type CorpusCase } from "./corpus";
import {
  boundedContinuation,
  defenceEvidence,
  preventionEvidence,
} from "./evidence";
import { understandDecision } from "./prototype";
import { boardFromCommand } from "../StudyTree";
import cases from "./verificationCases.json";
import { legalVariation, type ReviewResult } from "../model";

function counterexample(test = cases[0]) {
  const input = corpusInput({
    ...test,
    prefix: [],
    family: "verification",
    expected: {},
    forbiddenClaims: [],
  } as CorpusCase);
  const understanding = understandDecision(input.position, input.result),
    hypothesis = understanding.hypotheses.find(
      (h) => h.victimSquare === test.victim,
    )!;
  return { ...input, understanding, hypothesis };
}
function response(fen: string, moves: string[], value = -200): ReviewResult {
  const variation = legalVariation(fen, moves);
  expect(variation).toHaveLength(moves.length);
  return {
    score: { kind: "cp", value },
    depth: 15,
    bestMove: moves[0] ?? null,
    bestSan: variation[0]?.label ?? null,
    variation,
  };
}
for (const test of cases) {
  it(`ne confond pas sorties individuelles et défense : ${test.id}`, () => {
    const { understanding, hypothesis, result } = counterexample(test);
    expect(hypothesis).toBeDefined();
    expect(
      hypothesis.exits.every((exit) =>
        exit.captures.some((c) => c.balanceAfterImmediateRecapture < 0),
      ),
    ).toBe(true);
    const evidence = defenceEvidence(understanding, hypothesis, {
      ...result!,
      score: { kind: "cp", value: 0 },
    });
    expect(evidence.outcome).toBe(test.expected);
    if (test.expected === "preserved")
      expect(evidence.materialDelta).toBeGreaterThanOrEqual(0);
    if (test.id === "sacrifice-before-mate")
      expect(evidence.materialDelta).toBe(-3);
    expect(understanding.explanation).toBeNull();
    if (test.id === "check-frees-retreat") {
      expect(evidence.moves).toHaveLength(5);
      expect(evidence.includesIntermediateCheck).toBe(true);
      const board = new Chess(test.fen);
      board.move(test.played);
      board.move("Rh8+");
      expect(board.moves()).toEqual(["Rc8"]);
      board.move("Rc8");
      board.move("Rxc8+");
      expect(board.moves()).toEqual(["Kxc8"]);
    }
  });
}

describe("limites du témoin", () => {
  const { position, result } = corpusInput(
    corpus.find((c) => c.id === "queen-closes-retreat")!,
  );
  const understanding = understandDecision(position, result),
    hypothesis = understanding.hypotheses[0],
    frame = understanding.context.frames[hypothesis.threatPly + 1];
  it("inclut la reprise et arrête le témoin une fois le bilan établi", () => {
    const evidence = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, ["d3d4", "f4e3", "f2e3"]),
    );
    expect(evidence.outcome).toBe("loss-in-line");
    expect(evidence.materialDelta).toBe(-2);
    expect(evidence.moves).toHaveLength(3);
  });
  it("ne conclut pas au milieu de l'échange, ni à partir d'une PV vide", () => {
    const partial = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, ["d3d4", "f4e3"]),
    );
    expect(partial.outcome).toBe("unresolved");
    expect(() =>
      defenceEvidence(understanding, hypothesis, response(frame.fen, [])),
    ).toThrow();
  });
  it("refuse les scores bornés et la variante d'une autre position", () => {
    const valid = response(frame.fen, ["d3d4", "f4e3", "f2e3"]);
    expect(() =>
      defenceEvidence(understanding, hypothesis, {
        ...valid,
        score: { kind: "cp", value: -200, bound: "lower" },
      }),
    ).toThrow();
    expect(() =>
      defenceEvidence(understanding, hypothesis, {
        ...valid,
        variation: [{ ...valid.variation[0], fen: position.fen }],
      }),
    ).toThrow();
  });
  it("ne poursuit pas une recherche de capture après plusieurs coups calmes", () => {
    // Cette suite est exécutée avec chess.js avant sa vérification : elle n'est
    // pas une défense optimale, mais teste la frontière d'une illustration courte.
    const board = new Chess(frame.fen);
    const moves = ["h2h3", "h7h6", "g1h1", "f4e3", "f2e3"];
    for (const move of moves)
      board.move({ from: move.slice(0, 2), to: move.slice(2, 4) });
    const evidence = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, moves),
    );
    expect(evidence.outcome).toBe("unresolved");
    expect(evidence.moves).toHaveLength(2);
  });
});

it("arrête la PV reçue à la première nulle sans interpréter la suite du moteur", () => {
  const fen = "7k/8/8/8/8/8/2r5/1B5K w - - 0 1";
  const result = {
    score: { kind: "cp" as const, value: 0 },
    depth: 15,
    bestMove: "b1c2",
    bestSan: null,
    variation: legalVariation(fen, ["b1c2", "h8g8"]),
  };
  const bounded = boundedContinuation(
    { command: `position fen ${fen}`, fen },
    result,
  );
  expect(bounded.variation).toHaveLength(1);
  expect(result.variation).toHaveLength(2);
  expect(new Chess(bounded.variation[0].fen).isInsufficientMaterial()).toBe(
    true,
  );
});

describe("réponse à une reprise disponible", () => {
  const input = corpusInput(
    corpus.find((c) => c.id === "queen-closes-retreat")!,
  );
  const understanding = understandDecision(input.position, input.result);
  const hypothesis = understanding.hypotheses[0];
  const frame = understanding.context.frames[hypothesis.threatPly + 1];
  const prefix = ["d3d4", "c5d4", "e3d4", "e5d4"];
  it("clôt l'épisode quand le moteur choisit une autre réponse calme", () => {
    const evidence = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, [...prefix, "f1e1", "h7h6"]),
    );
    expect(evidence).toMatchObject({
      outcome: "loss-in-line",
      materialDelta: -3,
      ending: "recapture-not-chosen",
    });
    expect(evidence.moves).toHaveLength(5);
    const reply = evidence.replies.at(-1)!;
    expect(reply).toMatchObject({
      state: "not-chosen",
      capture: "e5d4",
      available: ["f3d4", "d2d4"],
      resolvedAt: 4,
      choice: { move: "f1e1", available: ["f3d4", "d2d4"], inCheck: false },
    });
    expect(boardFromCommand(reply.choice!.command).move("d2d4").san).toBe(
      "Qxd4",
    );
  });
  it("ne ferme pas l'échange si la PV s'arrête avant cette décision", () => {
    const evidence = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, prefix),
    );
    expect(evidence).toMatchObject({
      outcome: "unresolved",
      ending: "pending-recapture",
    });
    expect(evidence.replies.at(-1)).toMatchObject({
      state: "pending",
      available: ["f3d4", "d2d4"],
      choice: null,
    });
  });
  it("conserve la reprise réellement jouée et son bilan", () => {
    const evidence = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, [...prefix, "d2d4"]),
    );
    expect(evidence).toMatchObject({
      outcome: "loss-in-line",
      materialDelta: -2,
      ending: "exchange-ended",
    });
    expect(evidence.replies.find((r) => r.capture === "e5d4")).toMatchObject({
      state: "recaptured",
      choice: { move: "d2d4" },
    });
  });
  it("ne lit pas la décision de reprise au-delà de la borne", () => {
    const evidence = defenceEvidence(
      understanding,
      hypothesis,
      response(frame.fen, [...prefix, "f1e1"]),
      4,
    );
    expect(evidence).toMatchObject({
      outcome: "unresolved",
      ending: "pending-recapture",
    });
    expect(evidence.replies.at(-1)).toMatchObject({
      state: "pending",
      resolvedAt: null,
      choice: null,
    });
  });
});

describe("échec intermédiaire avant une reprise", () => {
  const fen = "6k1/p7/8/7Q/8/8/8/1Br1R2K w - - 0 1";
  const { position } = corpusInput({
    fen,
    played: "Kh2",
    prefix: [],
    line: [],
    expected: {},
    forbiddenClaims: [],
  } as unknown as CorpusCase);
  const understanding = understandDecision(position);
  const frame = understanding.context.after;
  const moves = ["c1b1", "h5h7", "g8f8", "e1b1"];
  it("attend la reprise après l'échec et sa réponse", () => {
    const evidence = preventionEvidence(
      understanding.context,
      "w:b:b1",
      response(frame.fen, moves),
    );
    expect(evidence).toMatchObject({
      outcome: "compensated",
      materialDelta: 2,
    });
    expect(evidence.moves).toEqual(moves);
    expect(evidence.replies[0]).toMatchObject({
      state: "recaptured",
      resolvedAt: 3,
      intermediateChecks: [{ ply: 1, move: "h5h7" }],
      choice: { move: "e1b1" },
    });
  });
  it("reste indéterminé avant la décision après l'échec", () => {
    const evidence = preventionEvidence(
      understanding.context,
      "w:b:b1",
      response(frame.fen, moves.slice(0, 3)),
    );
    expect(evidence).toMatchObject({
      outcome: "unresolved",
      ending: "pending-recapture",
    });
    expect(evidence.replies[0]).toMatchObject({
      state: "pending",
      choice: null,
      intermediateChecks: [{ ply: 1, move: "h5h7" }],
    });
  });
});
