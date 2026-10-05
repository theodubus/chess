import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { explainMove } from "./explanations";
import { confirmForTest } from "./causeTestHelpers";
import { confirmCause } from "./decisionCause";
import { gamePositions, type ReviewResult, type ReviewPosition } from "./model";

function position(prefix: string[], san: string, fen?: string) {
  const game = new Chess(fen);
  for (const move of prefix) game.move(move);
  const index = game.history().length;
  game.move(san);
  return gamePositions(game.pgn())[index];
}
function result(fen: string, sans: string[], cp = 0): ReviewResult {
  const board = new Chess(fen);
  const moves = sans.map((san) => board.move(san));
  return {
    score: { kind: "cp", value: cp },
    depth: 14,
    bestMove: moves[0]
      ? moves[0].from + moves[0].to + (moves[0].promotion ?? "")
      : null,
    bestSan: sans[0] ?? null,
    variation: moves.map((move) => ({
      from: move.from,
      to: move.to,
      fen: move.after,
      label: move.san,
    })),
  };
}
function afterFen(position: ReviewPosition) {
  const board = new Chess(position.fen),
    move = position.played!;
  board.move({
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    promotion: move[4],
  });
  return board.fen();
}
const bad = { category: "blunder", reason: "", loss: 0.4 } as const;
const good = { category: "best", reason: "", loss: 0 } as const;

it("explique le mat effectivement joué sans avoir besoin d’une autre recherche", () => {
  const p = position(["f3", "e5", "g4"], "Qh4#");
  const explanation = explainMove(p, null, null, null);
  expect(explanation.summary).toBe("Ce coup donne échec et mat.");
  expect(explanation.played?.steps).toHaveLength(2);
  expect(explanation.played?.steps[1].text).toContain(
    "Noirs font échec et mat",
  );
});
it("montre une suite de mat sans la présenter comme une séquence forcée", () => {
  const p = position(["f3", "e5"], "g4");
  const explanation = explainMove(
    p,
    result(p.fen, ["Nc3"]),
    {
      ...result(afterFen(p), ["Qh4#"]),
      score: { kind: "mate", value: -1, winner: "b" },
    },
    bad,
  );
  expect(explanation.summary).toContain("échec et mat");
  expect(explanation.proof?.steps).toHaveLength(2);
  expect(explanation.summary).not.toContain("forcé");
  expect(explanation.alternative?.steps[0].fen).toBe(p.fen);
});
it("compare les conséquences matérielles des deux suites depuis la même position", () => {
  const p = position([], "Kh2", "r6k/8/8/8/8/8/8/R6K w - - 0 1");
  const draft = explainMove(
    p,
    result(p.fen, ["Rxa8+", "Kh7"], 500),
    result(afterFen(p), ["Rxa1", "Kh3"], -500),
    bad,
  );
  expect(draft.concrete).toBe(false);
  const explanation = confirmForTest(draft);
  expect(explanation.concrete).toBe(true);
  expect(explanation.summary).toContain("tour en a1");
  expect(explanation.proof?.steps).toHaveLength(2);
  expect(explanation.played?.steps[2].text).toContain("capturent la tour");
  expect(explanation.alternative?.steps[0].fen).toBe(p.fen);
  expect(explanation.played?.steps[0].fen).toBe(p.fen);
});
it("ne transforme pas une prise suivie d’une reprise disponible en pièce gagnée", () => {
  const p = position([], "Kb1", "r6k/8/8/8/8/8/1K6/R7 w - - 0 1");
  const explanation = explainMove(
    p,
    result(p.fen, ["Rxa8+", "Kh7"], 500),
    result(afterFen(p), ["Rxa1+"], -500),
    bad,
  );
  expect(new Chess(explanation.played!.steps.at(-1)!.fen).moves()).toContain(
    "Kxa1",
  );
  expect(explanation.concrete).toBe(false);
});
it("garde une limite honnête pour un échange équilibré ou une cause inconnue", () => {
  const p = position(["e4", "d5"], "exd5");
  const explanation = explainMove(
    p,
    result(p.fen, ["exd5"]),
    result(afterFen(p), ["Qxd5", "Nc3"]),
    good,
  );
  expect(explanation.concrete).toBe(false);
  expect(explanation.summary).toContain("pas encore identifiée");
});
for (const side of ["w", "b"] as const) {
  it(`explique la promotion pour ${side}`, () => {
    const p = position(
      [],
      side === "w" ? "a8=Q+" : "a1=Q+",
      side === "w"
        ? "7k/P7/8/8/8/8/8/7K w - - 0 1"
        : "7k/8/8/8/8/8/p7/7K b - - 0 1",
    );
    expect(explainMove(p, null, null, good).summary).toContain("8 points");
  });
}
it("refuse une PV illégale, venue d’ailleurs ou incohérente avec bestmove", () => {
  const p = position([], "e4");
  const valid = result(afterFen(p), ["e5", "Nf3"]);
  expect(
    explainMove(p, null, { ...valid, bestMove: "d7d5" }, good).played,
  ).toBeNull();
  expect(explainMove(p, null, result(p.fen, ["d4"]), good).played).toBeNull();
  const broken = {
    ...valid,
    variation: [...valid.variation, { ...valid.variation[0] }],
  };
  expect(explainMove(p, null, broken, good).played).toBeNull();
  expect(
    explainMove(
      { ...p, command: "position startpos moves d2d4" },
      null,
      valid,
      good,
    ).played,
  ).toBeNull();
});
it("borne la démonstration sans tirer de conclusion matérielle d’une PV coupée", () => {
  const p = position([], "e4");
  const explanation = explainMove(
    p,
    null,
    result(afterFen(p), [
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
      "a6",
      "Ba4",
      "Nf6",
      "O-O",
      "Be7",
    ]),
    good,
  );
  expect(explanation.played?.truncated).toBe(true);
  expect(explanation.played?.steps).toHaveLength(9);
  expect(explanation.concrete).toBe(false);
});

