import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Chess } from "chess.js";
import { GameReview } from "../src/review/GameReview";
import { legalVariation } from "../src/review/model";
import InteractiveReview from "../src/review/InteractiveReview";
import type { StudyTree } from "../src/review/StudyTree";
import "../src/index.css";

// Scénario déterministe de contrôle UI ; aucune analyse simulée dans l’application.
const game = new Chess();
for (const san of ["f3", "e5", "g4", "Qh4#"]) game.move(san);
const review = new GameReview(game.pgn());
review.state = "complete";
review.results[2] = {
  score: { kind: "cp", value: 0 },
  depth: 14,
  bestMove: "b1c3",
  bestSan: "Cc3",
  variation: legalVariation(review.positions[2].fen, ["b1c3", "b8c6"]),
};
review.results[3] = {
  score: { kind: "mate", value: -1, winner: "b" },
  depth: 14,
  bestMove: "d8h4",
  bestSan: "Dh4#",
  variation: legalVariation(review.positions[3].fen, ["d8h4"]),
};
review.results[4] = {
  score: { kind: "mate", value: 0, winner: "b" },
  depth: 0,
  bestMove: null,
  bestSan: null,
  variation: [],
};
const trees = new Map<number, StudyTree>();
// Lire les arbres au moment du contrôle : leur mutation ne rend pas ce parent.
Object.assign(window, {
  explanationFixture: {
    countBranches: () =>
      [...trees.values()].reduce((sum, tree) => sum + tree.nodes.length - 1, 0),
  },
});
export function Fixture() {
  const [selected, select] = useState(3);
  const [annotations, showAnnotations] = useState(true);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  return (
    <main style={{ padding: 16 }}>
      <p>Contrôle UI · résultats simulés</p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}
      >
        <button onClick={() => showAnnotations(!annotations)}>
          Annotations
        </button>
        <button
          onClick={() =>
            setOrientation(orientation === "white" ? "black" : "white")
          }
        >
          Retourner
        </button>
        <output data-testid="source-position">{selected}</output>
      </div>
      <InteractiveReview
        review={review}
        selected={selected}
        onSelect={select}
        engineId="default"
        orientation={orientation}
        showEvaluation
        showAnnotations={annotations}
        active
        side="w"
        treeCache={trees}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
