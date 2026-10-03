import { Chess } from "chess.js";
import entries from "./corpus.json";
import { frenchSan, gamePositions, type ReviewResult } from "../model";
import { understandDecision } from "./prototype";

export type CorpusCase = {
  id: string;
  family: string;
  origin: string;
  notes: string;
  fen: string;
  prefix: string[];
  played: string;
  line: string[];
  expected: {
    partialHypotheses?: string[];
    hypothesis?: string | null;
    victim?: string;
    role?: string;
    capture?: string;
    closed?: string;
    exchange?: { role: string; total: number; fromDecision: number };
  };
  forbiddenClaims: string[];
};
export const corpus: CorpusCase[] = entries;
export function corpusInput(test: CorpusCase) {
  const board = new Chess(test.fen);
  for (const move of test.prefix) board.move(move);
  board.move(test.played);
  const position = gamePositions(board.pgn())[test.prefix.length];
  const moves = test.line.map((san) => board.move(san));
  const variation = moves.map((move) => ({
    label: frenchSan(move.san),
    fen: move.after,
    from: move.from,
    to: move.to,
  }));
  const first = moves[0];
  const result: ReviewResult | null = first
    ? {
        score: null,
        depth: null,
        bestMove: first.from + first.to + (first.promotion ?? ""),
        bestSan: frenchSan(first.san),
        variation,
      }
    : null;
  return { position, result };
}
export type CorpusRow = {
  id: string;
  family: string;
  origin: string;
  expected: string | null;
  observed: string[];
  matched: boolean;
  falseHypotheses: number;
  partialHypotheses: number;
  unreviewedRelationCandidates: number;
  publishableExplanation: boolean;
  elapsedMs: number;
};
export function evaluateCorpus(): CorpusRow[] {
  return corpus.map((test) => {
    const { position, result } = corpusInput(test),
      start = performance.now();
    const analysis = understandDecision(position, result);
    const observed = [...analysis.hypotheses, ...analysis.mechanisms].map(
      (h) => h.kind,
    ) as string[];
    if (analysis.exchange) observed.push("exchange-context");
    const expected = test.expected.exchange
      ? "exchange-context"
      : (test.expected.hypothesis ?? null);
    const matchesHypothesis = (h: (typeof analysis.hypotheses)[number]) =>
      h.kind === expected &&
      (!test.expected.victim || h.victimSquare === test.expected.victim) &&
      (!test.expected.closed ||
        h.closedRoutes.some((route) => route.to === test.expected.closed));
    const matchesRelation = (h: (typeof analysis.mechanisms)[number]) =>
      h.kind === expected &&
      (!test.expected.role || h.role === test.expected.role) &&
      (!test.expected.capture || h.capture === test.expected.capture);
    const matchesExchange =
      !!test.expected.exchange &&
      !!analysis.exchange &&
      analysis.exchange.role === test.expected.exchange.role &&
      analysis.exchange.totalBalance === test.expected.exchange.total &&
      analysis.exchange.balanceFromDecision ===
        test.expected.exchange.fromDecision;
    return {
      id: test.id,
      family: test.family,
      origin: test.origin,
      expected,
      observed,
      matched: test.expected.exchange
        ? matchesExchange
        : analysis.hypotheses.some(matchesHypothesis) ||
          analysis.mechanisms.some(matchesRelation),
      falseHypotheses:
        analysis.hypotheses.filter(
          (h) =>
            !matchesHypothesis(h) &&
            !test.expected.partialHypotheses?.includes(h.kind),
        ).length +
        (test.expected.exchange && analysis.exchange && !matchesExchange
          ? 1
          : 0),
      partialHypotheses: analysis.hypotheses.filter((h) =>
        test.expected.partialHypotheses?.includes(h.kind),
      ).length,
      // Les anciens exemples n'annotent pas encore tous les motifs secondaires
      // des nouvelles familles. Les afficher comme non relus, jamais comme justes.
      unreviewedRelationCandidates: analysis.mechanisms.filter(
        (h) => !matchesRelation(h),
      ).length,
      publishableExplanation: analysis.explanation !== null,
      elapsedMs: Math.round(performance.now() - start),
    };
  });
}
export function corpusReport(rows: CorpusRow[]) {
  const positives = rows.filter((row) => row.expected !== null),
    negatives = rows.filter((row) => row.expected === null);
  return {
    stage: "prototype-facts-and-hypotheses",
    assessedFalseHypotheses: ["restriction", "exchange-context"],
    independentValidation: false,
    positions: rows.length,
    expectedInsights: positives.length,
    recognizedInsights: positives.filter((row) => row.matched).length,
    missingInsights: positives
      .filter((row) => !row.matched)
      .map((row) => row.id),
    counterexamples: negatives.length,
    falseHypotheses: rows.reduce((sum, row) => sum + row.falseHypotheses, 0),
    partialHypotheses: rows.reduce(
      (sum, row) => sum + row.partialHypotheses,
      0,
    ),
    unreviewedRelationCandidates: rows.reduce(
      (sum, row) => sum + row.unreviewedRelationCandidates,
      0,
    ),
    publishableExplanations: rows.filter((row) => row.publishableExplanation)
      .length,
    totalMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
    origins: [...new Set(rows.map((row) => row.origin))].map((origin) => ({
      origin,
      positions: rows.filter((row) => row.origin === origin).length,
    })),
    families: [...new Set(rows.map((row) => row.family))].map((family) => ({
      family,
      positions: rows.filter((row) => row.family === family).length,
      expected: positives.filter((row) => row.family === family).length,
      recognized: positives.filter(
        (row) => row.family === family && row.matched,
      ).length,
      falseHypotheses: rows
        .filter((row) => row.family === family)
        .reduce((sum, row) => sum + row.falseHypotheses, 0),
    })),
  };
}
