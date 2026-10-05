import { Chess } from "chess.js";
import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { corpusInput } from "./corpus";
import { externalCorpus } from "./externalCorpus";
import { decisionContext } from "./context";
import { tacticalConstraints } from "./constraints";
import type { MateRequest } from "./MateVerification";

// Moteur simulé : vérification logicielle, jamais validation pédagogique.
export function mateTestRequest(mirror = false): MateRequest {
  const test = externalCorpus.find((c) => c.id === "morphy-31")!;
  const { position, result } = corpusInput(mirror ? {
    ...test, fen: "2kr4/ppp2ppp/1q6/4p3/4P1b1/4Q3/P2N1PPP/4KB1R b K - 0 16",
    prefix: [], played: "Qb1+", line: ["Nxb1", "Rd1#"],
  } : test);
  const context = decisionContext(position, result);
  const understanding = { context, constraints: tacticalConstraints(context) };
  return {
    review: {}, revision: 0, engineId: "script", understanding,
    hypothesisIndex: understanding.constraints.hypotheses.findIndex((h) => h.kind === "deflection-mate"),
    alternative: mirror ? "b6a6" : "b3a3",
  };
}
export class MateScriptEngine implements Engine {
  listener: (line: string) => void = () => {};
  board = new Chess();
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(private req: MateRequest, private mode: "normal" | "short" | "cp" | "other-choice" | "different-line" | "distance" | "wrong-winner" = "normal") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) { this.board = boardFromCommand(command); this.command = command; }
    if (!command.startsWith("go ") || this.hold) return;
    const context = this.req.understanding.context;
    const reply = this.req.understanding.constraints.shortMate!.replies[0];
    let moves: string[], score: string;
    if (this.command === context.before.command) {
      moves = this.mode === "other-choice" ? ["b3e3"] : [context.moves[context.decision].lan, reply.move, reply.mates[0]];
      score = "mate 2";
    } else if (this.command === context.after.command) {
      moves = this.mode === "short" ? [reply.move] : this.mode === "different-line" ? [reply.move, "d1d2"] : [reply.move, reply.mates[0]];
      score = this.mode === "cp" ? "cp -500" : this.mode === "distance" ? "mate -2" : this.mode === "wrong-winner" ? "mate 1" : "mate -1";
    } else {
      moves = [this.board.moves({ verbose: true })[0].lan];
      score = "cp -500";
    }
    this.listener(`info depth 15 score ${score} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
