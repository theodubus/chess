import { Chess } from "chess.js";
import { expect, it } from "vitest";
import {
  advantage,
  classifyMove,
  hasVerifiedSacrifice,
  lossCategory,
  verificationPositions,
} from "./annotations";
import { gamePositions, legalVariation, type ReviewResult } from "./model";
import AnnotationBadge from "./AnnotationBadge";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function game(moves: string[], fen?: string) {
  const board = new Chess(fen);
  for (const move of moves) board.move(move);
  return gamePositions(board.pgn());
}
// Les évaluations sont simulées pour isoler la classification de la force du moteur.
function result(value: number, bestMove = "d2d4"): ReviewResult {
  return {
    score: { kind: "cp", value },
    depth: 10,
    bestMove,
    bestSan: null,
    variation: [],
  };
}

it("applique les seuils sans chevauchement et sans confondre égalité et premier choix", () => {
  for (const [loss, category] of [
    [0, "excellent"],
    [0.019, "excellent"],
    [0.02, "good"],
    [0.049, "good"],
    [0.05, "inaccuracy"],
    [0.099, "inaccuracy"],
    [0.1, "mistake"],
    [0.199, "mistake"],
    [0.2, "blunder"],
    [1, "blunder"],
  ] as const)
    expect(lossCategory(loss)).toBe(category);
  const positions = game(["e4"]);
  expect(classifyMove(positions, [result(0), result(0)], 0)?.category).toBe(
    "excellent",
  );
  expect(
    classifyMove(positions, [result(0, "e2e4"), result(0)], 0)?.category,
  ).toBe("best");
  expect(classifyMove(positions, [result(0), result(-400)], 0)?.category).toBe(
    "blunder",
  );
  expect(classifyMove(positions, [result(0), result(0)], 1)).toBeNull();
});

it("est symétrique entre blancs et noirs et dépend de l’avantage initial", () => {
  const positions = game(["e4", "e5"]);
  const white = classifyMove(positions, [result(0), result(-250)], 0);
  const black = classifyMove(
    positions,
    [result(0), result(0, "c7c5"), result(250)],
    1,
  );
  expect(white?.category).toBe("mistake");
  expect(black?.loss).toBeCloseTo(white!.loss!);
  expect(
    classifyMove(positions, [result(2000), result(1750)], 0)?.category,
  ).toBe("excellent");
});

it("s’abstient en cas de score inconnu, borné ou contradictoire", () => {
  const positions = game(["e4"]);
  expect(advantage({ kind: "cp", value: 0, bound: "lower" }, "w")).toBeNull();
  expect(advantage({ kind: "mate", value: 1 }, "w")).toBeNull();
  expect(classifyMove(positions, [null, result(0)], 0)).toBeNull();
  expect(
    classifyMove(positions, [result(0, "e2e4"), result(-400)], 0),
  ).toBeNull();
  expect(classifyMove(positions, [result(0), result(400)], 0)).toBeNull();
});

it("traite les mats selon le vainqueur, sans pénaliser un mat plus long", () => {
  const positions = game(["e4"]);
  const win = {
    ...result(0),
    score: { kind: "mate" as const, value: 3, winner: "w" as const },
  };
  expect(
    classifyMove(
      positions,
      [win, { ...win, score: { ...win.score, value: 6 } }],
      0,
    )?.loss,
  ).toBe(0);
  expect(classifyMove(positions, [win, result(0)], 0)?.category).toBe(
    "blunder",
  );
  expect(classifyMove(positions, [win, result(0)], 0)?.reason).toContain(
    "Un mat forcé était disponible",
  );
  const lost = {
    ...win,
    score: { kind: "mate" as const, value: -2, winner: "b" as const },
  };
  expect(classifyMove(positions, [result(0), lost], 0)?.reason).toBe(
    "Ce coup permet à l’adversaire de forcer le mat.",
  );
  expect(advantage({ kind: "mate", value: 0, winner: "b" }, "w")).toBe(0);
  expect(advantage({ kind: "mate", value: 0, winner: "b" }, "b")).toBe(1);
});

it("réserve occasion manquée à une chance offerte par le coup adverse précédent", () => {
  const positions = game(["e4", "e5", "Nf3"]);
  const scores = [result(0), result(0), result(650), result(0)];
  expect(classifyMove(positions, scores, 2)?.category).toBe("miss");
  scores[1] = result(650);
  expect(classifyMove(positions, scores, 2)?.category).toBe("blunder");
});

