import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { corpus, corpusInput, corpusReport, evaluateCorpus } from "./corpus";
import { understandDecision } from "./prototype";
import { possibilities } from "./possibilities";
import { decisionContext } from "./context";
import { gamePositions } from "../model";

for (const test of corpus) {
  it(`corpus : ${test.id}`, () => {
    const { position, result } = corpusInput(test);
    const original = JSON.stringify({ position, result });
    const analysis = understandDecision(position, result);
    for (const frame of analysis.context.frames) {
      expect(boardFromCommand(frame.command).fen()).toBe(frame.fen);
      expect(new Set(frame.pieces.map((piece) => piece.id)).size).toBe(
        frame.pieces.length,
      );
      expect(frame.pieces.every((piece) => !!piece.id)).toBe(true);
    }
    if (test.expected.hypothesis === null)
      expect(analysis.hypotheses).toEqual([]);
    if (
      ["allows-restriction", "creates-restriction"].includes(
        test.expected.hypothesis ?? "",
      )
    ) {
      const hypothesis = analysis.hypotheses.find(
        (h) => h.kind === test.expected.hypothesis,
      );
      expect(hypothesis).toBeDefined();
      expect(hypothesis?.victimSquare).toBe(test.expected.victim);
      expect(
        hypothesis?.closedRoutes.some(
          (route) => route.to === test.expected.closed,
        ),
      ).toBe(true);
      expect(hypothesis?.exits.length).toBeGreaterThan(0);
      expect(
        hypothesis?.exits.every((exit) =>
          exit.captures.some((c) => c.balanceAfterImmediateRecapture < 0),
        ),
      ).toBe(true);
    }
    if (test.expected.exchange) {
      expect(analysis.exchange?.role).toBe(test.expected.exchange.role);
      expect(analysis.exchange?.totalBalance).toBe(
        test.expected.exchange.total,
      );
      expect(analysis.exchange?.balanceFromDecision).toBe(
        test.expected.exchange.fromDecision,
      );
    }
    // Aucun fait ou bilan n'est promu en raison du verdict par ce prototype.
    expect(analysis.explanation).toBeNull();
    expect(
      analysis.hypotheses.every(
        (h) =>
          h.status === "hypothesis" &&
          h.unverified.includes("intermediate-moves"),
      ),
    ).toBe(true);
    expect(JSON.stringify({ position, result })).toBe(original);
  });
}

describe("frontières des faits échiquéens", () => {
  it("un attaquant géométrique cloué n'est pas un preneur légal", () => {
    const { position } = corpusInput(
      corpus.find((test) => test.id === "pinned-capturer")!,
    );
    const analysis = understandDecision(position);
    const bishop = possibilities(analysis.context.after, "w").pieces.find(
      (piece) => piece.piece.square === "d5",
    )!;
    expect(bishop.geometricAttackers).toContain("e7");
    expect(bishop.legalCapturers).toEqual([]);
  });
  it("une sonde de trait indisponible pendant un échec n'est pas une absence de menace", () => {
    const { position, result } = corpusInput(
      corpus.find((test) => test.id === "fork")!,
    );
    const analysis = understandDecision(position, result);
    expect(new Chess(analysis.context.after.fen).isCheck()).toBe(true);
    expect(possibilities(analysis.context.after, "w").status).toBe(
      "unavailable",
    );
  });
  it("conserve la borne inconnue d'un échange provenant d'une FEN tronquée", () => {
    const { position, result } = corpusInput(
      corpus.find((test) => test.id === "losing-exchange-recapture")!,
    );
    const truncated = { ...position, command: `position fen ${position.fen}` };
    const analysis = understandDecision(truncated, result);
    expect(analysis.exchange?.beginning).toBe("unknown");
    expect(analysis.exchange?.role).toBe("first-visible-capture");
    expect(analysis.exchange?.totalBalance).toBe(2);
    expect(analysis.explanation).toBeNull();
  });
  it("rejette la variante étrangère et les historiques incohérents", () => {
    const { position, result } = corpusInput(corpus[0]);
    expect(() =>
      understandDecision({ ...position, command: "position startpos" }, result),
    ).toThrow("incohérents");
    expect(() =>
      understandDecision(position, {
        ...result!,
        variation: [{ ...result!.variation[0], fen: position.fen }],
      }),
    ).toThrow("incohérente");
  });
});
it("rapporte les familles non reconnues et distingue les faits des explications validées", () => {
  const rows = evaluateCorpus(),
    report = corpusReport(rows);
  expect(
    report.falseHypotheses,
    JSON.stringify(rows.filter((row) => row.falseHypotheses)),
  ).toBe(0);
  expect(report.missingInsights).toEqual(
    expect.arrayContaining([
      "fork",
      "pin",
      "defender-removed",
      "discovered-attack",
      "mate-threat",
    ]),
  );
  expect(report.publishableExplanations).toBe(0);
  expect(report.partialHypotheses).toBe(1);
  expect(report.recognizedInsights).toBeLessThan(report.expectedInsights);
  console.info(JSON.stringify(report, null, 2));
}, 20000);

it("suit les pièces au roque et à la promotion, et retire le bon pion en passant", () => {
  const make = (fen: string | undefined, prefix: string[], played: string) => {
    const board = new Chess(fen);
    prefix.forEach((move) => board.move(move));
    board.move(played);
    return decisionContext(gamePositions(board.pgn())[prefix.length]);
  };
  const castle = make(
    "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
    [],
    "O-O",
  );
  expect(castle.after.pieces).toContainEqual({
    id: "w:k:e1",
    color: "w",
    type: "k",
    square: "g1",
  });
  expect(castle.after.pieces).toContainEqual({
    id: "w:r:h1",
    color: "w",
    type: "r",
    square: "f1",
  });
  const promotion = make("7k/P7/8/8/8/8/8/7K w - - 0 1", [], "a8=Q+");
  expect(promotion.after.pieces).toContainEqual({
    id: "w:p:a7",
    color: "w",
    type: "q",
    square: "a8",
  });
  const enPassant = make(undefined, ["e4", "a6", "e5", "d5"], "exd6");
  expect(enPassant.after.pieces).toContainEqual({
    id: "w:p:e2",
    color: "w",
    type: "p",
    square: "d6",
  });
  expect(enPassant.after.pieces.some((piece) => piece.id === "b:p:d7")).toBe(
    false,
  );
  expect(enPassant.priorHistory).toBe("complete");
});
