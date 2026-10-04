import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { explainMove } from "./explanations";
import { confirmForTest } from "./causeTestHelpers";
import { gamePositions, type ReviewResult } from "./model";
import type { Category } from "./annotations";

function result(fen: string, sans: string[], cp: number): ReviewResult {
  const board = new Chess(fen);
  const moves = sans.map((san) => board.move(san));
  return {
    score: { kind: "cp", value: cp },
    depth: 16,
    bestMove: moves[0]
      ? moves[0].from + moves[0].to + (moves[0].promotion ?? "")
      : null,
    bestSan: moves[0]?.san ?? null,
    variation: moves.map((move) => ({
      from: move.from,
      to: move.to,
      fen: move.after,
      label: move.san,
    })),
  };
}
function scenario(
  fen: string | undefined,
  sans: string[],
  alternative?: string[],
  prefix: string[] = [],
) {
  const board = new Chess(fen);
  for (const san of prefix) board.move(san);
  const index = board.history().length;
  const initial = board.fen();
  const played = board.move(sans[0]);
  const position = gamePositions(board.pgn())[index];
  const before = result(initial, alternative ?? sans, alternative ? 800 : 0);
  const after = result(played.after, sans.slice(1), 0);
  return { position, before, after };
}
function explain(
  test: ReturnType<typeof scenario>,
  category: Category = "best",
) {
  return confirmForTest(
    explainMove(test.position, test.before, test.after, {
      category,
      reason: "",
      loss: category === "best" ? 0 : 0.3,
    }),
  );
}
const fork = "r3k3/8/8/3N4/8/8/8/7K w - - 0 1";
const forkLine = ["Nc7+", "Kd7", "Nxa8", "Ke6"];
const motif = (explanation: ReturnType<typeof explain>, alternative = false) =>
  (alternative === (explanation.primary === "alternative")
    ? explanation.proof
    : null
  )?.steps.find((step) => step.motif);

