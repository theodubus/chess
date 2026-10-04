import type { PieceSymbol } from "chess.js";
import type { Category } from "../annotations";
import { boardFromCommand } from "../StudyTree";
import { frenchSan } from "../model";
import type { TacticalMark } from "../tactics";
import { uci, type DecisionContext, type PositionFrame, type TrackedPiece } from "./context";
import { exchangeContext, type ExchangeContext } from "./exchanges";
import { extendBranch } from "./relationContrast";
import type { TacticalConstraints, TacticalHypothesis } from "./constraints";
import { campName, points } from "./materialWording";
export { campName, points } from "./materialWording";

export type ExplanationStep = {
  command: string;
  fen: string;
  label: string;
  note: string;
  marks: TacticalMark[];
  origin: "position" | "engine-line" | "conditional-move" | "rules";
};
export type PedagogicalDraft = {
  status: "draft";
  family: "double-targets" | "exchanged-defender" | "blocked-retreat" | "closed-retreat" | "diverted-defender" | "deflection-mate" | "forced-mate" | "ignored-threat";
  role: "creates-opportunity" | "allows-loss";
  title: string;
  summary: string;
  comparisonText: string;
  story: { decision: string; change: string; consequence: string; alternative: string };
  played: ExplanationStep[];
  alternative: ExplanationStep[];
  evidence: {
    playedMoves: string[];
    alternativeMoves: string[];
    materialDelta: number | null;
    exchange: ExchangeContext | null;
    contextText: string | null;
    origin: "engine-lines" | "engine-and-rules";
    scope: "observed-consequence" | "conditional-contribution" | "short-forcing-route";
  };
  limitation: string;
};
const names: Record<PieceSymbol, string> = { p: "le pion", n: "le cavalier", b: "le fou", r: "la tour", q: "la dame", k: "le roi" };
export const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);
export function describePiece(piece: TrackedPiece) {
  const feminine = "qr".includes(piece.type);
  const color = piece.color === "w" ? feminine ? "blanche" : "blanc" : feminine ? "noire" : "noir";
  return `${names[piece.type]} ${color} en ${piece.square}`;
}
export function moveLabel(frame: Pick<PositionFrame, "command">, move: string) {
  return frenchSan(boardFromCommand(frame.command).move(move).san);
}
export function assertDraftQuestions(context: DecisionContext, alternative: PositionFrame | null,
  passes: { questions: { purpose: string; position: Pick<PositionFrame, "command" | "fen"> }[] }[]) {
  if (passes.length !== 2) throw new Error("Deux confirmations requises pour le brouillon.");
  for (const pass of passes) {
    const expected: [string, PositionFrame][] = [["decision", context.before], ["played", context.after]];
    if (alternative) expected.push(["alternative", alternative]);
    for (const [purpose, frame] of expected) {
      const question = pass.questions.find((q) => q.purpose === purpose);
      if (!question || question.position.command !== frame.command || question.position.fen !== frame.fen)
        throw new Error("Preuve d'une autre décision ou alternative.");
    }
  }
}
export function assertDraftHypothesis(constraints: TacticalConstraints, hypothesis: TacticalHypothesis) {
  if (!constraints.hypotheses.some((h) => JSON.stringify(h) === JSON.stringify(hypothesis)))
    throw new Error("Hypothèse d'un autre contexte tactique.");
}
export function explanationSteps(frame: PositionFrame, moves: string[], label: string): ExplanationStep[] {
  if (moves.length > 8) throw new Error("Démonstration trop longue.");
  const board = boardFromCommand(frame.command);
  if (board.fen() !== frame.fen) throw new Error("Démonstration d'une autre position.");
  let command = frame.command;
  const steps: ExplanationStep[] = [{ command, fen: frame.fen, label, note: "", marks: [], origin: "position" }];
  for (const input of moves) {
    if (board.isGameOver()) throw new Error("Démonstration après la fin de partie.");
    const move = board.move(input);
    command += (command.includes(" moves ") ? " " : " moves ") + uci(move);
    steps.push({ command, fen: board.fen(), label: frenchSan(move.san), note: "", marks: [{ from: move.from, to: move.to, tone: "threat" }], origin: "engine-line" });
  }
  return steps;
}
/** Une reprise ne recommence pas un échange. Son bilan propre et celui de
 * l'épisode gardent le point de vue du joueur qui vient de décider. */
export function draftExchange(context: DecisionContext, moves: string[]) {
  const exchange = exchangeContext(extendBranch(context, moves));
  let contextText: string | null = null;
  if (exchange?.role === "recapture") {
    contextText = `Ce coup reprend une pièce dans un échange déjà commencé. ` +
      (exchange.beginning === "unknown" ? "Son début manque dans l'historique ; le bilan global n'est pas connu."
        : `Dans cette suite, l'échange entier vaut ${points(exchange.totalBalance)} pour les ${campName(context.before.turn)}, contre ${points(exchange.balanceFromDecision)} à partir de cette reprise.`);
  } else if (exchange?.beginning === "unknown") {
    contextText = "L'historique ne permet pas de savoir si cette prise commence un échange ou poursuit un échange antérieur.";
  }
  return { exchange, contextText };
}

/** Un motif bénéfique peut être secondaire dans un coup pourtant mauvais. Le
 * verdict de qualité appartient au classificateur, pas au détecteur du motif. */
export function draftPlacement(draft: Pick<PedagogicalDraft, "role">, verdict: Category): "candidate-primary" | "secondary" {
  const positive = ["brilliant", "great", "best", "excellent", "good"].includes(verdict);
  const negative = ["inaccuracy", "mistake", "blunder", "miss"].includes(verdict);
  return (positive && draft.role === "creates-opportunity") || (negative && draft.role === "allows-loss")
    ? "candidate-primary" : "secondary";
}
