import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { corpusInput, assessDecision } from "./corpus";
import { understandDecision } from "./prototype";
import {
  externalGames,
  externalCorpus,
  externalCasesFromGame,
  externalCorpusReport,
} from "./externalCorpus";

for (const game of externalGames)
  it(`le PGN publié est légal et la sélection conserve tout son passé : ${game.id}`, () => {
    const board = new Chess();
    board.loadPgn(game.pgn, { strict: true });
    const history = board.history({ verbose: true });
    expect(history).toHaveLength(game.plies);
    expect(board.fen()).toBe(game.finalFen);
    expect(game.pgn).not.toMatch(/[{}()]/);
    expect(game.source).toMatch(/^https:\/\/lichess.org\/study\//);
    const cases = externalCasesFromGame(game);
    for (const [index, test] of cases.entries()) {
      const selected = game.selection[index];
      const { position, result } = corpusInput(test);
      expect(position.command).toBe(
        "position startpos moves " +
          history
            .slice(0, selected.ply - 1)
            .map((m) => m.lan)
            .join(" "),
      );
      expect(position.fen).toBe(history[selected.ply - 1].before);
      expect(position.played).toBe(history[selected.ply - 1].lan);
      expect(boardFromCommand(position.command).fen()).toBe(position.fen);
      expect(result?.score).toBeNull();
      expect(result?.depth).toBeNull();
      expect(result?.variation.map((m) => m.fen)).toEqual(
        history.slice(selected.ply, selected.ply + 8).map((m) => m.after),
      );
    }
  });

it("refuse le décalage de coup, les doublons et les métadonnées d'une autre partie", () => {
  const original = externalGames[0];
  for (const mutate of [
    (g) => g.selection[0].ply++,
    (g) => (g.selection[0].san = "e4"),
    (g) => g.selection.push(g.selection[0]),
    (g) => g.plies--,
    (g) => (g.finalFen = externalGames[1].finalFen),
    (g) => (g.pgn = '[Result "*"]\n\n1. e4 e5 2. Qh4 *'),
    (g) =>
      (g.pgn = '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/7K w - - 0 1"]\n\n1. Kh2 *'),
  ] as ((g: typeof original) => void)[]) {
    const game = structuredClone(original);
    mutate(game);
    expect(() => externalCasesFromGame(game)).toThrow();
  }
});
it("mesure les idées manquantes séparément du corpus construit", () => {
  const report = externalCorpusReport();
  expect(report.positions).toBe(12);
  expect(report.expectedInsights).toBe(11);
  expect(report.recognizedInsights).toBe(2);
  expect(report.missingInsights).toHaveLength(9);
  expect(report.missingInsights).toEqual(
    expect.arrayContaining(["byrne-22", "morphy-31", "capablanca-69"]),
  );
  expect(report.publishableExplanations).toBe(0);
  expect(report.independentValidation).toBe(false);
  expect(report.provenance).toMatchObject({
    sourceGamesIndependentOfDetector: true,
    independentPedagogicalReview: false,
    representativeSample: false,
    selection: "fixed-before-prototype-measurement",
    continuation: "played-game-moves",
  });
  expect(report.relationAnnotationCoverage.completeDecisions).toBe(12);
  expect(report.unreviewedRelationCandidates).toBe(0);
  expect(report.falseHypotheses).toBe(0);
  console.info(JSON.stringify(report, null, 2));
}, 20000);

it("la perte locale dans le sacrifice de tour ne devient pas la raison du sacrifice", () => {
  const test = externalCorpus.find((c) => c.id === "morphy-25")!;
  const { position, result } = corpusInput(test);
  const analysis = understandDecision(position, result);
  expect(analysis.context.priorHistory).toBe("complete");
  expect(analysis.exchange).toMatchObject({
    role: "initial-capture",
    beginning: "known",
    totalBalance: -2,
    balanceFromDecision: -2,
    moves: ["d1d7", "d8d7"],
  });
  expect(analysis.context.frames.at(-1)!.terminal).toBe(true);
  expect(new Chess(analysis.context.frames.at(-1)!.fen).isCheckmate()).toBe(
    true,
  );
  const row = assessDecision(test, analysis);
  expect(row.exchangeMatched).toBe(true);
  expect(row.expected).toBe("sacrifice-compensation");
  expect(row.matched).toBe(false);
  expect(analysis.explanation).toBeNull();
});
it("le sacrifice de dame force la déviation puis le mat dans le témoin joué", () => {
  const test = externalCorpus.find((c) => c.id === "morphy-31")!;
  const { position } = corpusInput(test);
  const board = boardFromCommand(position.command);
  board.move(position.played!);
  expect(board.moves()).toEqual(["Nxb8"]);
  board.move("Nxb8");
  expect(board.move("Rd8#").san).toBe("Rd8#");
  expect(board.isCheckmate()).toBe(true);
});
it("les cibles de Na4 sont réelles et le pion passé ne dépend pas du détecteur", () => {
  const fork = corpusInput(
    externalCorpus.find((c) => c.id === "byrne-22")!,
  ).position;
  const board = boardFromCommand(fork.command);
  board.move(fork.played!);
  expect(board.isAttacked("c5", "b")).toBe(true);
  expect(board.isAttacked("c3", "b")).toBe(true);
  expect(board.get("c5")).toEqual({ type: "q", color: "w" });
  expect(board.get("c3")).toEqual({ type: "n", color: "w" });
  const pawn = corpusInput(
    externalCorpus.find((c) => c.id === "capablanca-73")!,
  ).position;
  const end = boardFromCommand(pawn.command);
  end.move(pawn.played!);
  expect(end.get("g6")).toEqual({ type: "p", color: "w" });
  const blockers = end
    .board()
    .flat()
    .filter(
      (p) =>
        p &&
        p.color === "b" &&
        p.type === "p" &&
        "fgh".includes(p.square[0]) &&
        Number(p.square[1]) >= 6,
    );
  expect(blockers).toEqual([]);
});
