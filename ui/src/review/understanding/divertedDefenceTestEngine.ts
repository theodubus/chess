import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext, uci } from "./context";

// Toutes les suites ont été exécutées avant inscription. Les chiffres ci-dessous
// sont simulés : ils vérifient un contrat de preuves, pas la qualité du coup.
export const divertedDefenceCases: CorpusCase[] = [
  { id: "white", fen: "7k/5q2/8/2Q5/8/8/1b6/R2R3K w - - 0 1", prefix: [], played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Kh2"] },
  { id: "black", fen: "r2r3k/1B6/8/8/2q5/8/5Q2/7K b - - 0 1", prefix: [], played: "Qd4", line: ["Qxd4+", "Rxd4", "Bxa8", "Kh7"] },
  { id: "compensation", fen: "3r3k/5q2/8/2Q5/8/8/1b6/R2R3K w - - 0 1", prefix: [], played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Rxd8+", "Kg7"] },
  { id: "pre-existing", fen: "7k/5q2/8/8/2Q5/8/1b6/R2R3K w - - 0 1", prefix: [], played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Kh2"] },
  { id: "still-defends", fen: "7k/q7/8/4b3/2QR4/8/8/3Q3K w - - 0 1", prefix: [], played: "Qca4", line: ["Qxa4", "Qxa4", "Bxd4", "Qxd4+"] },
  { id: "history", fen: "7k/5q2/8/2Q5/8/8/1b6/R2R3K w - - 0 1", prefix: ["Kh2", "Kh7", "Kh1", "Kh8"], played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Kh2"] },
  { id: "pin-white", fen: "3rk3/5q2/1b6/RR6/8/3Q4/7P/3K4 w - - 0 1", prefix: [], played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa5", "Rxd8+", "Kxd8", "Kc2"] },
  { id: "pin-black", fen: "3k4/7p/3q4/8/rr6/1B6/5Q2/3RK3 b - - 0 1", prefix: [], played: "Qd4", line: ["Qxd4+", "Rxd4", "Bxa4", "Rxd1+", "Kxd1", "Kc7"] },
  { id: "unconstrained", fen: "4k3/5q2/1b6/RR6/8/3Q4/7P/3K4 w - - 0 1", prefix: [], played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa5", "Rxa5"] },
  { id: "relative", fen: "3r4/5qk1/1b6/RR6/8/3Q4/7P/K2Q4 w - - 0 1", prefix: [], played: "Qd5", line: ["Qxd5", "Rxd5", "Bxa5", "Rxa5"] },
  { id: "pin-queen-white", fen: "3r4/4kq2/1b6/RQ6/8/3Q4/7P/3K4 w - - 0 1", prefix: [], played: "Qdd5", line: ["Qxd5+", "Qxd5", "Bxa5", "Qxd8+", "Kxd8", "Kc2"] },
  { id: "pin-queen-black", fen: "3k4/7p/3q4/8/rq6/1B6/4KQ2/3R4 b - - 0 1", prefix: [], played: "Qdd4", line: ["Qxd4+", "Qxd4", "Bxa4", "Qxd1+", "Kxd1", "Kc7"] },
].map((c) => ({ family: "recapture-diverts-defender", origin: "constructed-regression", notes: "Faits légaux ; pas de classement indépendant.",
  expected: {}, forbiddenClaims: ["forced-recapture", "winning-recapture", "unique-best"], ...c }));
export function divertedDefenceInput(id = "white") {
  const source = corpusInput(divertedDefenceCases.find((c) => c.id === id)!);
  return { source, request: { review: {}, revision: 0, engineId: "script", position: source.position } };
}
export type DivertedMode = "normal" | "decline" | "other-capture" | "short" | "bound" | "drift" | "mate" | "before-mate" | "before-drift" | "missing-sequence";
export class DivertedDefenceTestEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(private source: ReturnType<typeof divertedDefenceInput>["source"], private mode: DivertedMode = "normal") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (!command.startsWith("go ") || this.hold) return;
    const context = decisionContext(this.source.position, this.source.result), board = boardFromCommand(this.command), budget = Number(command.split(" ").at(-1));
    const index = context.frames.findIndex((f) => f.command === this.command);
    if (index < context.decision || index > context.decision + 3) throw new Error("Question de diversion inattendue.");
    let moves = index === context.decision ? [uci(board.moves({ verbose: true }).find((m) => uci(m) !== this.source.position.played)!)]
      : context.moves.slice(index).map(uci);
    if (this.mode === "decline" && index === context.decision + 2) moves = ["h1h2", "b2a1"];
    if (this.mode === "other-capture" && index === context.decision + 3) moves = ["d8d5", "h1h2"];
    if (this.mode === "short" && index === context.decision + 3) moves = moves.slice(0, 1);
    if (this.mode === "missing-sequence" && index === context.decision + 1) moves = moves.slice(0, 2);
    const sign = board.turn() === "w" ? 1 : -1, actor = context.before.turn === "w" ? 1 : -1;
    const value = (index === context.decision ? 700 : 200) * actor +
      ((this.mode === "drift" || this.mode === "before-drift" && index === context.decision) && budget === 20 ? 200 : 0);
    const score = this.mode === "mate" && index === context.decision + 3 ? "mate 5" :
      this.mode === "before-mate" && index === context.decision ? `mate ${budget === 20 ? 11 : 17}` : `cp ${value * sign}`;
    this.listener(`info depth 15 score ${score}${this.mode === "bound" ? " lowerbound" : ""} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
