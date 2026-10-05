import type { Engine } from "../../engine/Engine";
import { DEFAULT_POSITION } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext, uci } from "./context";
import { movedPieceExposure } from "./movedPieceExposure";
import { understandDecision } from "./prototype";

// Positions, décisions et deux continuations exécutées avant inscription.
// Les chiffres CP simulés vérifient le protocole, jamais la qualité des coups.
export const movedPieceCases: (CorpusCase & { alternative: string[] })[] = [
  { id: "white", fen: "1r5k/7p/8/8/8/7P/8/R6K w - - 0 1", played: "Rb1", line: ["Rxb1+", "Kh2"], alternative: ["Ra7", "Kg8", "Kg1"] },
  { id: "black", fen: "r6k/8/7p/8/8/8/7P/1R5K b - - 0 1", played: "Rb8", line: ["Rxb8+", "Kh7"], alternative: ["Ra2", "Kg1", "Kg8"] },
  { id: "capture", fen: "7k/7p/8/4p3/3r4/8/7P/3Q3K w - - 0 1", played: "Qxd4", line: ["exd4", "Kg1"], alternative: ["Qa1", "Kg8", "Kg1"] },
  { id: "even", fen: "7k/7p/8/4p3/3q4/8/7P/3Q3K w - - 0 1", played: "Qxd4", line: ["exd4", "Kg1"], alternative: ["Qh5", "Kg8", "Kg2"] },
  { id: "defended", fen: "1r5k/7p/8/8/8/7P/2Q5/R6K w - - 0 1", played: "Rb1", line: ["Rxb1+", "Qxb1", "Kg8"], alternative: ["Qa4", "Kg8", "Kg1"] },
  { id: "ep", fen: "7k/8/8/8/3p4/8/4P3/7K w - - 0 1", played: "e4", line: ["dxe3", "Kg1", "Kg8"], alternative: ["Kg1", "Kh7", "Kf1"] },
  { id: "promotion", fen: "1r5k/P7/8/8/8/8/7P/7K w - - 0 1", played: "a8=Q", line: ["Rxa8", "Kg1", "Kg8"], alternative: ["axb8=Q+", "Kg7", "Kg1"] },
  { id: "non-local-loss", fen: "7k/5q2/8/2Q5/8/8/1b6/R2R3K w - - 0 1", played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Kh2"], alternative: ["Qa5", "Kh7", "Kh2"] },
  { id: "terminal-defence", fen: DEFAULT_POSITION, prefix: ["f3", "e5", "g4", "Nc6", "f4"], played: "Qg5", line: ["fxg5", "Ke7"], alternative: ["Qh4#"] },
].map(c => ({ family: "moved-piece-exposure", origin: "constructed", notes: "Pièce déplacée puis capturée ; verdict non déduit de ce fait.",
  expected: {}, forbiddenClaims: ["forced-loss", "unique-defence", "unique-best"], prefix: [], ...c }));
export function movedPieceInput(id = "white") {
  const example = movedPieceCases.find(c => c.id === id)!, source = corpusInput(example), understanding = understandDecision(source.position, source.result);
  const threat = movedPieceExposure(understanding)!;
  return { example, source, understanding, request: { review: {}, revision: 0, engineId: "script", position: source.position, threat } };
}
export class MovedPieceTestEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = ""; commands: string[] = []; disposed = false;
  constructor(private input: ReturnType<typeof movedPieceInput>, private scoreMode: "cp" | "mate-loss" | "mate-win-alternative" | "mate-both-loss" = "cp") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (!command.startsWith("go ")) return;
    const { source, example } = this.input, root = decisionContext(source.position), board = boardFromCommand(this.command);
    const alternativeBoard = boardFromCommand(source.position.command), alternative = example.alternative.map(s => uci(alternativeBoard.move(s)));
    const alternativeCommand = source.position.command + (source.position.command.includes(" moves ") ? " " : " moves ") + alternative[0];
    let moves: string[], value = 0, kind = "cp";
    const actorSign = source.position.turn === "w" ? 1 : -1;
    if (this.command === source.position.command) {
      moves = alternative;
      if (example.id === "terminal-defence") { kind = "mate"; value = actorSign; }
    }
    else if (this.command === root.after.command) {
      moves = source.result!.variation.map(item => {
        const move = board.moves({ verbose: true }).find(m => m.from === item.from && m.to === item.to && m.after === item.fen);
        if (!move) throw new Error("Suite de test incohérente.");
        return uci(board.move(move));
      });
      value = -500 * (source.position.turn === "w" ? 1 : -1);
      if (this.scoreMode === "mate-loss" || this.scoreMode === "mate-both-loss") { kind = "mate"; value = -8 * actorSign; }
    } else if (this.command === alternativeCommand) {
      moves = alternative.slice(1);
      if (this.scoreMode === "mate-win-alternative" || this.scoreMode === "mate-both-loss") { kind = "mate"; value = 4 * actorSign * (this.scoreMode === "mate-both-loss" ? -1 : 1); }
    }
    else throw new Error("Question d'exposition inattendue.");
    const sign = boardFromCommand(this.command).turn() === "w" ? 1 : -1;
    this.listener(`info depth 15 score ${kind} ${value * sign} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
