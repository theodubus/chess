import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { BranchAnalysis } from "./BranchAnalysis";
import { StudyTree, boardFromCommand } from "./StudyTree";
import { gamePositions } from "./model";
import { notablePositions } from "./study";
import type { Annotation } from "./annotations";

function game(moves: string[], fen?: string) {
  const board = new Chess(fen);
  for (const move of moves) board.move(move);
  return gamePositions(board.pgn());
}
class ScoredEngine implements Engine {
  listener: (line: string) => void = () => {};
  board = new Chess();
  command = "";
  constructor(
    private response: (
      board: Chess,
      command: string,
    ) => { score: number; pv?: string[] },
  ) {}
  onLine(listener: (line: string) => void) {
    this.listener = listener;
    return () => {
      this.listener = () => {};
    };
  }
  async dispose() {}
  send(command: string) {
    if (command === "uci") {
      this.listener("id name Test");
      this.listener("uciok");
    }
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) {
      this.command = command;
      this.board = boardFromCommand(command);
    }
    if (command.startsWith("go ")) {
      const result = this.response(this.board, this.command);
      const first = this.board.moves({ verbose: true })[0];
      const pv = result.pv ?? [first.from + first.to + (first.promotion ?? "")];
      this.listener(
        `info depth 10 score cp ${result.score * (this.board.turn() === "w" ? 1 : -1)} pv ${pv.join(" ")}`,
      );
      this.listener(`bestmove ${pv[0]}`);
    }
  }
}
it("le défilement retient le camp humain, y compris les noirs et une FEN au trait noir", () => {
  const positions = game(["f3", "e5", "g4", "Qh4#"]);
  const annotations: Annotation[] = [
    "blunder",
    "great",
    "blunder",
    "great",
  ].map((category) => ({
    category: category as Annotation["category"],
    loss: 0,
    reason: "",
  }));
  expect(notablePositions(annotations, positions, "w")).toEqual([1, 3]);
  expect(notablePositions(annotations, positions, "b")).toEqual([2, 4]);
  expect(notablePositions(annotations, positions, "both")).toEqual([
    1, 2, 3, 4,
  ]);
  const custom = game(["Qh4#"], positions[3].fen);
  expect(notablePositions([null], custom, "w")).toEqual([]);
  expect(notablePositions([null], custom, "b")).toEqual([1]);
});
it("classe une tentative et les réponses des deux camps même si les coups sont joués rapidement", async () => {
  const tree = new StudyTree(game([])[0]);
  const white = tree.play(0, "f2", "f3"),
    black = tree.play(white, "e7", "e5");
  const live = new BranchAnalysis();
  const factory = async () =>
    new ScoredEngine((board) => ({
      score: board.history().length === 1 ? -250 : 0,
    }));
  await live.analyse(tree, white, factory, null, null);
  expect(live.annotation?.category).toBe("mistake");
  expect(live.result?.score?.value).toBe(-250);
  await live.analyse(tree, black, factory, null, null);
  expect(live.annotation?.category).toBe("mistake");
  expect(live.before?.score?.value).toBe(-250);
  expect(live.result?.score?.value).toBe(0);
  const cached = vi.fn(factory);
  await live.analyse(tree, white, cached, null, null);
  expect(cached).not.toHaveBeenCalled();
  expect(live.annotation?.category).toBe("mistake");
});
it("attribue brillant à une variante seulement après vérification du sacrifice", async () => {
  const tree = new StudyTree(
    game(
      [],
      "rnbq1rk1/ppp2ppp/3bpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8",
    )[0],
  );
  const node = tree.play(0, "d3", "h7");
  const live = new BranchAnalysis();
  const factory = vi.fn(
    async () =>
      new ScoredEngine((board) => ({
        score: 20,
        pv: board.turn() === "w" ? ["d3h7"] : ["g8h7", "f3g5"],
      })),
  );
  await live.analyse(tree, node, factory, null, null);
  expect(live.annotation?.category).toBe("brilliant");
  expect(factory).toHaveBeenCalledTimes(4);
});
it("ne laisse pas une recherche abandonnée annoter le nouveau coup", async () => {
  const tree = new StudyTree(game([])[0]);
  const first = tree.play(0, "f2", "f3"),
    next = tree.play(0, "g2", "g4");
  const live = new BranchAnalysis();
  let resolve!: (engine: Engine) => void;
  const pending = live.analyse(
    tree,
    first,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    null,
    null,
  );
  await vi.waitFor(() => expect(resolve).toBeDefined());
  const factory = async () =>
    new ScoredEngine((board) => ({ score: board.history().length ? -450 : 0 }));
  await live.analyse(tree, next, factory, null, null);
  resolve(await factory());
  await pending;
  expect(live.node).toBe(next);
  expect(live.state).toBe("complete");
  expect(live.annotation?.category).toBe("blunder");
  const fresh = new BranchAnalysis();
  expect(fresh.resultFor(tree, next)).toBeNull();
});

it("s’abstient si les scores restent contradictoires après la vérification bornée", async () => {
  const tree = new StudyTree(game([], "7k/P7/8/8/8/8/8/7K w - - 0 1")[0]);
  const node = tree.play(0, "a7", "a8", "q");
  expect(tree.board(node).isGameOver()).toBe(false);
  const live = new BranchAnalysis();
  const factory = vi.fn(
    async () =>
      new ScoredEngine((board) => ({
        score: board.history().length ? 500 : 0,
      })),
  );
  await live.analyse(tree, node, factory, null, null);
  expect(live.state).toBe("complete");
  expect(live.annotation).toBeNull();
  expect(factory).toHaveBeenCalledTimes(4);
});
