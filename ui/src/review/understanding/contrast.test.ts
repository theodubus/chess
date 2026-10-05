import { expect, it } from "vitest";
import { corpus, corpusInput } from "./corpus";
import { understandDecision } from "./prototype";
import {
  attributeRestriction,
  observeContrast,
  planContrast,
} from "./contrast";
import { boardFromCommand } from "../StudyTree";
import { legalVariation } from "../model";
import cases from "./contrastCases.json";

const inputFor = (test = cases[0]) => {
  const input = corpusInput({
    ...corpus.find((c) => c.id === test.source)!,
    ...(test.fen ? { fen: test.fen } : {}),
    ...(test.played ? { played: test.played, line: test.line } : {}),
  });
  return understandDecision(input.position, input.result);
};
for (const test of cases) {
  it(`compare les contraintes : ${test.id}`, () => {
    const understanding = inputFor(test),
      original = JSON.stringify(understanding),
      hypothesis = understanding.hypotheses[0],
      plan = planContrast(understanding, hypothesis, test.alternative);
    expect(plan.reason).toBe(test.expected);
    expect(JSON.stringify(understanding)).toBe(original);
    if (test.defence) {
      expect(plan.routes.some((r) => r.move === test.defence)).toBe(true);
      expect(plan.position!.command).toContain(test.alternative);
      expect(boardFromCommand(plan.position!.command).fen()).toBe(
        plan.position!.fen,
      );
      const observation = observeContrast(plan, {
        score: { kind: "cp", value: 0 },
        depth: 15,
        bestMove: test.defence,
        bestSan: null,
        variation: legalVariation(plan.position!.fen, [test.defence]),
      });
      expect(observation.evidence?.outcome).toBe("preserved");
      expect(
        attributeRestriction(
          [0, 1].map(() => ({
            alternative: test.alternative,
            contrast: observation,
          })),
          {
            lossSupported: true,
            alternativeBetter: true,
            victimSide: understanding.context.before.turn,
            originalScores: [0, 1].map(() => ({
              kind: "cp",
              value: understanding.context.before.turn === "w" ? -300 : 300,
            })),
          },
        ).status,
      ).toBe("supported");
      expect(observation.usedRoute?.pieceId).toBe(hypothesis.victimId);
      expect(observation.usedRoute?.blockerId).toBe(
        hypothesis.closedRoutes[0].blockerId,
      );
    } else {
      expect(plan.position).toBeUndefined();
      expect(plan.routes).toEqual([]);
    }
  });
}
it("refuse de comparer le coup avec lui-même ou d'inventer un coup illégal", () => {
  const understanding = inputFor(),
    h = understanding.hypotheses[0];
  expect(() => planContrast(understanding, h, "e2d2")).toThrow();
  expect(() => planContrast(understanding, h, "g1g4")).toThrow();
  expect(planContrast(understanding, h, null).reason).toBe("no-alternative");
});
it("la création d'une attaque n'est pas présentée comme une retraite fermée", () => {
  const input = corpusInput(
      corpus.find((c) => c.id === "pawn-exploits-restriction")!,
    ),
    understanding = understandDecision(input.position, input.result);
  expect(
    planContrast(understanding, understanding.hypotheses[0], "h8g8").reason,
  ).toBe("different-role");
});
it("exige un écart vérifié, une perte et la défense observée, pas seulement une possibilité géométrique", () => {
  const understanding = inputFor(),
    plan = planContrast(
      understanding,
      understanding.hypotheses[0],
      cases[0].alternative,
    ),
    contrast = observeContrast(plan, {
      score: { kind: "cp", value: 0 },
      depth: 15,
      bestMove: "e3d2",
      bestSan: null,
      variation: legalVariation(plan.position!.fen, ["e3d2"]),
    }),
    passes = [300, 900].map(() => ({
      alternative: cases[0].alternative,
      contrast,
    }));
  const conditions = {
    lossSupported: true,
    alternativeBetter: true,
    originalScores: [
      { kind: "cp" as const, value: -300 },
      { kind: "cp" as const, value: -300 },
    ],
    victimSide: "w" as const,
  };
  expect(attributeRestriction(passes, conditions)).toMatchObject({
    status: "supported",
    reason: "closed-retreat",
    scope: "conditional-mechanism",
  });
  expect(
    attributeRestriction(passes, { ...conditions, lossSupported: false })
      .reason,
  ).toBe("loss-not-verified");
  expect(
    attributeRestriction(passes, { ...conditions, alternativeBetter: false })
      .reason,
  ).toBe("advantage-not-verified");
  expect(
    attributeRestriction(
      [passes[0], { ...passes[1], contrast: { ...contrast, usedRoute: null } }],
      conditions,
    ).reason,
  ).toBe("defence-not-observed");
  expect(
    attributeRestriction(
      [passes[0], { ...passes[1], alternative: "e2d1" }],
      conditions,
    ).reason,
  ).toBe("unstable-alternative");
  expect(
    attributeRestriction(
      [
        passes[0],
        {
          ...passes[1],
          contrast: { ...contrast, score: { kind: "cp", value: -200 } },
        },
      ],
      conditions,
    ).reason,
  ).toBe("unstable-defence");
  expect(
    attributeRestriction(passes, {
      ...conditions,
      originalScores: [
        { kind: "cp", value: 0 },
        { kind: "cp", value: 0 },
      ],
    }).reason,
  ).toBe("defence-not-improved");
  expect(
    attributeRestriction(
      passes.map((p) => ({
        ...p,
        contrast: { ...contrast, score: { kind: "mate", value: -1 } },
      })),
      conditions,
    ).reason,
  ).toBe("unstable-defence");
});
