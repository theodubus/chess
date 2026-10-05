import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { planHints } from "./hints";
import { FocusedAnalysis } from "./FocusedAnalysis";
import RetryCoach from "./RetryCoach";
import { gamePositions, type ReviewResult } from "./model";

function scenario(fen: string | undefined, sans: string[]) {
  const board = new Chess(fen),
    position = gamePositions(board.pgn())[0];
  const moves = sans.map((san) => board.move(san));
  const result: ReviewResult = {
    score: { kind: "cp", value: 800 },
    depth: 16,
    bestMove: moves[0].from + moves[0].to + (moves[0].promotion ?? ""),
    bestSan: moves[0].san,
    variation: moves.map((move) => ({
      from: move.from,
      to: move.to,
      fen: move.after,
      label: move.san,
    })),
  };
  return { position, result };
}
it.each([
  [
    "r3k3/8/8/3N4/8/8/8/7K w - - 0 1",
    ["Nc7+", "Kd7", "Nxa8", "Ke6"],
    "d5",
    "c7",
  ],
  [
    "7k/8/8/8/3n4/8/8/R3K3 b - - 0 1",
    ["Nc2+", "Kd2", "Nxa1", "Ke3"],
    "d4",
    "c2",
  ],
])(
  "donne une idée sans case ni coup puis uniquement la pièce source (%s)",
  (fen, sans, source, destination) => {
    const { position, result } = scenario(fen as string, sans as string[]),
      hint = planHints(position, result)!;
    expect(hint.idea).toContain("double attaque");
    expect(hint.idea).not.toMatch(/[a-h][1-8]|Nc[27]/);
    expect(hint.piece).toBe(`Regardez le cavalier en ${source}.`);
    expect(hint.piece).not.toContain(destination);
    expect(hint.square).toBe(source);
    expect(hint.move).toBe(result.bestMove);
    expect(hint.specific).toBe(true);
  },
);
it.each([
  [
    "8/3kp3/2n5/3P4/8/8/8/5B1K w - - 0 1",
    ["Bb5", "e6", "Bxc6+", "Kc7"],
    "alignement",
  ],
  ["3r3k/8/8/3B4/8/8/2N5/7K w - - 0 1", ["Ne3", "Ra8"], "neutraliser"],
  [
    "7k/8/5r2/3n4/2B5/2B5/8/7K w - - 0 1",
    ["Bxd5", "Kh7", "Bxf6", "Kg6"],
    "défenseur",
  ],
  ["7k/P7/8/8/8/8/8/7K w - - 0 1", ["a8=Q", "Kh7"], "promotion"],
  ["7k/8/8/8/8/8/1r6/K7 w - - 0 1", ["Kxb2"], "un seul coup"],
])(
  "réutilise un fait vérifié sans dévoiler sa case (%s)",
  (fen, sans, text) => {
    const { position, result } = scenario(fen as string, sans as string[]),
      hint = planHints(position, result)!;
    expect(hint.idea).toContain(text);
    expect(hint.idea).not.toMatch(/[a-h][1-8]/);
    expect(hint.specific).toBe(true);
  },
);
it("signale un mat en un seulement si le coup fait effectivement mat", () => {
  const game = new Chess();
  ["f3", "e5", "g4"].forEach((san) => game.move(san));
  const { position, result } = scenario(game.fen(), ["Qh4#"]);
  expect(planHints(position, result)?.idea).toBe(
    "Vous pouvez donner échec et mat en un coup.",
  );
});
it("garde un conseil général lorsqu’aucun motif vérifiable n’est disponible", () => {
  const { position, result } = scenario(undefined, ["e4", "e5"]),
    hint = planHints(position, result)!;
  expect(hint.specific).toBe(false);
  expect(hint.idea).toContain("Comparez");
});
it("ne transforme pas une capture reprenable en promesse de gain", () => {
  const { position, result } = scenario("rr5k/8/8/8/8/8/8/R6K w - - 0 1", [
    "Rxa8",
  ]);
  expect(planHints(position, result)?.specific).toBe(false);
});
it("refuse un score borné, une PV illégale et une position terminale", () => {
  const { position, result } = scenario(undefined, ["e4", "e5"]);
  expect(planHints(position, null)).toBeNull();
  expect(
    planHints(position, {
      ...result,
      score: { kind: "cp", value: 100, bound: "upper" },
    }),
  ).toBeNull();
  expect(
    planHints(position, {
      ...result,
      variation: [{ ...result.variation[0], to: "e5" }],
    }),
  ).toBeNull();
  const board = new Chess();
  ["f3", "e5", "g4", "Qh4#"].forEach((san) => board.move(san));
  expect(
    planHints(gamePositions(board.pgn()).at(-1)!, {
      score: { kind: "mate", value: 0, winner: "b" },
      depth: null,
      bestMove: null,
      bestSan: null,
      variation: [],
    }),
  ).toBeNull();
});
it("n’insère aucun indice, coup, source ou destination dans le HTML avant une demande", () => {
  const { position, result } = scenario("r3k3/8/8/3N4/8/8/8/7K w - - 0 1", [
    "Nc7+",
    "Kd7",
    "Nxa8",
    "Ke6",
  ]);
  const factory = vi.fn();
  const html = renderToStaticMarkup(
    <RetryCoach
      position={position}
      result={result}
      request={{
        review: {},
        revision: 0,
        engineId: "test",
        positions: [position],
      }}
      analysis={new FocusedAnalysis()}
      factory={factory}
      blocked={false}
      onHighlight={() => {}}
      onReveal={() => {}}
      onRefined={() => {}}
    />,
  );
  expect(html).toContain("Un indice");
  expect(html).toContain("Voir la solution");
  expect(html).not.toMatch(/double attaque|d5|c7|Nc7|Regardez|hint-card/);
  expect(factory).not.toHaveBeenCalled();
});
