import { Chess } from "chess.js";
import entries from "./corpus.json";
import { frenchSan, gamePositions, type ReviewResult } from "../model";
import { understandDecision, type Understanding } from "./prototype";
import type { RelationHypothesis } from "./mechanisms";
import type { TacticalHypothesis } from "./constraints";

export type ConstraintAnnotation = {
  kind: TacticalHypothesis["kind"];
  role: TacticalHypothesis["role"];
  attackerId: string;
  targetIds: string[];
  move?: string;
  meaning: "primary" | "secondary";
  reason: string;
};

export type RelationAnnotation = {
  kind: RelationHypothesis["kind"];
  role: RelationHypothesis["role"];
  victimId: string;
  attackerId: string;
  capture: string;
  meaning: "primary" | "secondary";
  reason: string;
};
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
    /** Absence : annotation incomplète. [] : aucune relation attendue. */
    relations?: RelationAnnotation[];
    constraints?: ConstraintAnnotation[];
  };
  forbiddenClaims: string[];
};
export const corpus = entries as CorpusCase[];
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
  relationsAnnotated: boolean;
  relationAssessments: {
    kind: RelationHypothesis["kind"];
    role: RelationHypothesis["role"];
    victimId: string;
    attackerId: string;
    capture: string;
    status: "primary" | "secondary" | "unexpected" | "unreviewed";
  }[];
  matchedSecondaryRelations: number;
  missingExpectedRelations: RelationAnnotation[];
  unreviewedRelationCandidates: number;
  exchangeMatched: boolean | null;
  unreviewedExchangeCandidate: boolean;
  constraintsAnnotated: boolean;
  constraintAssessments: (Omit<ConstraintAnnotation, "meaning" | "reason"> & {
    status: "primary" | "secondary" | "unexpected" | "unreviewed";
  })[];
  missingExpectedConstraints: ConstraintAnnotation[];
  publishableExplanation: boolean;
  elapsedMs: number;
};
const matchesAnnotation = (
  h: RelationHypothesis,
  expected: RelationAnnotation,
) =>
  h.kind === expected.kind &&
  h.role === expected.role &&
  h.victimId === expected.victimId &&
  h.attackerId === expected.attackerId &&
  h.capture === expected.capture;

const constraintMove = (h: TacticalHypothesis) =>
  "move" in h.fact ? h.fact.move : "mate" in h.fact ? h.fact.mate : undefined;
const matchesConstraint = (h: TacticalHypothesis, a: ConstraintAnnotation) =>
  h.kind === a.kind && h.role === a.role && h.attackerId === a.attackerId &&
  JSON.stringify([...h.targetIds].sort()) === JSON.stringify([...a.targetIds].sort()) &&
  (!a.move || constraintMove(h) === a.move);

/** Annoter les sorties sans les transformer en vérité attendue. Une relation
 * secondaire correcte ne remplace jamais l'idée principale manquante. */