describe("tactiques reliées à une conséquence dans la suite", () => {
  it.each([
    [fork, forkLine, "c7", "a8", "e8"],
    [
      "7k/8/8/8/3n4/8/8/R3K3 b - - 0 1",
      ["Nc2+", "Kd2", "Nxa1", "Ke3"],
      "c2",
      "a1",
      "e1",
    ],
  ])(
    "montre une fourchette pour les deux camps (%s)",
    (fen, sans, from, rook, king) => {
      const explanation = explain(scenario(fen as string, sans as string[]));
      expect(motif(explanation)?.motif).toBe("Fourchette");
      expect(motif(explanation)?.marks).toEqual([
        { from, to: rook, tone: "threat" },
        { from, to: king, tone: "threat" },
      ]);
      expect(explanation.summary).toContain("capturée");
    },
  );
  it("relie la fourchette adverse au mauvais coup et à une alternative qui l’évite", () => {
    const explanation = explain(
      scenario(
        "7k/8/8/8/3n4/8/8/1R2K3 w - - 0 1",
        ["Ra1", "Nc2+", "Kd2", "Nxa1", "Ke3"],
        ["Rb2", "Nb5"],
      ),
      "blunder",
    );
    expect(motif(explanation)?.motif).toBe("Fourchette");
    expect(
      explanation.proof?.steps.find((step) => step.motif)?.marks?.[0].from,
    ).toBe("c2");
    expect(explanation.primary).toBeUndefined();
  });
  it("montre l’occasion manquée dans l’alternative, pas dans la suite jouée", () => {
    const explanation = explain(
      scenario(fork, ["Kh2", "Kf7"], forkLine),
      "miss",
    );
    expect(explanation.primary).toBe("alternative");
    expect(motif(explanation, true)?.motif).toBe("Fourchette");
    expect(motif(explanation)).toBeUndefined();
    expect(explanation.summary).toContain("Occasion manquée");
  });
  it.each([
    [
      "8/3kp3/2n5/3P4/8/8/8/5B1K w - - 0 1",
      ["Bb5", "e6", "Bxc6+", "Kc7"],
      "Clouage au roi",
    ],
    [
      "7k/3q4/2n5/8/8/8/8/5B1K w - - 0 1",
      ["Bb5", "Nd4", "Bxd7", "Kg8"],
      "Clouage relatif",
    ],
  ])("explique un clouage exploité (%s)", (fen, sans, title) => {
    const explanation = explain(scenario(fen as string, sans as string[]));
    expect(motif(explanation)?.motif).toBe(title);
    expect(motif(explanation)?.marks).toContainEqual({
      from: "c6",
      to: "d7",
      tone: "threat",
    });
    expect(explanation.summary).toContain("cavalier en c6");
  });
  it("relie la ligne ouverte à la capture de la dame", () => {
    const explanation = explain(
      scenario("3q3k/8/8/8/8/3B4/8/3R3K w - - 0 1", [
        "Bh7",
        "Kg7",
        "Rxd8",
        "Kxh7",
      ]),
    );
    expect(motif(explanation)?.motif).toBe("Attaque à la découverte");
    expect(motif(explanation)?.marks).toContainEqual({
      from: "d1",
      to: "d8",
      tone: "threat",
    });
  });
  it("identifie le défenseur supprimé avant la prise de sa cible", () => {
    const explanation = explain(
      scenario("7k/8/5r2/3n4/2B5/2B5/8/7K w - - 0 1", [
        "Bxd5",
        "Kh7",
        "Bxf6",
        "Kg6",
      ]),
    );
    expect(motif(explanation)?.motif).toBe("Défenseur supprimé");
    expect(motif(explanation)?.marks).toContainEqual({
      from: "d5",
      to: "f6",
      tone: "idea",
    });
  });
  it("identifie le défenseur déplacé par le mauvais coup", () => {
    const explanation = explain(
      scenario(
        "2b4k/8/8/5R2/3N4/8/8/7K w - - 0 1",
        ["Nb3", "Bxf5", "Kh2", "Kg7"],
        ["Rf1", "Kg7"],
      ),
      "mistake",
    );
    expect(motif(explanation)?.motif).toBe("Défenseur déplacé");
    expect(explanation.summary).toContain("cavalier en d4");
  });
  it("décrit une cible non défendue avec sa case et son attaquant", () => {
    const explanation = explain(
      scenario("r6k/8/8/8/8/8/8/R6K w - - 0 1", ["Rxa8+", "Kh7"]),
    );
    expect(motif(explanation)?.motif).toBe("Pièce sans défense");
    expect(explanation.summary).toContain("tour en a8");
    expect(explanation.summary).toContain("tour en a1");
  });
  it("montre une menace de mat effectivement réalisée dans la suite", () => {
    const explanation = explain(
      scenario(undefined, ["Qh5", "a6", "Qxf7#"], undefined, [
        "e4",
        "e5",
        "Bc4",
        "Nc6",
      ]),
    );
    expect(motif(explanation)?.motif).toBe("Menace de mat");
    expect(motif(explanation)?.marks).toContainEqual({
      from: "h5",
      to: "f7",
      tone: "threat",
    });
  });
  it("suit le même pion jusqu’à sa promotion", () => {
    const explanation = explain(
      scenario("7k/8/P7/8/8/8/8/7K w - - 0 1", ["a7", "Kh7", "a8=Q", "Kg6"]),
    );
    expect(motif(explanation)?.motif).toBe("Course à la promotion");
    expect(motif(explanation)?.marks).toEqual([
      { from: "a7", to: "a8", tone: "idea" },
    ]);
  });
});
describe("bons coups défensifs vérifiés avant et après", () => {
  it("pare une menace de mat en un sans prétendre avoir neutralisé tous les dangers", () => {
    const explanation = explain(
      scenario(undefined, ["g6", "Qf3"], undefined, [
        "e4",
        "e5",
        "Bc4",
        "Nc6",
        "Qh5",
      ]),
    );
    expect(motif(explanation)?.motif).toBe("Menace de mat parée");
    expect(explanation.summary).toContain("empêche ce mat en un");
  });
  it("montre l’interposition qui bloque un échec", () => {
    const explanation = explain(
      scenario("4r2k/8/8/8/8/8/8/4KB2 w - - 0 1", ["Be2", "Ra8"]),
    );
    expect(motif(explanation)?.motif).toBe("Échec bloqué");
    expect(motif(explanation)?.marks).toContainEqual({
      from: "e2",
      to: "e1",
      tone: "idea",
    });
  });
  it("explique la fuite d’une pièce menacée", () => {
    const explanation = explain(
      scenario("3r4/7k/8/8/3Q4/8/8/7K w - - 0 1", ["Qc4", "Ra8"]),
    );
    expect(motif(explanation)?.motif).toBe("Pièce mise à l’abri");
  });
  it("montre un nouveau défenseur capable de reprendre légalement", () => {
    const explanation = explain(
      scenario("3r3k/8/8/3B4/8/8/2N5/7K w - - 0 1", ["Ne3", "Ra8"]),
    );
    expect(motif(explanation)?.motif).toBe("Pièce défendue");
    expect(motif(explanation)?.marks).toContainEqual({
      from: "e3",
      to: "d5",
      tone: "idea",
    });
  });
});
describe("garde-fous des explications tactiques", () => {
  it("ne suffit pas d’attaquer deux pièces sans conséquence montrée", () => {
    const explanation = explain(scenario(fork, ["Nc7+", "Kd7"]));
    expect(motif(explanation)).toBeUndefined();
  });
  it("ne suffit pas d’aligner trois pièces pour expliquer un verdict par un clouage", () => {
    const explanation = explain(
      scenario("8/3kp3/2n5/3P4/8/8/8/5B1K w - - 0 1", ["Bb5", "e6"]),
    );
    expect(motif(explanation)).toBeUndefined();
  });
  it("refuse une PV incohérente même si son début contient une fourchette", () => {
    const data = scenario(fork, forkLine);
    data.after.variation[2].fen = data.position.fen;
    expect(explain(data).played).toBeNull();
  });
  it("n’explique pas un verdict moteur à partir de scores bornés ou sans classification", () => {
    const data = scenario(fork, forkLine);
    data.before.score = { kind: "cp", value: 0, bound: "lower" };
    expect(motif(explain(data))).toBeUndefined();
    expect(
      motif(explainMove(data.position, data.before, data.after, null)),
    ).toBeUndefined();
  });
  it("vérifie aussi la fin d’une longue PV avant de montrer un motif dans les huit premiers demi-coups", () => {
    const data = scenario(fork, [
      ...forkLine,
      "Nc7+",
      "Kd6",
      "Na8",
      "Kc5",
      "Nc7",
      "Kd6",
    ]);
    const explanation = explain(data);
    expect(explanation.played?.truncated).toBe(true);
    expect(motif(explanation)?.motif).toBe("Fourchette");
    expect(explanation.played?.steps).toHaveLength(9);
    expect(explanation.proof?.steps).toHaveLength(3);
  });
});

