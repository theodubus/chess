import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";
import { gamePositions } from "./model";
import { StudyTree, boardFromCommand } from "./StudyTree";
import { LiveStudy } from "./LiveStudy";
import { notablePositions } from "./study";
import type { Engine } from "../engine/Engine";

function game(moves: string[]) {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return board;
}
it("garde les branches, les coups des deux camps et la partie source intacts", () => {
  const source = game(["e4", "e5"]);
  const pgn = source.pgn();
  const tree = new StudyTree(gamePositions(pgn)[2]);
  const knight = tree.play(0, "g1", "f3");
  const reply = tree.play(knight, "b8", "c6");
  const bishop = tree.play(0, "f1", "c4");
  expect(tree.nodes[0].children).toEqual([knight, bishop]);
  expect(tree.play(0, "g1", "f3")).toBe(knight);
  expect(tree.command(reply)).toBe(
    "position startpos moves e2e4 e7e5 g1f3 b8c6",
  );
  expect(tree.board(reply).fen()).toBe(game(["e4", "e5", "Nf3", "Nc6"]).fen());
  expect(() => tree.play(reply, "a1", "a8")).toThrow();
  expect(source.pgn()).toBe(pgn);
});
it("préserve répétitions, roque, prise en passant et sous-promotion", () => {
  const repeated = game(["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1"]);
  let tree = new StudyTree(gamePositions(repeated.pgn()).at(-1)!);
  const draw = tree.play(0, "f6", "g8");
  expect(tree.board(draw).isThreefoldRepetition()).toBe(true);
  expect(tree.destinations(draw).size).toBe(0);
  tree = new StudyTree(
    gamePositions(game(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]).pgn()).at(-1)!,
  );
  expect(tree.nodes[tree.play(0, "e1", "g1")].label).toContain("O-O");
  tree = new StudyTree(
    gamePositions(game(["e4", "a6", "e5", "d5"]).pgn()).at(-1)!,
  );
  const ep = tree.play(0, "e5", "d6");
  expect(tree.board(ep).get("d5")).toBeUndefined();
  const promotion = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
  expect(promotion.moves()).toContain("a8=N");
  tree = new StudyTree(gamePositions(promotion.pgn())[0]);
  const promoted = tree.play(0, "a7", "a8", "n");
  expect(tree.board(promoted).get("a8")?.type).toBe("n");
});
it("retient les vrais moments clés", () => {
  expect(
    notablePositions([
      { category: "book", loss: null, reason: "" },
      { category: "best", loss: 0, reason: "" },
      { category: "blunder", loss: 0.3, reason: "" },
      { category: "brilliant", loss: 0, reason: "" },
    ]),
  ).toEqual([3, 4]);
});
class StudyEngine implements Engine {
  listener: (line: string) => void = () => {};
  board = new Chess();
  hold = false;
  disposed = false;
  onLine(listener: (line: string) => void) {
    this.listener = listener;
    return () => {
      this.listener = () => {};
    };
  }
  async dispose() {
    this.disposed = true;
  }
  send(command: string) {
    if (command === "uci") {
      this.listener("id name Test");
      this.listener("uciok");
    }
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.board = boardFromCommand(command);
    if (command.startsWith("go ") && !this.hold) {
      const move = this.board.moves({ verbose: true })[0],
        uci = move.from + move.to + (move.promotion ?? "");
      this.listener(`info depth 8 score cp 40 pv ${uci}`);
      this.listener(`bestmove ${uci}`);
    }
  }
}
it("évalue une variante, normalise le camp noir et traite le mat sans moteur", async () => {
  const live = new LiveStudy(),
    engine = new StudyEngine();
  await live.analyse("position startpos moves e2e4", async () => engine);
  expect(live.state).toBe("complete");
  expect(live.result?.score?.value).toBe(-40);
  expect(engine.disposed).toBe(true);
  const mate = game(["f3", "e5", "g4", "Qh4#"]);
  const factory = vi.fn(async () => new StudyEngine());
  await live.analyse(gamePositions(mate.pgn()).at(-1)!.command, factory);
  expect(live.result?.score).toEqual({ kind: "mate", value: 0, winner: "b" });
  expect(factory).not.toHaveBeenCalled();
});
it("ignore les réponses et les connexions tardives quand la position change", async () => {
  const live = new LiveStudy(),
    first = new StudyEngine();
  first.hold = true;
  const task = live.analyse("position startpos", async () => first);
  await vi.waitFor(() => expect(live.info).toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const late = first.listener;
  await live.analyse(
    "position startpos moves e2e4",
    async () => new StudyEngine(),
  );
  late("info depth 99 score cp 999");
  late("bestmove e2e4");
  await task;
  expect(live.command).toBe("position startpos moves e2e4");
  expect(live.result?.score?.value).toBe(-40);
  let resolve!: (engine: Engine) => void;
  const pending = live.analyse(
    "position startpos",
    () =>
      new Promise<Engine>((done) => {
        resolve = done;
      }),
  );
  await new Promise((done) => setTimeout(done, 0));
  await live.stop();
  const engine = new StudyEngine();
  resolve(engine);
  await pending;
  expect(engine.disposed).toBe(true);
  expect(live.result).toBeNull();
});
