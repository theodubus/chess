import { Chess } from "chess.js";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext, opposite, uci } from "./context";

// Positions et suites exécutées avec chess.js avant inscription. Ces scores
// simulés testent le raccordement ; les cas construits ne valident pas un verdict.
export const mateConsequenceCases: CorpusCase[] = [
  { id: "fools-mate", prefix: ["f3", "e5"], played: "g4", line: ["Qh4#"] },
  { id: "reverse-fools-mate", prefix: ["d4", "f6", "e4"], played: "g5", line: ["Qh5#"] },
  { id: "quiet-mate", fen: "1k6/8/2K5/8/4Q3/8/8/8 b - - 0 1", prefix: [], played: "Ka8", line: ["Qe7", "Kb8", "Qb7#"] },
  { id: "two-defences", fen: "k7/p7/2K5/8/8/8/8/Q7 b - - 0 1", prefix: [], played: "a6", line: ["Qb2", "Ka7", "Qb7#"] },
  { id: "legals-mate", prefix: ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5"], played: "Bxd1", line: ["Bxf7+", "Ke7", "Nd5#"] },
  { id: "unforced-line", prefix: ["f3", "e5"], played: "g3", line: ["Qh4", "gxh4"] },
].map((c) => ({ family: "forced-mate", origin: "constructed-regression", notes: "Scores simulés, pas de classement attendu indépendant.",
  fen: new Chess().fen(), expected: {}, forbiddenClaims: ["unique-best"], ...c }));
export function mateConsequenceInput(id = "fools-mate") {
  const source = corpusInput(mateConsequenceCases.find((c) => c.id === id)!);
  return { source, request: { review: {}, revision: 0, engineId: "script", position: source.position } };
}
export type MateMode = "normal" | "short" | "cp" | "wrong-winner" | "pre-existing" | "bound" | "drift";
export class MateConsequenceTestEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(private source: ReturnType<typeof mateConsequenceInput>["source"], private mode: MateMode = "normal") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (!command.startsWith("go ") || this.hold) return;
    const context = decisionContext(this.source.position, this.source.result), before = this.command === context.before.command,
      board = boardFromCommand(this.command), winner = opposite(context.before.turn), budget = Number(command.split(" ").at(-1));
    let moves: string[], score: string;
    if (before) {
      moves = [uci(board.moves({ verbose: true }).find((m) => uci(m) !== this.source.position.played)!)];
      score = this.mode === "pre-existing" ? `mate ${board.turn() === winner ? 3 : -3}` : "cp 0";
    } else {
      if (this.command !== context.after.command) throw new Error("Question de mat inattendue.");
      moves = context.moves.slice(context.decision + 1).map(uci);
      const distance = moves.at(-1) && context.frames.at(-1)!.terminal ? Math.ceil(moves.length / 2) : 1;
      score = this.mode === "cp" || this.mode === "drift" && budget === 20 ? "cp 800" :
        `mate ${distance * (board.turn() === winner ? 1 : -1) * (this.mode === "wrong-winner" ? -1 : 1)}`;
      if (this.mode === "short") moves = moves.slice(0, 1);
    }
    this.listener(`info depth 15 score ${score}${this.mode === "bound" ? " lowerbound" : ""} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