it("refuse une fourchette si la vérification de sa conséquence trouve une compensation", () => {
  const data = scenario(fork, forkLine);
  const draft = explainMove(data.position, data.before, data.after, {
    category: "best",
    reason: "",
    loss: 0,
  });
  expect(draft.candidate?.line.title).toBe("Fourchette");
  expect(confirmForTest(draft, [-900]).proof).toBeUndefined();
});
it("ne confond pas un défenseur déplacé et une défense réellement supprimée", () => {
  const explanation = explain(
    scenario(
      "2b4k/8/8/5R2/8/3B4/8/7K w - - 0 1",
      ["Be4", "Bxf5", "Bxf5", "Kg7"],
      ["Rf1", "Kg7"],
    ),
    "mistake",
  );
  expect(motif(explanation)?.motif).toBe("Échange défavorable");
  expect(explanation.summary).not.toContain("retire cette défense");
  expect(explanation.proof?.steps.at(-1)?.move?.san).toBe("Bxf5");
});
it("n’attribue pas au pion sacrifié la promotion d’un autre pion", () => {
  const explanation = explain(
    scenario("2k5/1r5P/P7/8/8/8/8/7K w - - 0 1", [
      "a7",
      "Rxa7",
      "h8=Q+",
      "Kd7",
    ]),
  );
  expect(motif(explanation)?.motif).not.toBe("Course à la promotion");
});
it("ne prétend pas qu’un coup crée une menace de mat qui existait déjà", () => {
  const explanation = explain(
    scenario(undefined, ["Nf3", "h6", "Qxf7#"], undefined, [
      "e4",
      "e5",
      "Bc4",
      "Nc6",
      "Qh5",
      "a6",
    ]),
  );
  expect(motif(explanation)?.motif).not.toBe("Menace de mat");
});

it("présente comme favorable un échange qui gagne du matériel pour le joueur", () => {
  const explanation = explain(
    scenario("2b4k/8/8/5r2/8/3B4/8/7K w - - 0 1", ["Bxf5", "Bxf5"]),
  );
  expect(explanation.concrete).toBe(true);
  expect(explanation.proof?.title).toBe("Échange favorable");
  expect(explanation.proof?.steps.map((step) => step.move?.san)).toEqual([
    "Bxf5",
    "Bxf5",
  ]);
  expect(explanation.summary).toContain("gain matériel aux Blancs");
});
