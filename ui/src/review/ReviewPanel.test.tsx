import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReviewPanel from "./ReviewPanel";
import EvaluationChart from "./EvaluationChart";
import { gamePositions, type ReviewResult } from "./model";

it("permet de revoir la partie sans moteur et masque barre et courbe selon la préférence", () => {
  const board = new Chess();
  board.move("e4");
  const props = { pgn: board.pgn(), active: true, onToggle: () => {} };
  const visible = renderToStaticMarkup(
    <ReviewPanel {...props} showEvaluation />,
  );
  expect(visible).not.toContain("<dt>Coup joué</dt>");
  expect(visible).toContain("Évaluation de la position");
  expect(visible).not.toContain("Après le coup joué");
  expect(visible).toContain("Position précédente");
  expect(visible).toContain("Préparation de l’analyse");
  expect(visible).toContain("Courbe d’évaluation");
  const hidden = renderToStaticMarkup(
    <ReviewPanel {...props} showEvaluation={false} />,
  );
  expect(hidden).not.toContain("Courbe d’évaluation");
  expect(hidden).not.toContain('class="evaluation-bar');
  expect(hidden).toContain("Profondeur atteinte");
});

it("interrompt la courbe entre scores inconnus et expose les positions au clavier", () => {
  const board = new Chess();
  board.move("e4");
  board.move("e5");
  const positions = gamePositions(board.pgn());
  const result: ReviewResult = {
    score: { kind: "cp", value: 100 },
    depth: 5,
    bestMove: null,
    bestSan: null,
    variation: [],
  };
  const html = renderToStaticMarkup(
    <EvaluationChart
      positions={positions}
      results={[result, null, result]}
      selected={0}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain('d="M45,76  M685,76"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain("Position initiale : +1,00");
  expect(html).not.toContain("Après 1. e4 :");
});

it("réunit navigation et jeu direct, avec les moments du camp humain seulement", () => {
  const board = new Chess();
  board.move("e4");
  const html = renderToStaticMarkup(
    <ReviewPanel
      pgn={board.pgn()}
      active
      showEvaluation={false}
      onToggle={() => {}}
      learnerSide="b"
    />,
  );
  expect(html).toContain('aria-label="Analyse interactive"');
  expect(html).toContain("sélectionner une pièce puis sa destination");
  expect(html).toContain("vos coups avec les Noirs");
  expect(html).not.toContain("Analyse détaillée");
  expect(html).not.toContain("Revue guidée &amp; exploration");
});

it("suit le matériel de la position relue, avant et après promotion, dans les deux orientations", async () => {
  const { GameReview } = await import("./GameReview");
  const { default: InteractiveReview } = await import("./InteractiveReview");
  const board = new Chess("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  board.move("a8=Q");
  board.move("Rxa8");
  const review = new GameReview(board.pgn());
  for (const orientation of ["white", "black"] as const) {
    for (const [selected, side, score] of [
      [0, "Noirs", 4],
      [1, "Blancs", 4],
      [2, "Noirs", 5],
    ] as const) {
      const html = renderToStaticMarkup(
        <InteractiveReview
          review={review}
          selected={selected}
          onSelect={() => {}}
          engineId="default"
          orientation={orientation}
          showEvaluation={false}
          showAnnotations={false}
          active={false}
          side="both"
          treeCache={new Map()}
        />,
      );
      expect(html).toContain(
        `Prises des ${side} : ${selected === 2 ? "1 dame" : "aucune"} ; avantage matériel de ${score} points`,
      );
      expect(html.match(/class="capture-advantage"/g)).toHaveLength(1);
    }
  }
});
