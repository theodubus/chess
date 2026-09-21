import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReviewProgress from "./ReviewProgress";
import { GameReview } from "./GameReview";
import { unclassifiedReason } from "./unclassifiedReason";
import type { ReviewResult } from "./model";

const game = new Chess();
game.move("e4");
it("explique les deux phases du calcul sans présenter une vérification en cours comme terminée", () => {
  const review = new GameReview(game.pgn());
  review.state = "running";
  let html = renderToStaticMarkup(<ReviewProgress review={review} />);
  expect(html).toContain("Analyse en cours");
  expect(html).toContain("analysis-spinner");
  expect(html).toContain("Étape 1/2");
  expect(html).toContain("Vous pouvez déjà parcourir");
  review.phase = "verification";
  review.verificationTotal = 2;
  review.verified.add(0);
  html = renderToStaticMarkup(<ReviewProgress review={review} />);
  expect(html).toContain("Vérification des annotations en cours");
  expect(html).toContain("Étape 2/2");
  expect(html).toContain('value="1"');
  review.phase = "resolution";
  review.resolutionTotal = 3;
  review.resolvedPositions = 2;
  html = renderToStaticMarkup(<ReviewProgress review={review} />);
  expect(html).toContain("Approfondissement des coups non classés");
  expect(html).toContain('value="2"');
  expect(html).toContain("Calcul ciblé");
  review.state = "complete";
  html = renderToStaticMarkup(<ReviewProgress review={review} />);
  expect(html).toContain("Analyse terminée");
  expect(html).not.toContain("analysis-spinner");
});

it("présente les résultats interrompus comme partiels et indique où relancer", () => {
  const review = new GameReview(game.pgn());
  review.state = "stopped";
  const html = renderToStaticMarkup(<ReviewProgress review={review} />);
  expect(html).toContain("résultats sont partiels");
  expect(html).toContain("depuis les options");
  expect(html).not.toContain("analysis-spinner");
});

it("explique séparément attente, absence de score, bornes et contradiction", () => {
  const position = new GameReview(game.pgn()).positions[0];
  const root: ReviewResult = {
    score: { kind: "cp", value: 100 },
    bestMove: "e2e4",
    bestSan: "e4",
    depth: 8,
    variation: [],
  };
  const after: ReviewResult = { ...root, score: { kind: "cp", value: -100 } };
  expect(unclassifiedReason(position, null, null, "running")).toContain(
    "Calcul en attente",
  );
  expect(unclassifiedReason(position, null, null, "stopped")).toContain(
    "Analyse incomplète",
  );
  expect(unclassifiedReason(position, null, null, "complete")).toContain(
    "n’a pas fourni",
  );
  expect(
    unclassifiedReason(
      position,
      { ...root, score: { kind: "cp", value: 100, bound: "lower" } },
      after,
      "complete",
    ),
  ).toContain("limite du score");
  expect(unclassifiedReason(position, root, after, "complete")).toContain(
    "recommande ce coup",
  );
  expect(unclassifiedReason(position, after, root, "complete")).toContain(
    "se contredisent",
  );
});
