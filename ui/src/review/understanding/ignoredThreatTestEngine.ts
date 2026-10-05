import type { Engine } from "../../engine/Engine";
import { DEFAULT_POSITION } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext, uci } from "./context";
import { ignoredThreat } from "./ignoredThreat";
import { understandDecision } from "./prototype";

// Faits exécutés avant inscription ; les scores sont simulés et ne mesurent
// ni la qualité échiquéenne ni la pertinence pédagogique de ces exemples.
export const ignoredThreatCases: (CorpusCase & { alternative: string[] })[] = [
  { id: "white", fen: "r6k/7p/8/8/8/8/7P/R6K w - - 0 1", prefix: [], played: "h3", line: ["Rxa1+", "Kh2"], alternative: ["Rb1", "Kg8", "Kg1"] },
  { id: "black", fen: "r6k/7p/8/8/8/8/7P/R6K b - - 0 1", prefix: [], played: "h6", line: ["Rxa8+", "Kh7"], alternative: ["Rb8", "Kg1", "Kg8"] },
  { id: "history", prefix: ["e4", "e5", "d3", "Nc6", "Be3", "Nf6", "Nf3", "d5", "exd5", "Qxd5", "Nc3", "Qd4", "a3", "Ng4"], played: "b3", line: ["Nxe3", "fxe3", "Qxe3+", "Qe2", "Qxe2+", "Kxe2"], alternative: ["Bd2", "Qb6", "b3"] },
  { id: "compensation", fen: "r6k/7p/8/8/8/8/7P/RQ5K w - - 0 1", prefix: [], played: "h3", line: ["Rxa1", "Qxa1+", "Kg8"], alternative: ["Rxa8+", "Kg7", "Kg1"] },
  { id: "new", fen: "r6k/7p/8/8/8/8/7P/1R5K w - - 0 1", prefix: [], played: "Ra1", line: ["Rxa1+", "Kg2"], alternative: [] },
  { id: "moved", fen: "r6k/7p/8/8/8/8/7P/R6K w - - 0 1", prefix: [], played: "Ra2", line: ["Rxa2", "Kg1"], alternative: [] },
].map(example => ({ family: "ignored-threat", origin: "constructed", notes: "Menace déjà présente ; scores simulés pour le contrat de vérification.",
  expected: {}, forbiddenClaims: ["forced-loss", "unique-defence", "unique-best"], fen: DEFAULT_POSITION, ...example }));
export function ignoredThreatInput(id = "white") {
  const example = ignoredThreatCases.find(c => c.id === id)!, source = corpusInput(example);
  const understanding = understandDecision(source.position, source.result), threat = ignoredThreat(understanding);
  return { example, source, understanding, request: { review: {}, revision: 0, engineId: "script", position: source.position, threat: threat! } };
}
export type IgnoredMode = "normal" | "different" | "short" | "bound" | "drift" | "reversal" | "no-defence" | "same-decision";
export class IgnoredThreatTestEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = ""; commands: string[] = []; disposed = false; hold = false;
  constructor(private input: ReturnType<typeof ignoredThreatInput>, private mode: IgnoredMode = "normal") {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (!command.startsWith("go ") || this.hold) return;
    const { source, example } = this.input, root = decisionContext(source.position);
    const board = boardFromCommand(this.command), alternativeBoard = boardFromCommand(source.position.command);
    const alternative = example.alternative.map(san => uci(alternativeBoard.move(san)));
    const alternativeCommand = source.position.command + (source.position.command.includes(" moves ") ? " " : " moves ") + alternative[0];
    let moves: string[], value = 0;
    if (this.command === source.position.command) moves = this.mode === "same-decision" ? [source.position.played!] : alternative;
    else if (this.command === root.after.command) {
      moves = source.result!.variation.map(item => {
        const move = board.moves({ verbose: true }).find(m => m.from === item.from && m.to === item.to && m.after === item.fen);
        if (!move) throw new Error("Suite de test incohérente.");
        return uci(board.move(move));
      });
      value = -500 * (source.position.turn === "w" ? 1 : -1);
      if (this.mode === "short") moves = moves.slice(0, 1);
      if (this.mode === "different") moves = source.position.turn === "w" ? ["h7h6", "h1h2"] : ["h2h3", "h8h7"];
      if (this.mode === "drift" && command.endsWith("20")) value += 200;
      if (this.mode === "reversal" && command.endsWith("20")) value = 300 * (source.position.turn === "w" ? 1 : -1);
    } else if (this.command === alternativeCommand) {
      moves = alternative.slice(1);
      if (this.mode === "no-defence") moves = source.position.turn === "w" ? ["a8b8", "h1g1"] : ["a1b1", "h8g8"];
    } else throw new Error("Question de menace ignorée inattendue.");
    const sign = boardFromCommand(this.command).turn() === "w" ? 1 : -1;
    this.listener(`info depth 15 score cp ${value * sign}${this.mode === "bound" ? " lowerbound" : ""} pv ${moves.join(" ")}`);
    this.listener(`bestmove ${moves[0]}`);
  }
}
