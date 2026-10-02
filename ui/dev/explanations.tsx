import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chess } from "chess.js";
import { GameReview } from "../src/review/GameReview";
import { legalVariation, type ReviewResult } from "../src/review/model";
import InteractiveReview from "../src/review/InteractiveReview";
import type { StudyTree } from "../src/review/StudyTree";
import { explainMove } from "../src/review/explanations";
import { boardFromCommand } from "../src/review/StudyTree";
import type { Engine } from "../src/engine/Engine";
import "../src/index.css";

// Scénario déterministe de contrôle UI ; aucune analyse simulée dans l’application.
const tacticalCases = {
  "position-development": {
    fen: new Chess().fen(),
    played: ["Nf3", "d5"],
    best: ["Nc3", "d5"],
  },
  "position-file": {
    fen: "7k/ppp1pppp/8/8/8/8/PPP2PPP/R5K1 w - - 0 1",
    played: ["Rd1", "a6"],
    best: ["Rd1", "a6"],
  },
  "position-castle": {
    fen: "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1",
    played: ["O-O", "O-O"],
    best: ["O-O", "O-O"],
  },
  "position-shield": {
    fen: "3q3k/8/8/8/8/8/5PPP/5RK1 w - - 0 1",
    played: ["f4", "Qg8"],
    best: ["f4", "Qg8"],
  },
  "position-pawns": {
    fen: "7k/8/8/3n4/4P3/3P4/8/7K w - - 0 1",
    played: ["exd5", "Kh7"],
    best: ["exd5", "Kh7"],
  },
  "position-passed": {
    fen: "7k/8/1p6/P7/8/8/8/7K w - - 0 1",
    played: ["axb6", "Kh7"],
    best: ["axb6", "Kh7"],
  },
  "position-activity": {
    fen: "7k/8/8/8/8/1P6/P1P5/1B5K w - - 0 1",
    played: ["c4", "Kg7"],
    best: ["c4", "Kg7"],
  },
  "position-center": {
    fen: "7k/7p/8/8/8/8/P7/1N5K w - - 0 1",
    played: ["Nc3", "h6"],
    best: ["Nd2", "h6"],
  },

  "material-center": {
    fen: "r6k/7p/8/8/8/3P4/6P1/R6K w - - 0 1",
    played: [
      "d4",
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
    ],
    best: [
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
    ],
  },
  quiet: {
    fen: new Chess().fen(),
    played: ["e4", "e5"],
    best: ["d4", "d5"],
  },
  uncertain: {
    fen: new Chess().fen(),
    played: ["e4", "e5"],
    best: ["d4", "d5"],
  },
  fork: {
    fen: "r3k3/8/8/3N4/8/8/8/7K w - - 0 1",
    played: ["Nc7+", "Kd7", "Nxa8", "Ke6"],
    best: ["Nc7+", "Kd7", "Nxa8", "Ke6"],
  },
  pin: {
    fen: "8/3kp3/2n5/3P4/8/8/8/5B1K w - - 0 1",
    played: ["Bb5", "e6", "Bxc6+", "Kc7"],
    best: ["Bb5", "e6", "Bxc6+", "Kc7"],
  },
  defender: {
    fen: "7k/8/5r2/3n4/2B5/2B5/8/7K w - - 0 1",
    played: ["Bxd5", "Kh7", "Bxf6", "Kg6"],
    best: ["Bxd5", "Kh7", "Bxf6", "Kg6"],
  },
  defence: {
    fen: "3r3k/8/8/3B4/8/8/2N5/7K w - - 0 1",
    played: ["Ne3", "Ra8"],
    best: ["Ne3", "Ra8"],
  },
  miss: {
    fen: "r3k3/8/8/3N4/8/8/8/7K w - - 0 1",
    played: ["Kh2", "Kf7"],
    best: ["Nc7+", "Kd7", "Nxa8", "Ke6"],
  },
};
const tactical =
  tacticalCases[
    new URLSearchParams(location.search).get(
      "case",
    ) as keyof typeof tacticalCases
  ];
