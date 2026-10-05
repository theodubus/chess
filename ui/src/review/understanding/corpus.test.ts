import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import {
  assessDecision,
  corpus,
  corpusInput,
  corpusReport,
  evaluateCorpus,
} from "./corpus";
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
  expect(report.missingInsights).toEqual([]);
  expect(report.recognizedInsights).toBe(12);
  expect(report.unreviewedRelationCandidates).toBe(0);
  expect(report.matchedSecondaryRelations).toBe(3);
  expect(report.missingExpectedRelations).toEqual([]);
  expect(report.relationAnnotationCoverage).toEqual({
    completeDecisions: 19,
    incompleteDecisions: 0,
    reviewedCandidates: 5,
    unexpectedCandidates: 0,
  });
  expect(report.exchangeAnnotationCoverage).toEqual({
    annotatedCandidates: 5,
    unreviewedCandidates: 0,
    missingExpected: [],
  });
  expect(report.publishableExplanations).toBe(0);
  expect(report.partialHypotheses).toBe(1);
  expect(report.constraintAnnotationCoverage).toMatchObject({ completeDecisions: 19, incompleteDecisions: 0, unreviewedCandidates: 0, unexpectedCandidates: 0 });
  expect(report.missingExpectedConstraints).toEqual([]);
  expect(report.independentValidation).toBe(false);
  console.info(JSON.stringify(report, null, 2));
}, 60000);

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
it("les contraintes sont évaluées par rôle, identités, cibles et coup, pas par libellé seul", () => {
  const test = corpus.find((c) => c.id === "fork")!;
  const { position, result } = corpusInput(test);
  const analysis = understandDecision(position, result);
  for (const change of [
    { role: "allows-loss" as const },
    { attackerId: "w:n:c7" },
    { targetIds: ["b:k:e8"] },
    { targetIds: ["b:k:e8", "b:r:h8"] },
    { move: "c7b5" },
  ]) {
    const annotation = { ...test.expected.constraints![0], ...change };
    const row = assessDecision({ ...test, expected: { ...test.expected, constraints: [annotation] } }, analysis);
    expect(row.matched).toBe(false);
    expect(row.falseHypotheses).toBe(1);
    expect(row.missingExpectedConstraints).toEqual([annotation]);
  }
  const missing = assessDecision({ ...test, expected: { ...test.expected, constraints: undefined } }, analysis);
  expect(missing.constraintsAnnotated).toBe(false);
  expect(missing.constraintAssessments[0].status).toBe("unreviewed");
  expect(missing.matched).toBe(false);
  const absent = assessDecision({ ...test, expected: { ...test.expected, constraints: [] } }, analysis);
  expect(absent.falseHypotheses).toBe(1);
});

for (const id of ["pin", "discovered-attack", "mate-threat"])
  it(`une relation secondaire ne remplace pas l'idée principale : ${id}`, () => {
    const test = corpus.find((c) => c.id === id)!;
    const { position, result } = corpusInput(test);
    const analysis = understandDecision(position, result);
    const row = assessDecision(test, {
      ...analysis,
      constraints: { ...analysis.constraints, hypotheses: [] },
    });
    expect(row.matchedSecondaryRelations).toBe(1);
    expect(row.matched).toBe(id === "discovered-attack");
    expect(row.falseHypotheses).toBe(0);
    expect(row.publishableExplanation).toBe(false);
  });

it("une relation inattendue est une erreur mesurée, pas un candidat ignoré", () => {
  const test = corpus.find((c) => c.id === "discovered-attack")!;
  const { position, result } = corpusInput(test);
  const analysis = understandDecision(position, result);
  const row = assessDecision(
    {
      ...test,
      expected: {
        ...test.expected,
        relations: test.expected.relations!.filter(
          (a) => a.meaning === "primary",
        ),
      },
    },
    analysis,
  );
  expect(row.matched).toBe(true);
  expect(row.falseHypotheses).toBe(1);
  expect(row.unreviewedRelationCandidates).toBe(0);
  expect(
    row.relationAssessments.find((h) => h.status === "unexpected"),
  ).toMatchObject({
    victimId: "w:r:d1",
    attackerId: "b:q:d8",
    capture: "d8d1",
    role: "allows-loss",
  });
});
it("une mauvaise capture ou identité ne satisfait pas une annotation du même libellé", () => {
  const test = corpus.find((c) => c.id === "defender-removed")!;
  const { position, result } = corpusInput(test);
  const analysis = understandDecision(position, result);
  // Injection d'une erreur de détecteur : aucune nouvelle position inventée.
  for (const changed of [
    { role: "allows-loss" },
    { capture: "c3d5" },
    { victimId: "b:n:d5" },
    { attackerId: "w:b:c4" },
  ]) {
    const faulty = structuredClone(analysis);
    Object.assign(faulty.mechanisms[0], changed);
    const row = assessDecision(test, faulty);
    expect(row.matched).toBe(false);
    expect(row.falseHypotheses).toBe(1);
    expect(row.missingExpectedRelations).toHaveLength(1);
  }
});
it("une annotation absente reste non relue, contrairement à une liste vide", () => {
  const test = corpus.find((c) => c.id === "pin")!;
  const { position, result } = corpusInput(test);
  const analysis = understandDecision(position, result);
  const unreviewed = assessDecision(
    { ...test, expected: { ...test.expected, relations: undefined } },
    analysis,
  );
  const rejected = assessDecision(
    { ...test, expected: { ...test.expected, relations: [] } },
    analysis,
  );
  expect(unreviewed.unreviewedRelationCandidates).toBe(1);
  expect(unreviewed.falseHypotheses).toBe(0);
  expect(unreviewed.relationsAnnotated).toBe(false);
  expect(rejected.falseHypotheses).toBe(1);
  expect(rejected.unreviewedRelationCandidates).toBe(0);
});

it("un bilan secondaire d'échange ne remplace pas une annotation principale négative", () => {
  const test = corpus.find((c) => c.id === "blocked-bishop-gains-queen")!;
  const { position, result } = corpusInput(test);
  const row = assessDecision(test, understandDecision(position, result));
  expect(row.expected).toBeNull();
  expect(row.matched).toBe(false);
  expect(row.exchangeMatched).toBe(true);
  expect(row.unreviewedExchangeCandidate).toBe(false);
  expect(row.falseHypotheses).toBe(0);
});