it("n’attribue pas de conséquence matérielle à un score seulement borné", () => {
  const p = position([], "Kh2", "r6k/8/8/8/8/8/8/R6K w - - 0 1");
  const before = result(p.fen, ["Rxa8+", "Kh7"], 500);
  const after = result(afterFen(p), ["Rxa1", "Kh3"], -500);
  expect(
    explainMove(
      p,
      before,
      {
        ...after,
        score: { kind: "cp", value: -500, bound: "upper" },
      },
      bad,
    ).concrete,
  ).toBe(false);
});
it("ne décrit pas un sacrifice approuvé par le moteur comme une erreur matérielle", () => {
  const p = position([], "Kh2", "r6k/8/8/8/8/8/8/R6K w - - 0 1");
  const explanation = explainMove(
    p,
    result(p.fen, ["Kh2"], 100),
    result(afterFen(p), ["Rxa1", "Kh3"], 100),
    { category: "brilliant", reason: "", loss: 0 },
  );
  expect(explanation.concrete).toBe(false);
  expect(explanation.played?.steps[2].text).toContain("capturent la tour");
});
it("décrit une sous-promotion avec capture et conserve l’historique UCI", () => {
  const p = position([], "axb8=N", "1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  const explanation = explainMove(p, null, null, good);
  expect(explanation.summary).toContain("cavalier : 2 points");
  expect(explanation.summary).toContain("en plus de la capture");
  expect(explanation.played?.steps[1].text).toContain("capture aussi la tour");
  expect(explanation.played?.steps[1].command).toBe(`${p.command} moves a7b8n`);
});

const longMaterialFen = "r6k/7p/8/8/8/3P4/6P1/R6K w - - 0 1";
const longAlternative = [
  "Rxa8+",
  "Kg7",
  "Kh2",
  "Kg6",
  "Kh3",
  "Kf5",
  "Kh2",
  "Ke6",
  "Kh3",
  "Kd5",
];
const longLoss = [
  "Kg8",
  "Kh2",
  "Kf8",
  "Kh3",
  "Ke8",
  "Kh2",
  "Kd8",
  "Kh3",
  "Rxa1",
  "Kh2",
];
it("montre une prise immédiate vérifiée sans dérouler les coups sans rapport de la PV", () => {
  const p = position([], "d4", longMaterialFen);
  const draft = explainMove(
    p,
    result(p.fen, longAlternative, 500),
    result(afterFen(p), longLoss, -500),
    bad,
  );
  const explanation = confirmForTest(draft);
  expect(explanation.concrete).toBe(true);
  expect(explanation.summary).toContain("tour en a1");
  expect(explanation.comparison?.steps[0].text).toContain("Txa8+");
  expect(explanation.summary).not.toContain("centre");
  expect(explanation.observations?.played?.fact.title).toBe(
    "Occupation du centre",
  );
  expect(explanation.observations?.played?.line).toBeNull();
  expect(explanation.proof?.steps.at(-1)?.move?.san).toBe("Rxa1+");
  expect(explanation.proof?.steps).toHaveLength(2);
  expect(explanation.played?.steps).toHaveLength(9);
});
it("ne confond pas bilan après huit demi-coups et bilan complet", () => {
  const p = position([], "d4", longMaterialFen);
  const explanation = explainMove(
    p,
    result(p.fen, longAlternative, 500),
    result(afterFen(p), longLoss, -500),
    good,
  );
  expect(explanation.concrete).toBe(false);
});
it("une capture hypothétique n’est pas une explication avant confirmation", () => {
  const p = position([], "d4", longMaterialFen);
  const explanation = explainMove(
    p,
    result(p.fen, longAlternative, 500),
    result(afterFen(p), longLoss.slice(0, 8), 0),
    bad,
  );
  expect(explanation.candidate).toBeDefined();
  expect(explanation.concrete).toBe(false);
  expect(explanation.proof).toBeUndefined();
  expect(confirmForTest(explanation, [0, 0]).concrete).toBe(false);
});
it("refuse une fin de longue PV corrompue et les scores non finis", () => {
  const p = position([], "d4", longMaterialFen);
  const before = result(p.fen, longAlternative, 500);
  const after = result(afterFen(p), longLoss, -500);
  expect(
    explainMove(p, { ...before, score: { kind: "cp", value: NaN } }, after, bad)
      .concrete,
  ).toBe(false);
  after.variation.at(-1)!.fen = p.fen;
  expect(explainMove(p, before, after, bad).concrete).toBe(false);
});

it("vérifie aussi la faute des Noirs sans inverser la perte matérielle", () => {
  const p = position([], "Kh7", "r6k/8/8/8/8/8/8/R6K b - - 0 1");
  const draft = explainMove(
    p,
    result(p.fen, ["Rxa1+", "Kh2"], -500),
    result(afterFen(p), ["Rxa8"], 500),
    bad,
  );
  expect(draft.candidate?.actor).toBe("b");
  expect(draft.concrete).toBe(false);
  const explanation = confirmForTest(draft);
  expect(explanation.concrete).toBe(true);
  expect(explanation.summary).toContain("tour en a8");
  expect(explanation.proof?.steps.map((step) => step.move?.san)).toEqual([
    "Kh7",
    "Rxa8",
  ]);
});

it("garde la même démonstration quand le moteur prolonge sa PV après la conséquence", () => {
  const p = position([], "d4", longMaterialFen);
  const before = result(p.fen, longAlternative, 500);
  const short = confirmForTest(
    explainMove(p, before, result(afterFen(p), ["Rxa1+"], -500), bad),
  );
  const long = confirmForTest(
    explainMove(p, before, result(afterFen(p), longLoss, -500), bad),
  );
  expect(short.concrete).toBe(true);
  expect(long.proof?.steps.map((step) => step.fen)).toEqual(
    short.proof?.steps.map((step) => step.fen),
  );
  expect(long.summary).toBe(short.summary);
});

it("refuse un gain apparent si la recherche ciblée rend aussitôt davantage de matériel ailleurs", () => {
  const p = position([], "Bxb5", "3r3k/8/8/1n6/8/8/4B3/3Q3K w - - 0 1");
  const draft = explainMove(
    p,
    result(p.fen, ["Bxb5"], 0),
    result(afterFen(p), ["Rxd1+", "Kh2"], 0),
    good,
  );
  expect(draft.candidate).toBeDefined();
  expect(
    confirmCause(draft, [result(afterFen(p), ["Rxd1+"], 0)]).concrete,
  ).toBe(false);
});

it("refuse une comparaison incomplète ou seulement bornée après la vérification", () => {
  const p = position([], "d4", longMaterialFen);
  const draft = explainMove(
    p,
    result(p.fen, longAlternative, 500),
    result(afterFen(p), longLoss, -500),
    bad,
  );
  const results = draft.candidate!.positions.map((p, index) => {
    const move = new Chess(p.fen)
      .moves({ verbose: true })
      .find((move) => !move.captured)!;
    return result(p.fen, [move.san], index === 0 ? -500 : 500);
  });
  expect(confirmCause(draft, results).concrete).toBe(true);
  expect(confirmCause(draft, results.slice(0, 1)).concrete).toBe(false);
  results[0].score = { kind: "cp", value: -500, bound: "upper" };
  expect(confirmCause(draft, results).concrete).toBe(false);
});

for (const side of ["w", "b"] as const) {
  it(`confirme la promotion analysée pour ${side} sans ajouter de coups inutiles`, () => {
    const p = position(
      [],
      side === "w" ? "a8=Q+" : "a1=Q+",
      side === "w"
        ? "7k/P7/8/8/8/8/8/7K w - - 0 1"
        : "7k/8/8/8/8/8/p7/7K b - - 0 1",
    );
    const sign = side === "w" ? 1 : -1;
    const before = result(
      p.fen,
      [side === "w" ? "a8=Q+" : "a1=Q+"],
      500 * sign,
    );
    const after = result(
      afterFen(p),
      [side === "w" ? "Kh7" : "Kh2"],
      500 * sign,
    );
    const draft = explainMove(p, before, after, good);
    expect(draft.concrete).toBe(false);
    const explanation = confirmForTest(draft, [500]);
    expect(explanation.summary).toContain("8 points");
    expect(explanation.proof?.steps).toHaveLength(1);
    expect(explanation.proof?.steps[0].fen).toBe(afterFen(p));
  });
}
