import { describe, expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { legalVariation, type ReviewResult } from "../model";
import { decisionContext } from "./context";
import { preventionEvidence } from "./evidence";
import { captureIllustration } from "./illustration";

// Témoins construits et exécutés avec chess.js avant ajout. Ce ne sont pas
// des affirmations d'optimalité : le score exact est simulé pour le contrat.
function fixture(fen: string, played: string, square: string, moves: string[]) {
  const board = boardFromCommand(`position fen ${fen}`);
  const move = board.move(played);
  const context = decisionContext({
    command: `position fen ${fen}`,
    fen,
    turn: move.color,
    played,
    playedSan: move.san,
    label: "Témoin construit",
    terminal: null,
  });
  const victimId = context.before.pieces.find((p) => p.square === square)!.id;
  const variation = legalVariation(context.after.fen, moves);
  expect(variation).toHaveLength(moves.length);
  const result: ReviewResult = {
    score: { kind: "cp", value: -400 },
    depth: 15,
    bestMove: moves[0],
    bestSan: variation[0].label,
    variation,
  };
  const evidence = preventionEvidence(context, victimId, result);
  return { context, victimId, evidence };
}
const lineCases = [
  {
    fen: "rnbr1b1k/ppp1qppp/4pn2/8/4p3/3P3N/PPP1BPPP/RNBQ1RK1 w - - 0 1",
    played: "d3e4",
    square: "d1",
    moves: ["d8d1", "f1d1", "f6e4", "h3f4"],
  },
  {
    fen: "rnbq1rk1/ppp1bppp/3p3n/4P3/8/4PN2/PPP1QPPP/RNBR1B1K b - - 0 1",
    played: "d6e5",
    square: "d8",
    moves: ["d1d8", "f8d8", "f3e5", "h6f5"],
  },
];
for (const test of lineCases)
  it(`retire une prise ultérieure du repère, conserve la preuve : ${test.square}`, () => {
    const { context, victimId, evidence } = fixture(
      test.fen,
      test.played,
      test.square,
      test.moves,
    );
    const original = structuredClone(evidence);
    const plan = captureIllustration(context, victimId, evidence);
    expect(evidence).toMatchObject({
      outcome: "loss-in-line",
      materialDelta: -4,
    });
    expect(plan).toEqual({
      moves: test.moves.slice(0, 2),
      omittedMoves: test.moves.slice(2, 3),
      materialDelta: -3,
      proofMaterialDelta: -4,
    });
    expect(evidence).toEqual(original);
    const board = boardFromCommand(context.after.command);
    for (const move of plan.moves) board.move(move);
    expect(board.isCheck()).toBe(false);
  });

describe("compensation et décision de reprise", () => {
  it("garde un gain ailleurs plutôt que de ne montrer que la perte de tour", () => {
    const moves = ["c3f6", "b4d3"];
    const { context, victimId, evidence } = fixture(
      "8/p7/5r1k/3n4/8/2BQ4/8/7K b - - 0 1",
      "d5b4",
      "f6",
      moves,
    );
    expect(evidence).toMatchObject({
      outcome: "compensated",
      materialDelta: 4,
    });
    expect(captureIllustration(context, victimId, evidence)).toEqual({
      moves,
      omittedMoves: [],
      materialDelta: 4,
      proofMaterialDelta: 4,
    });
  });
  for (const test of [
    {
      fen: "6k1/p7/8/7Q/8/8/8/1Br1R2K w - - 0 1",
      played: "h1h2",
      square: "b1",
      moves: ["c1b1", "h5h7", "g8f8", "e1b1"],
    },
    {
      fen: "1bR1r2k/8/8/8/7q/8/P7/6K1 b - - 0 1",
      played: "h8h7",
      square: "b8",
      moves: ["c8b8", "h4h2", "g1f1", "e8b8"],
    },
  ])
    it(`garde l'échec intermédiaire et la reprise différée : ${test.square}`, () => {
      const { context, victimId, evidence } = fixture(
        test.fen,
        test.played,
        test.square,
        test.moves,
      );
      expect(evidence).toMatchObject({
        outcome: "compensated",
        materialDelta: 2,
      });
      expect(captureIllustration(context, victimId, evidence).moves).toEqual(
        test.moves,
      );
      const partial = fixture(
        test.fen,
        test.played,
        test.square,
        test.moves.slice(0, 3),
      );
      expect(partial.evidence).toMatchObject({
        outcome: "unresolved",
        ending: "pending-recapture",
      });
      expect(
        captureIllustration(partial.context, partial.victimId, partial.evidence)
          .moves,
      ).toEqual(test.moves.slice(0, 3));
    });
  for (const test of [
    {
      fen: "6k1/p3P3/8/8/8/8/8/1Br4K w - - 0 1",
      played: "h1h2",
      square: "b1",
      moves: ["c1b1", "e7e8q", "g8h7"],
    },
    {
      fen: "1bR4k/8/8/8/8/8/P3p3/6K1 b - - 0 1",
      played: "h8h7",
      square: "b8",
      moves: ["c8b8", "e2e1q", "g1h2"],
    },
  ])
    it(`garde la compensation par promotion : ${test.square}`, () => {
      const { context, victimId, evidence } = fixture(
        test.fen,
        test.played,
        test.square,
        test.moves,
      );
      expect(evidence).toMatchObject({
        outcome: "compensated",
        materialDelta: 5,
      });
      expect(captureIllustration(context, victimId, evidence)).toEqual({
        moves: test.moves,
        omittedMoves: [],
        materialDelta: 5,
        proofMaterialDelta: 5,
      });
    });
  it("montre le choix d'une autre réponse malgré les reprises légales", () => {
    const moves = ["d3d4", "c5d4", "e3d4", "e5d4", "f1e1"];
    const { context, victimId, evidence } = fixture(
      "r1bq1r1k/2n1b1pp/1p1p4/p1p1pp2/P1P1P3/1B1PBN2/1P1Q1PPP/R4RK1 b - - 1 14",
      "f5f4",
      "e3",
      moves,
    );
    expect(evidence).toMatchObject({
      outcome: "loss-in-line",
      ending: "recapture-not-chosen",
    });
    const plan = captureIllustration(context, victimId, evidence);
    expect(plan.moves).toEqual(moves);
    expect(plan.omittedMoves).toEqual([]);
    expect(evidence.replies.at(-1)).toMatchObject({
      state: "not-chosen",
      available: ["f3d4", "d2d4"],
    });
  });
});

it("ne donne pas une conclusion matérielle à une variante terminée par une nulle", () => {
  const { context, victimId, evidence } = fixture(
    "7k/8/8/8/8/8/2r5/1B5K b - - 0 1",
    "h8g8",
    "c2",
    ["b1c2", "g8f8"],
  );
  expect(evidence).toMatchObject({
    outcome: "unresolved",
    ending: "draw",
    moves: ["b1c2"],
  });
  expect(captureIllustration(context, victimId, evidence).moves).toEqual([
    "b1c2",
  ]);
});
it("garde le mat adverse comme fin du témoin sans explication de perte de pièce", () => {
  const { context, victimId, evidence } = fixture(
    "6k1/8/3b4/8/5q2/8/6PP/1B4RK w - - 0 1",
    "b1c2",
    "b1",
    ["f4h2"],
  );
  expect(evidence).toMatchObject({
    outcome: "unresolved",
    ending: "mate",
    moves: ["f4h2"],
  });
  expect(captureIllustration(context, victimId, evidence).moves).toEqual([
    "f4h2",
  ]);
});

it("conserve une compensation ailleurs même quand la perte reste négative", () => {
  const moves = ["d8d1", "f1d1", "f6e4", "e2f3", "h8g8"];
  const { context, victimId, evidence } = fixture(
    "rnbr1b1k/ppp1qppp/4pn2/8/4p3/3P1p1N/PPP1BPPP/RNBQ1RK1 w - - 0 1",
    "d3e4",
    "d1",
    moves,
  );
  expect(evidence).toMatchObject({
    outcome: "loss-in-line",
    materialDelta: -3,
  });
  expect(captureIllustration(context, victimId, evidence)).toEqual({
    moves: moves.slice(0, 4),
    omittedMoves: [],
    materialDelta: -3,
    proofMaterialDelta: -3,
  });
});
it("conserve une promotion compensatrice dans une ligne toujours perdante", () => {
  const moves = ["d8d1", "e7e8q", "g8h7"];
  const { context, victimId, evidence } = fixture(
    "3r2k1/p3P3/8/8/8/8/8/3Q3K w - - 0 1",
    "h1h2",
    "d1",
    moves,
  );
  expect(evidence).toMatchObject({
    outcome: "loss-in-line",
    materialDelta: -1,
  });
  expect(captureIllustration(context, victimId, evidence)).toEqual({
    moves,
    omittedMoves: [],
    materialDelta: -1,
    proofMaterialDelta: -1,
  });
});
