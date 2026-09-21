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
