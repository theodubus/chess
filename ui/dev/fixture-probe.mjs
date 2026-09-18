import { createInterface } from "node:readline";
import { Chess } from "chess.js";
const mode = process.argv[2];
let board = new Chess();
createInterface({ input: process.stdin }).on("line", (line) => {
  if (line === "quit") process.exit(0);
  if (mode === "silent") return;
  if (line === "uci") process.stdout.write("id name Test UCI\nuciok\n");
  if (line === "isready") process.stdout.write("readyok\n");
  if (line.startsWith("position ")) {
    const [start, moves] = line.split(" moves ");
    board = new Chess(
      start.startsWith("position fen ") ? start.slice(13) : undefined,
    );
    for (const move of moves?.split(" ") ?? [])
      board.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move[4],
      });
  }
  if (line.startsWith("go ")) {
    const move = board.moves({ verbose: true })[0];
    const uci = move.from + move.to + (move.promotion ?? "");
    if (mode !== "no-score")
      process.stdout.write(`info depth 1 score cp 0 pv ${uci}\n`);
    process.stdout.write(`bestmove ${mode === "illegal" ? "a1a8" : uci}\n`);
  }
});
