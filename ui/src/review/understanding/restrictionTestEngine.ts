import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { corpus, corpusInput, type CorpusCase } from "./corpus";
import { uci } from "./context";
import { understandDecision } from "./prototype";
import type { RestrictionEffectRequest } from "./RestrictionEffectVerification";

// Ces suites construites ont été exécutées avec chess.js avant leur inscription.
// Les scores ci-dessous sont simulés : aucune validation pédagogique indépendante.
export const restrictionCases: CorpusCase[] = [
  corpus.find((c) => c.id === "queen-closes-retreat")!,
  corpus.find((c) => c.id === "queen-closes-retreat-black")!,
  { id: "capture-compensates-decision", fen: "r1bq1r1k/2n1bppp/1p1p4/p1p1pp2/P1P1P3/1B1PBN2/1P1pQPPP/R4RK1 w - - 0 14",
    played: "Qxd2", line: ["f4", "Bxf4", "exf4", "Qxf4"], prefix: [], family: "closed-retreat",
    origin: "constructed-counterexample", notes: "La prise initiale complète la compensation, bilan total nul.", expected: {}, forbiddenClaims: ["forced-loss"] },
  { id: "another-piece-saves-restricted-bishop", fen: "8/8/2n4k/8/8/PP6/BQ5K/2r5 w - - 0 1",
    played: "Qb1", line: ["Nb4", "axb4"], prefix: [], family: "closed-retreat",
    origin: "constructed-counterexample", notes: "Le pion retire l'attaquant ; aucune perte du fou confirmée.", expected: {}, forbiddenClaims: ["forced-loss"] },
];
export function restrictionInput(id = "queen-closes-retreat") {
  const test = restrictionCases.find((c) => c.id === id)!;
  const source = corpusInput(test), understanding = understandDecision(source.position, source.result);
  const hypothesisIndex = understanding.hypotheses.findIndex((h) => h.kind === "allows-restriction");
  if (hypothesisIndex < 0) throw new Error("Restriction négative attendue absente.");
  return { test, source, request: { review: {}, revision: 0, engineId: "script", understanding, hypothesisIndex } };
}
export type RestrictionMode = "normal" | "handled" | "short" | "drift" | "escape" | "compound-escape" | "different-threat" | "different-defence" | "bound" | "delayed" | "other-target" | "unblocked";
export class RestrictionTestEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(private request: RestrictionEffectRequest, private mode: RestrictionMode = "normal", private victimScore = -300) {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (!command.startsWith("go ") || this.hold) return;
    const { context } = this.request.understanding, h = this.request.understanding.hypotheses[this.request.hypothesisIndex];
    const board = boardFromCommand(this.command), budget = Number(command.split(" ").at(-1));
    const line = (sans: string[]) => sans.map((san) => uci(board.move(context.before.turn === "b"
      ? san.replace(/[1-8]/g, (rank) => String(9 - Number(rank))) : san)));
    let moves: string[], whiteScore = this.victimScore * (context.before.turn === "w" ? 1 : -1);
    if (this.command === context.before.command) { moves = [uci(context.moves[context.decision])]; whiteScore = 0; }
    else if (this.command === context.after.command) {
      moves = context.moves.slice(context.decision + 1).map(uci);
      if (this.mode === "different-threat") moves = [uci(board.moves({ verbose: true }).find((m) => uci(m) !== moves[0])!)];
    } else if (this.command === context.frames[h.threatPly + 1].command) {
      moves = context.moves.slice(h.threatPly + 1).map(uci);
      if (this.mode === "handled" || (this.mode === "different-defence" && budget === 20)) {
        moves = line(["Bxf4", "exf4", "Bd1"]);
      } else if (this.mode === "escape") moves = line(["Bxc5", "dxc5"]);
      else if (this.mode === "compound-escape") moves = line(["d4", "cxd4", "Bxd4", "exd4", "Qxd4"]);
      else if (this.mode === "other-target") moves = line(["d4", "cxd4", "Nxd4"]);
      else if (this.mode === "delayed") moves = line(["d4", "Be6", "g3", "fxe3"]);
      else if (this.mode === "unblocked") moves = line(["Qxa5", "bxa5", "Bxc5", "dxc5"]);
      else if (this.mode === "short") moves = moves.slice(0, 2);
      if (this.mode === "drift" && budget === 20) whiteScore += 250;
    } else throw new Error(`Question inattendue : ${this.command}`);
    const score = whiteScore * (boardFromCommand(this.command).turn() === "w" ? 1 : -1);
    this.listener(`info depth 15 score cp ${score}${this.mode === "bound" ? " lowerbound" : ""} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