it("réserve le coup décisif à une occasion gagnante saisie par le premier choix vérifié", () => {
  const positions = game(["e4", "e5", "Nf3"]);
  const scores = [result(0), result(0), result(650, "g1f3"), result(650)];
  expect(classifyMove(positions, scores, 2)?.category).toBe("best");
  expect(classifyMove(positions, scores, 2, true)?.category).toBe("great");
  expect(verificationPositions(positions, scores)).toContain(3);
  scores[1] = result(650);
  expect(classifyMove(positions, scores, 2, true)?.category).toBe("best");
  scores[1] = result(0);
  scores[2].bestMove = "d2d4";
  expect(classifyMove(positions, scores, 2, true)?.category).toBe("excellent");
});

it("reconnaît aussi une ressource défensive qui ramène une position perdante à l’équilibre", () => {
  const positions = game(["e4", "e5", "Nf3"]);
  const scores = [result(0), result(-700), result(0, "g1f3"), result(0)];
  expect(classifyMove(positions, scores, 2, true)?.category).toBe("great");
  expect(classifyMove(positions, scores, 2, true)?.reason).toContain(
    "ressource défensive",
  );
  expect(verificationPositions(positions, scores)).toContain(3);
  scores[3] = result(-700);
  expect(classifyMove(positions, scores, 2, true)?.category).not.toBe("great");
});

it("ne décerne brillant qu’après confirmation d’un sacrifice compensé et accepté", () => {
  const positions = game(
    ["Bxh7+"],
    "rnbq1rk1/ppp2ppp/3bpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8",
  );
  const root = result(20, "d3h7");
  const reply = {
    ...result(20, "g8h7"),
    variation: legalVariation(positions[1].fen, ["g8h7", "f3g5"]),
  };
  expect(reply.variation).toHaveLength(2);
  expect(hasVerifiedSacrifice(positions[0], reply)).toBe(true);
  expect(classifyMove(positions, [root, reply], 0)?.category).toBe("best");
  expect(classifyMove(positions, [root, reply], 0, true)?.category).toBe(
    "brilliant",
  );
  expect(
    classifyMove(
      positions,
      [result(700, "d3h7"), { ...reply, score: { kind: "cp", value: 700 } }],
      0,
      true,
    )?.category,
  ).toBe("best");
  expect(
    classifyMove(
      positions,
      [result(0), { ...reply, score: { kind: "cp", value: -300 } }],
      0,
      true,
    )?.category,
  ).toBe("mistake");
  expect(
    hasVerifiedSacrifice(positions[0], {
      ...reply,
      variation: reply.variation.slice(0, 1),
    }),
  ).toBe(false);
  expect(verificationPositions(positions, [root, reply])).toEqual([0, 1]);
});

it("ne confond pas un échange égal avec un sacrifice", () => {
  const positions = game(["Rxd8"], "3rr1k1/6pp/8/8/8/8/6PP/3RR1K1 w - - 0 1");
  const reply = {
    ...result(0),
    variation: legalVariation(positions[1].fen, ["e8d8", "e1e8"]),
  };
  expect(reply.variation).toHaveLength(2);
  expect(hasVerifiedSacrifice(positions[0], reply)).toBe(false);
});

it("vérifie les voisins une fois et exclut les positions terminales", () => {
  const positions = game(["f3", "e5", "g4", "Qh4#"]);
  const scores = [
    result(0),
    result(-400),
    result(0),
    result(-400),
    { ...result(0), score: positions[4].terminal },
  ];
  expect(verificationPositions(positions, scores)).toEqual([0, 1, 2, 3]);
  expect(
    verificationPositions(
      positions,
      positions.map(() => null),
    ),
  ).toEqual([]);
});

it("expose le nom et le caractère provisoire des symboles aux lecteurs d’écran", () => {
  const annotation = {
    category: "blunder" as const,
    loss: 0.3,
    reason: "Explication.",
  };
  const html = renderToStaticMarkup(
    createElement(AnnotationBadge, {
      annotation,
      provisional: true,
      compact: true,
    }),
  );
  expect(html).toContain('aria-label="Gaffe · provisoire"');
  expect(html).toContain("Explication.");
  expect(html).toContain("??");
  expect(
    renderToStaticMarkup(createElement(AnnotationBadge, { annotation: null })),
  ).toBe("");
});
