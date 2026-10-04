import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { explainMove, type ExplanationLine } from "./explanations";
import { positionFacts, positionObservation } from "./positional";
import PositionalPanel from "./PositionalPanel";
import { gamePositions, type ReviewResult } from "./model";

function scenario(san: string, fen?: string, prefix: string[] = []) {
  const board = new Chess(fen);
  prefix.forEach((move) => board.move(move));
  const index = board.history().length;
  board.move(san);
  const position = gamePositions(board.pgn())[index];
  const explanation = explainMove(position, null, null, null);
  expect(explanation.played).not.toBeNull();
  return {
    position,
    line: explanation.played!,
    facts: positionFacts(explanation.played!),
  };
}
function result(fen: string, moves: string[], value = 0): ReviewResult {
  const board = new Chess(fen),
    variation = moves.map((san) => board.move(san));
  return {
    score: { kind: "cp", value },
    depth: 15,
    bestMove:
      variation[0].from + variation[0].to + (variation[0].promotion ?? ""),
    bestSan: variation[0].san,
    variation: variation.map((move) => ({
      from: move.from,
      to: move.to,
      fen: move.after,
      label: move.san,
    })),
  };
}
it.each([
  ["Nf3", [], "g1", "f3", "blanc"],
  ["Nf6", ["Nf3"], "g8", "f6", "noir"],
])(
  "reconnaît un premier développement traçable (%s)",
  (san, prefix, from, to, side) => {
    const { facts } = scenario(san as string, undefined, prefix as string[]);
    const development = facts.find((fact) => fact.kind === "development")!;
    expect(development.text).toContain(`cavalier ${side}`);
    expect(development.squares).toEqual([from, to]);
  },
);
it("ne qualifie pas de premier développement une pièce revenue sur sa case", () => {
  expect(
    scenario("Nf3", undefined, ["Nf3", "Nf6", "Ng1", "Ng8"]).facts.some(
      (fact) => fact.kind === "development",
    ),
  ).toBe(false);
});
it("ne devine pas l’histoire d’une pièce à partir d’une FEN personnalisée", () => {
  const { facts } = scenario("Nc3", "7k/7p/8/8/8/8/P7/1N5K w - - 0 1");
  expect(facts.some((fact) => fact.kind === "development")).toBe(false);
  expect(facts.some((fact) => fact.kind === "center")).toBe(true);
});
it.each([
  ["7k/ppp1pppp/8/8/8/8/PPP2PPP/R5K1 w - - 0 1", "Colonne ouverte"],
  ["7k/pppppppp/8/8/8/8/PPP2PPP/R5K1 w - - 0 1", "Colonne semi-ouverte"],
])("distingue une colonne ouverte d’une semi-ouverte (%s)", (fen, title) => {
  const { facts } = scenario("Rd1", fen);
  expect(facts.find((fact) => fact.kind === "file")?.title).toBe(title);
  expect(facts.find((fact) => fact.kind === "file")?.squares).toContain("d1");
});
it("ne décrit pas comme ouverte une colonne comportant encore un pion ami", () => {
  const { facts } = scenario(
    "Rd1",
    "7k/ppp1pppp/8/8/8/8/PPPP1PPP/R5K1 w - - 0 1",
  );
  expect(facts.some((fact) => fact.kind === "file")).toBe(false);
});
it("prend en compte le pion retiré en passant et la colonne libérée", () => {
  const { facts, line } = scenario("exd6", "7k/8/8/3pP3/8/8/8/4R2K w - d6 0 1");
  expect(line.steps[1].move?.isEnPassant()).toBe(true);
  expect(facts.find((fact) => fact.kind === "file")?.text).toContain(
    "colonne e",
  );
  expect(new Chess(line.steps[1].fen).get("d5")).toBeUndefined();
});
it("signale des pions doublés sans leur attribuer le verdict moteur", () => {
  const { facts } = scenario("exd5", "7k/8/8/3n4/4P3/3P4/8/7K w - - 0 1");
  const doubled = facts.find((fact) => fact.title === "Pions doublés")!;
  expect(doubled.squares).toEqual(["d5", "d3"]);
  expect(doubled.text).toContain("pas à lui seul un verdict");
});
it("repère un pion adverse isolé par la capture de son voisin", () => {
  const { facts } = scenario("Rxe4", "4r2k/8/8/8/3PP3/8/8/7K b - - 0 1");
  expect(facts.find((fact) => fact.title === "Pion isolé")?.text).toContain(
    "pion blanc en d4",
  );
});
it("repère le nouveau pion passé sans promettre sa promotion", () => {
  const { facts } = scenario("axb6", "7k/8/1p6/P7/8/8/8/7K w - - 0 1");
  const passed = facts.find((fact) => fact.title === "Pion passé")!;
  expect(passed.squares).toEqual(["b6"]);
  expect(passed.text).toContain("bloquer ou le capturer");
});
it("ne répète pas une faiblesse ou un pion passé déjà présent", () => {
  const { facts } = scenario("a3", "7k/7p/8/8/8/8/P7/7K w - - 0 1");
  expect(facts.some((fact) => fact.kind === "pawns")).toBe(false);
});
it.each([
  ["w", "O-O", "g1", "f1"],
  ["b", "O-O-O", "c8", "d8"],
])(
  "montre le déplacement du roi et de la tour au roque (%s)",
  (side, san, king, rook) => {
    const { facts } = scenario(
      san,
      `r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R ${side} KQkq - 0 1`,
    );
    const castle = facts.find((fact) => fact.title === "Roque")!;
    expect(castle.squares).toContain(king);
    expect(castle.squares).toContain(rook);
    expect(castle.text).toContain("dépend aussi");
    expect(castle.text).not.toContain("en sécurité");
  },
);
it("compte la couverture proche du roi sans inventer une menace de mat", () => {
  const { facts } = scenario("f4", "3q3k/8/8/8/8/8/5PPP/5RK1 w - - 0 1");
  const cover = facts.find((fact) => fact.title === "Couverture du roi")!;
  expect(cover.text).toContain("2 pions amis");
  expect(cover.text).toContain("contre 3");
  expect(cover.text).toContain("ne suffit pas à prouver");
  expect(cover.squares).toContain("f2");
});
it("mesure l’activité libérée par le déplacement d’un pion", () => {
  const { facts } = scenario("c4", "7k/8/8/8/8/1P6/P1P5/1B5K w - - 0 1");
  const activity = facts.find((fact) => fact.kind === "activity")!;
  expect(activity.text).toContain("fou en b1");
  expect(activity.text).toContain("contre 0");
  expect(activity.text).toContain("pas des destinations garanties sûres");
});
it.each([
  ["Nc3", "7k/7p/8/8/8/8/P7/1N5K w - - 0 1", ["c3", "d5", "e4"]],
  ["Nc6", "1n5k/p7/8/8/8/8/7P/7K b - - 0 1", ["c6", "d4", "e5"]],
])(
  "montre les cases centrales accessibles pour les deux camps (%s)",
  (san, fen, squares) => {
    const { facts } = scenario(san as string, fen as string);
    expect(
      new Set(facts.find((fact) => fact.kind === "center")?.squares),
    ).toEqual(new Set(squares));
  },
);
it("ne compte pas la mobilité d’un fou cloué comme une possibilité légale", () => {
  const { facts } = scenario("a3", "4r2k/7p/8/8/8/8/P3B3/4K3 w - - 0 1");
  expect(
    facts.some((fact) => fact.kind === "activity" || fact.kind === "center"),
  ).toBe(false);
});
it("s’abstient lorsqu’aucun changement positionnel pertinent n’est détecté", () => {
  expect(scenario("Kh2", "7k/7p/8/8/8/8/P7/7K w - - 0 1").facts).toEqual([]);
});
it("ne remplace pas une promotion ou un mat par un commentaire positionnel", () => {
  expect(scenario("a8=Q", "7k/P7/8/8/8/8/8/7K w - - 0 1").facts).toEqual([]);
  expect(scenario("Qh4#", undefined, ["f3", "e5", "g4"]).facts).toEqual([]);
});
it("les observations restent descriptives même si le moteur classe le développement comme gaffe", () => {
  const { position, line } = scenario("Nf3");
  const explanation = explainMove(
    position,
    result(position.fen, ["Nc3"]),
    result(line.steps[1].fen, ["d5"], -500),
    { category: "blunder", loss: 0.4, reason: "" },
  );
  expect(explanation.concrete).toBe(false);
  expect(explanation.observations?.played?.fact.title).toBe("Développement");
  expect(explanation.observations?.alternative?.fact.title).toBe(
    "Développement",
  );
  expect(explanation.summary).toContain("pas encore identifiée");
});
it("affiche directement les cases après le coup sans rejouer le déplacement", () => {
  const { position, line } = scenario("Nc3", "7k/7p/8/8/8/8/P7/1N5K w - - 0 1"),
    before = result(position.fen, ["Nd2"]),
    after = result(line.steps[1].fen, ["h6"]);
  const frozen = JSON.stringify([before, after]);
  const explanation = explainMove(position, before, after, {
    category: "excellent",
    loss: 0,
    reason: "",
  });
  const played = explanation.observations!.played!.line!,
    alternative = explanation.observations!.alternative!.line!;
  expect(played.steps).toHaveLength(1);
  expect(alternative.steps).toHaveLength(1);
  expect(played.steps[0].command).toBe(`${position.command} moves b1c3`);
  expect(alternative.steps[0].command).toBe(`${position.command} moves b1d2`);
  expect(played.steps[0].fen).toBe(line.steps[1].fen);
  expect(played.steps[0].marks).toContainEqual({
    from: "d5",
    tone: "observation",
  });
  expect(JSON.stringify([before, after])).toBe(frozen);
});
it("n’offre pas de repère pour rejouer un développement ou entourer le pion tout juste déplacé", () => {
  for (const san of ["Nf3", "e4"]) {
    const { line } = scenario(san);
    expect(positionObservation(line)).not.toBeNull();
    expect(positionObservation(line)?.line).toBeNull();
  }
});
it("masque la comparaison si les scores ou le verdict ne sont pas exploitables", () => {
  const { position, line } = scenario("Nf3"),
    before = result(position.fen, ["Nc3"]),
    after = result(line.steps[1].fen, ["d5"]);
  expect(
    explainMove(position, before, after, null).observations?.alternative,
  ).toBeNull();
  const bounded = {
    ...before,
    score: { kind: "cp" as const, value: 0, bound: "lower" as const },
  };
  const explanation = explainMove(position, bounded, after, {
    category: "best",
    loss: 0,
    reason: "",
  });
  expect(explanation.observations?.played).not.toBeNull();
  expect(explanation.observations?.alternative).toBeNull();
  expect(
    explainMove(
      position,
      { ...before, score: { kind: "cp", value: NaN } },
      after,
      { category: "best", loss: 0, reason: "" },
    ).observations?.alternative,
  ).toBeNull();
});
it("refuse un repère venu d’un autre historique ou d’un coup incohérent", () => {
  const { line } = scenario("Nf3");
  const broken: ExplanationLine = {
    ...line,
    steps: [
      { ...line.steps[0], command: "position startpos moves e2e4" },
      line.steps[1],
    ],
  };
  expect(positionObservation(broken)).toBeNull();
  expect(
    positionObservation({
      ...line,
      steps: [
        line.steps[0],
        { ...line.steps[1], command: "position startpos moves e2e4" },
      ],
    }),
  ).toBeNull();
  expect(
    positionObservation({
      ...line,
      steps: [line.steps[0], { ...line.steps[1], fen: line.steps[0].fen }],
    }),
  ).toBeNull();
});
it("garde les observations repliées et n’affiche aucun bouton de repère sans information visuelle utile", () => {
  const { position, line } = scenario("Nf3");
  const notes = explainMove(
    position,
    result(position.fen, ["Nc3"]),
    result(line.steps[1].fen, ["d5"]),
    { category: "best", loss: 0, reason: "" },
  ).observations!;
  const html = renderToStaticMarkup(
    <PositionalPanel notes={notes} onShow={() => {}} />,
  );
  expect(html).toContain('<details class="position-notes"');
  expect(html).toContain("Observations complémentaires");
  expect(html).toContain("n’expliquent pas à eux seuls le verdict");
  expect(html).toContain("Comparer avec le coup proposé");
  expect(html).not.toContain("<details open");
  expect(html).not.toContain("<button");
});

it("inclut une case centrale occupée par un adversaire seulement si la prise est légale", () => {
  const { facts } = scenario("Nc3", "7k/7p/8/3p4/8/8/P7/1N5K w - - 0 1");
  expect(facts.find((fact) => fact.kind === "center")?.squares).toEqual(
    expect.arrayContaining(["d5", "e4"]),
  );
});