export function assessDecision(
  test: CorpusCase,
  analysis: Understanding,
  elapsedMs = 0,
): CorpusRow {
  const observed = [...analysis.hypotheses, ...analysis.mechanisms, ...analysis.constraints.hypotheses].map(
    (h) => h.kind,
  ) as string[];
  if (analysis.exchange) observed.push("exchange-context");
  const expected =
    test.expected.hypothesis !== undefined
      ? test.expected.hypothesis
      : test.expected.exchange
        ? "exchange-context"
        : null;
  const matchesHypothesis = (h: Understanding["hypotheses"][number]) =>
    h.kind === expected &&
    (!test.expected.victim || h.victimSquare === test.expected.victim) &&
    (!test.expected.closed ||
      h.closedRoutes.some((route) => route.to === test.expected.closed));
  const matchesLegacyRelation = (h: RelationHypothesis) =>
    h.kind === expected &&
    (!test.expected.role || h.role === test.expected.role) &&
    (!test.expected.capture || h.capture === test.expected.capture);
  const annotations = test.expected.relations;
  const relationAssessments: CorpusRow["relationAssessments"] =
    analysis.mechanisms.map((h) => {
      const annotation = annotations?.find((a) => matchesAnnotation(h, a));
      return {
        kind: h.kind,
        role: h.role,
        victimId: h.victimId,
        attackerId: h.attackerId,
        capture: h.capture,
        status:
          annotation?.meaning ??
          (annotations !== undefined
            ? "unexpected"
            : matchesLegacyRelation(h)
              ? "primary"
              : "unreviewed"),
      };
    });
  const exchangeMatched = test.expected.exchange
    ? !!analysis.exchange &&
      analysis.exchange.role === test.expected.exchange.role &&
      analysis.exchange.totalBalance === test.expected.exchange.total &&
      analysis.exchange.balanceFromDecision ===
        test.expected.exchange.fromDecision
    : null;
  const constraintAssessments: CorpusRow["constraintAssessments"] =
    analysis.constraints.hypotheses.map((h) => ({
      kind: h.kind, role: h.role, attackerId: h.attackerId, targetIds: h.targetIds,
      move: constraintMove(h),
      status: test.expected.constraints?.find((a) => matchesConstraint(h, a))?.meaning ??
        (test.expected.constraints !== undefined ? "unexpected" : "unreviewed"),
    }));
  return {
    id: test.id,
    family: test.family,
    origin: test.origin,
    expected,
    observed,
    matched:
      expected === "exchange-context"
        ? exchangeMatched === true
        : analysis.hypotheses.some(matchesHypothesis) ||
          relationAssessments.some(
            (h) => h.status === "primary" && h.kind === expected,
          ) || constraintAssessments.some((h) => h.status === "primary" && h.kind === expected),
    falseHypotheses:
      analysis.hypotheses.filter(
        (h) =>
          !matchesHypothesis(h) &&
          !test.expected.partialHypotheses?.includes(h.kind),
      ).length +
      (exchangeMatched === false && analysis.exchange ? 1 : 0) +
      relationAssessments.filter((h) => h.status === "unexpected").length +
      constraintAssessments.filter((h) => h.status === "unexpected").length,
    partialHypotheses: analysis.hypotheses.filter((h) =>
      test.expected.partialHypotheses?.includes(h.kind),
    ).length,
    relationsAnnotated: annotations !== undefined,
    relationAssessments,
    matchedSecondaryRelations:
      annotations?.filter(
        (a) =>
          a.meaning === "secondary" &&
          analysis.mechanisms.some((h) => matchesAnnotation(h, a)),
      ).length ?? 0,
    missingExpectedRelations:
      annotations?.filter(
        (a) => !analysis.mechanisms.some((h) => matchesAnnotation(h, a)),
      ) ?? [],
    unreviewedRelationCandidates: relationAssessments.filter(
      (h) => h.status === "unreviewed",
    ).length,
    exchangeMatched,
    unreviewedExchangeCandidate: !!analysis.exchange && !test.expected.exchange,
    constraintsAnnotated: test.expected.constraints !== undefined,
    constraintAssessments,
    missingExpectedConstraints: test.expected.constraints?.filter((a) =>
      !analysis.constraints.hypotheses.some((h) => matchesConstraint(h, a))) ?? [],
    publishableExplanation: analysis.explanation !== null,
    elapsedMs: Math.round(elapsedMs),
  };
}
export function evaluateCorpus(cases: CorpusCase[] = corpus): CorpusRow[] {
  return cases.map((test) => {
    const { position, result } = corpusInput(test);
    const start = performance.now();
    const analysis = understandDecision(position, result);
    return assessDecision(test, analysis, performance.now() - start);
  });
}
export function corpusReport(rows: CorpusRow[]) {
  const positives = rows.filter((row) => row.expected !== null),
    negatives = rows.filter((row) => row.expected === null);
  return {
    stage: "prototype-facts-and-hypotheses",
    assessedFalseHypotheses: [
      "restriction",
      "exchange-context",
      "defender-removal",
      "opened-line",
      "double-threat", "pin", "mate-threat", "deflection-mate",
    ],
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
    matchedSecondaryRelations: rows.reduce(
      (sum, row) => sum + row.matchedSecondaryRelations,
      0,
    ),
    missingExpectedRelations: rows.flatMap((row) =>
      row.missingExpectedRelations.map((a) => ({ id: row.id, ...a })),
    ),
    relationAnnotationCoverage: {
      completeDecisions: rows.filter((row) => row.relationsAnnotated).length,
      incompleteDecisions: rows.filter((row) => !row.relationsAnnotated).length,
      reviewedCandidates: rows
        .flatMap((row) => row.relationAssessments)
        .filter((h) => h.status !== "unreviewed").length,
      unexpectedCandidates: rows
        .flatMap((row) => row.relationAssessments)
        .filter((h) => h.status === "unexpected").length,
    },
    unreviewedRelationCandidates: rows.reduce(
      (sum, row) => sum + row.unreviewedRelationCandidates,
      0,
    ),
    constraintAnnotationCoverage: {
      completeDecisions: rows.filter((r) => r.constraintsAnnotated).length,
      incompleteDecisions: rows.filter((r) => !r.constraintsAnnotated).length,
      reviewedCandidates: rows.flatMap((r) => r.constraintAssessments).filter((a) => a.status !== "unreviewed").length,
      unexpectedCandidates: rows.flatMap((r) => r.constraintAssessments).filter((a) => a.status === "unexpected").length,
      unreviewedCandidates: rows.flatMap((r) => r.constraintAssessments).filter((a) => a.status === "unreviewed").length,
      matchedSecondary: rows.flatMap((r) => r.constraintAssessments).filter((a) => a.status === "secondary").length,
    },
    missingExpectedConstraints: rows.flatMap((r) => r.missingExpectedConstraints.map((a) => ({ id: r.id, ...a }))),
    exchangeAnnotationCoverage: {
      annotatedCandidates: rows.filter((row) => row.exchangeMatched !== null)
        .length,
      unreviewedCandidates: rows.filter(
        (row) => row.unreviewedExchangeCandidate,
      ).length,
      missingExpected: rows
        .filter((row) => row.exchangeMatched === false)
        .map((row) => row.id),
    },
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