function simulated(fen: string, sans: string[], cp: number): ReviewResult {
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
const game = new Chess();
for (const san of ["f3", "e5", "g4", "Qh4#"]) game.move(san);
let review = new GameReview(game.pgn());
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
if (tactical) {
  const game = new Chess(tactical.fen);
  game.move(tactical.played[0]);
  review = new GameReview(game.pgn());
  review.state = "complete";
  review.results[0] = simulated(
    tactical.fen,
    tactical.best,
    tactical === tacticalCases.fork || tactical === tacticalCases.miss
      ? 0
      : 800,
  );
  review.results[1] = simulated(
    game.fen(),
    tactical.played.slice(1),
    tactical === tacticalCases.miss ||
      tactical === tacticalCases["material-center"]
      ? -500
      : tactical === tacticalCases.fork
        ? 0
        : 800,
  );
}
if (tactical === tacticalCases.uncertain) review.results[0] = null;
// La confirmation pédagogique est simulée seulement dans cette galerie. Les
// tests d’intégration utilisent séparément les deux vrais moteurs UCI.
const candidate = tactical
  ? explainMove(
      review.positions[0],
      review.results[0],
      review.results[1],
      review.annotations[0],
    ).candidate
  : undefined;
const causeStats = { searches: 0, disposed: 0 };
const causeFactory = async (): Promise<Engine> => {
  let listener: (line: string) => void = () => {};
  let command = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    onLine(next) {
      listener = next;
      return () => {
        listener = () => {};
      };
    },
    async dispose() {
      clearTimeout(timer);
      causeStats.disposed++;
    },
    send(line) {
      if (line === "uci") listener("uciok");
      if (line === "isready") listener("readyok");
      if (line.startsWith("position ")) command = line;
      if (!line.startsWith("go ")) return;
      causeStats.searches++;
      const index =
        candidate?.positions.findIndex(
          (position) => position.command === command,
        ) ?? -1;
      const board = boardFromCommand(command);
      const move = board
        .moves({ verbose: true })
        .find((move) => !move.captured && !move.promotion)!;
      const uci = move.from + move.to + (move.promotion ?? "");
      const score =
        candidate?.mode === "loss"
          ? index === 0
            ? -500
            : 500
          : candidate?.mode === "miss"
            ? index === 0
              ? 0
              : -500
            : 800;
      timer = setTimeout(() => {
        listener(
          `info depth 16 score cp ${score * (board.turn() === "w" ? 1 : -1)} pv ${uci}`,
        );
        listener(`bestmove ${uci}`);
      }, 250);
    },
  };
};
const trees = new Map<number, StudyTree>();
// Lire les arbres au moment du contrôle : leur mutation ne rend pas ce parent.
Object.assign(window, {
  explanationFixture: {
    causeStats,
    countBranches: () =>
      [...trees.values()].reduce((sum, tree) => sum + tree.nodes.length - 1, 0),
  },
});
export function Fixture() {
  const [, render] = useState(0);
  useEffect(() => review.subscribe(() => render((value) => value + 1)), []);
  const [selected, select] = useState(tactical ? 1 : 3);
  const [engineId, setEngineId] = useState("default");
  const [revision, setRevision] = useState(0);
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
        <button
          onClick={() => {
            setEngineId(engineId === "default" ? "stockfish" : "default");
            setRevision((value) => value + 1);
          }}
        >
          Changer de moteur
        </button>
        <button
          onClick={() => {
            review.results[selected - 1] = null;
            render((value) => value + 1);
          }}
        >
          Effacer le résultat source
        </button>
        <output data-testid="source-position">{selected}</output>
      </div>
      <InteractiveReview
        key={revision}
        review={review}
        explanationEngineFactory={causeFactory}
        selected={selected}
        onSelect={select}
        engineId={engineId}
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
