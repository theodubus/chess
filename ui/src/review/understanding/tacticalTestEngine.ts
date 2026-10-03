import { Chess } from "chess.js";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { decisionContext, uci } from "./context";
import { framePosition } from "./evidence";
import { tacticalCases } from "./tacticalCases";
import type { TacticalRequest } from "./TacticalVerification";

// Réponses simulées pour les contrats logiciels ; aucun score de cette fixture
// n'est une confirmation pédagogique ou une mesure de force du moteur.
export type Mode = "normal" | "compensation" | "short" | "drift" | "no-gap" | "no-retreat" | "unused-defender" | "different-threat";
export class ScriptEngine implements Engine {
  listener: (line: string) => void = () => {};
  board = new Chess();
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(private req: TacticalRequest, private id: string, private mode: Mode = "normal") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) { this.board = boardFromCommand(command); this.command = command; }
    if (!command.startsWith("go ") || this.hold) return;
    const { context, constraints } = this.req.understanding;
    const h = constraints.hypotheses[this.req.hypothesisIndex];
    const example = tacticalCases.find((c) => c.test.id === this.id)!;
    const alternate = decisionContext({ ...framePosition(context.before), played: this.req.alternative });
    let moves: readonly string[], whiteScore = 0;
    if (this.command === context.before.command) moves = [uci(context.moves[context.decision])];
    else if (this.command === context.after.command) {
      moves = example.test.line;
      if (this.mode === "compensation") moves = ["Qa3", "Nxc3", "bxc3", "Nxe4", "Bxe7", "Qe8"];
      if (this.mode === "short") moves = moves.slice(0, 2);
      if (this.mode === "different-threat") moves = ["a5"];
      whiteScore = (context.before.turn === "w" ? 1 : -1) * (h.role === "allows-loss" ? -300 : 300);
      if (this.mode === "drift" && command.endsWith("20")) whiteScore += 250;
      if (this.mode === "no-gap") whiteScore = 0;
    } else if (this.command === alternate.after.command) {
      moves = example.alternativeLine;
      if (this.mode === "no-retreat") moves = ["Kd7", "dxc6+", "bxc6", "Be2"];
    } else if (this.id === "byrne-allows-fork" && this.command.endsWith(" b6a4")) moves = ["Qxa4"];
    else if (this.id.startsWith("allows-fork") && this.command.endsWith(" d5c7")) moves = [this.id === "allows-fork-false-defence" ? "Rb8" : "Kc8"];
    else if (this.id === "allows-fork-white" && this.command.endsWith(" d4c2")) moves = ["Kc1"];
    else if (this.command.endsWith(" c5a3 f6e4") || this.command.endsWith(" b4a4 f6e4")) moves = this.mode === "unused-defender" ? ["Bxe7"] : ["Nxe4"];
    else throw new Error(`Question inattendue : ${this.command}`);
    const board = new Chess(this.board.fen());
    const pv = moves.map((m) => uci(board.move(m)));
    const score = whiteScore * (this.board.turn() === "w" ? 1 : -1);
    this.listener(`info depth 15 score cp ${score} pv ${pv.join(" ")}`);
    this.listener(`bestmove ${pv[0]}`);
  }
}
