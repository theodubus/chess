import { expect, it } from "vitest";
import { corpus, corpusInput } from "./corpus";
import { legalVariation } from "../model";
import { understandDecision } from "./prototype";
import {
  attributeRestriction,
  observeContrast,
  planContrast,
} from "./contrast";

const cases = [
  {
    id: "pawn-captures-attacker",
    source: "queen-closes-retreat",
    alternative: "e4f5",
    line: ["c8f5", "f3d2"],
    attacker: "b:p:f5",
    square: "f5",
  },
  {
    id: "en-passant-captures-attacker",
    source: "queen-closes-retreat",
    fen: "r1bq1r1k/2n1b1pp/1p1p4/p1p1Ppp1/P1P5/1B1PBN2/1P2QPPP/R4RK1 w - f6 0 14",
    alternative: "e5f6",
    line: ["g7f6", "f3d2"],
    attacker: "b:p:f5",
    square: "f5",
  },
  {
    id: "black-captures-attacker",
    source: "queen-closes-retreat-black",
    alternative: "e5f4",
    line: ["c1f4", "f6d7"],
    attacker: "w:p:f4",
    square: "f4",
  },
];
function example(test = cases[0]) {
  const input = corpusInput({
    ...corpus.find((c) => c.id === test.source)!,
    ...(test.fen ? { fen: test.fen } : {}),
  });
  const understanding = understandDecision(input.position, input.result);
  const plan = planContrast(
    understanding,
    understanding.hypotheses[0],
    test.alternative,
  );
  return { understanding, plan };
}
function observe(plan: ReturnType<typeof planContrast>, line = cases[0].line) {
  return observeContrast(plan, {
    score: { kind: "cp", value: 0 },
    depth: 15,
    bestMove: line[0],
    bestSan: null,
    variation: legalVariation(plan.branch!.after.fen, line),
  });
}
for (const test of cases)
  it(`prévention : ${test.id}`, () => {
    const { understanding, plan } = example(test);
    expect(plan).toMatchObject({
      reason: "attacker-removed",
      removedAttacker: {
        attackerId: test.attacker,
        square: test.square,
        capture: test.alternative,
      },
    });
    expect(plan.position).toBeUndefined();
    expect(plan.branch!.after.pieces.some((p) => p.id === test.attacker)).toBe(
      false,
    );
    const contrast = observe(plan, test.line);
    expect(contrast.evidence?.outcome).toBe("preserved");
    expect(contrast.evidence?.materialDelta).toBeCloseTo(0);
    expect(contrast.command).toBe(plan.branch!.after.command);
    const side = understanding.context.before.turn;
    expect(
      attributeRestriction(
        [0, 1].map(() => ({ alternative: test.alternative, contrast })),
        {
          lossSupported: true,
          alternativeBetter: true,
          victimSide: side,
          originalScores: [0, 1].map(() => ({
            kind: "cp",
            value: side === "w" ? -300 : 300,
          })),
        },
      ),
    ).toMatchObject({
      status: "supported",
      reason: "attacker-removed",
      attackerId: test.attacker,
      blockerId: null,
    });
  });
it("la disparition de l'attaquant ne prouve pas le sauvetage contre la réponse adverse", () => {
  const { plan } = example();
  const contrast = observe(plan, ["d6d5", "e3c5", "e7c5"]);
  expect(contrast.evidence).toMatchObject({
    outcome: "loss-in-line",
    materialDelta: -1,
  });
  expect(
    attributeRestriction(
      [0, 1].map(() => ({ alternative: cases[0].alternative, contrast })),
      {
        lossSupported: true,
        alternativeBetter: true,
        victimSide: "w",
        originalScores: [0, 1].map(() => ({ kind: "cp", value: -300 })),
      },
    ),
  ).toMatchObject({
    status: "not-established",
    reason: "defence-not-observed",
  });
  expect(observe(plan, ["c8f5"]).evidence?.outcome).toBe("unresolved");
});
it("prendre une autre pièce n'est pas supprimer l'auteur de la menace", () => {
  const { understanding } = example();
  const plan = planContrast(understanding, understanding.hypotheses[0], "f3e5");
  expect(plan.reason).not.toBe("attacker-removed");
  expect(plan.removedAttacker).toBeUndefined();
});
it("ne soutient pas la prévention sur les seuls scores ou sur des recherches divergentes", () => {
  const { plan } = example(),
    contrast = observe(plan);
  const passes = [0, 1].map(() => ({
    alternative: cases[0].alternative,
    contrast,
  }));
  const conditions = {
    lossSupported: true,
    alternativeBetter: true,
    victimSide: "w" as const,
    originalScores: [0, 1].map(() => ({ kind: "cp" as const, value: -300 })),
  };
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
    attributeRestriction(
      passes.map((p) => ({
        ...p,
        contrast: { ...contrast, score: { kind: "mate", value: 1 } },
      })),
      conditions,
    ).status,
  ).toBe("not-established");
});

it("ne confond pas la pièce qui joue la menace avec un autre attaquant découvert", () => {
  const { understanding } = example();
  const hypothesis = { ...understanding.hypotheses[0], attack: [] };
  expect(
    planContrast(understanding, hypothesis, cases[0].alternative).reason,
  ).toBe("illegal-threat");
});
