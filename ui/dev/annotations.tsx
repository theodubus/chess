import { createRoot } from "react-dom/client";
import { Chess } from "chess.js";
import Board from "../src/Board";
import AnnotationBadge from "../src/review/AnnotationBadge";
import { categories, type Category } from "../src/review/annotations";
import { annotationPlacement } from "../src/review/annotationPlacement";
import "../src/index.css";

// Galerie de contrôle visuel uniquement : les annotations sont simulées.
const cases: { category: Category; moves: string[]; fen?: string }[] = [
  { category: "excellent", moves: ["Nf3"] },
  { category: "book", moves: ["e4"] },
  { category: "forced", moves: ["Kxb2"], fen: "7k/8/8/8/8/8/1r6/K7 w - - 0 1" },
  {
    category: "brilliant",
    moves: ["Bxh7+"],
    fen: "rnbq1rk1/ppp2ppp/3bpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8",
  },
];
createRoot(document.getElementById("root")!).render(
  <main
    className="annotation-fixture"
    style={{ maxWidth: 820, margin: "20px auto", padding: 16 }}
  >
    <h1 style={{ fontSize: 20 }}>Contrôle visuel · annotations simulées</h1>
    <div
      style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}
    >
      {(Object.keys(categories) as Category[]).map((category) => (
        <AnnotationBadge
          key={category}
          annotation={{ category, reason: "Exemple de rendu.", loss: null }}
        />
      ))}
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 28,
      }}
    >
      {cases.map(({ category, moves, fen }) => {
        const board = new Chess(fen);
        for (const move of moves) board.move(move);
        const last = board.history({ verbose: true }).at(-1)!;
        const placement = annotationPlacement(board.fen(), last.to, "white");
        return (
          <section key={category}>
            <h2 style={{ fontSize: 14 }}>{categories[category].label}</h2>
            <Board
              fen={board.fen()}
              orientation="white"
              turn={board.turn() === "w" ? "white" : "black"}
              lastMove={[last.from, last.to]}
            >
              <span
                className="board-annotation"
                data-corner={placement.corner}
                style={{
                  left: `${placement.column * 12.5}%`,
                  top: `${placement.row * 12.5}%`,
                }}
              >
                <AnnotationBadge
                  compact
                  annotation={{
                    category,
                    reason: "Exemple de rendu.",
                    loss: null,
                  }}
                />
              </span>
            </Board>
          </section>
        );
      })}
    </div>
  </main>,
);
