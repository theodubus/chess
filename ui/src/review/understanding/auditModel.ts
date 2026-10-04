import { GameReview } from "../GameReview";
import { boardFromCommand } from "../StudyTree";
import type { ConfirmedConsequence } from "../directExplanation";
import type { ReviewResult } from "../model";
import type { PedagogicalResult } from "./PedagogicalAnalysis";

export type AuditDecision = { index: number; category: string; status: string; error: string | null; elapsedMs: number;
  consequence: ConfirmedConsequence | null; semanticAssessment: "pending"; checks?: PedagogicalResult["checks"] };
export type AuditGame = { id: string; source: string; engine: string; engineName: string; engineHash: string; capturedAt: string;
  plies: number; complete: boolean; results: (ReviewResult | null)[]; verified: number[]; decisions: AuditDecision[] };
export type AuditDocument = { schema: 1; generatedAt: string; independentSemanticValidation: false; games: AuditGame[] };

/** Les instantanés sont des observations à relire, jamais des attentes de test.
 * Un repère d'une autre décision ne doit pas tromper cette relecture. */
export function auditReview(game: AuditGame, pgn: string) {
  const review = new GameReview(pgn);
  if (!game.complete || review.positions.length !== game.plies + 1 || game.results.length !== review.positions.length)
    throw new Error("Partie de contrôle incomplète ou d'une autre longueur.");
  review.results = structuredClone(game.results); review.verified = new Set(game.verified); review.state = "complete";
  for (const decision of game.decisions) {
    const before = review.positions[decision.index], after = review.positions[decision.index + 1];
    if (!before?.played || !after || review.annotations[decision.index]?.category !== decision.category)
      throw new Error("Verdict de contrôle d'un autre coup.");
    const steps = decision.consequence?.steps;
    if (!steps) continue;
    if (steps.length < 2 || steps.length > 9 || steps[0].command !== after.command || steps[0].fen !== after.fen)
      throw new Error("Le repère ne part pas après la décision.");
    const board = boardFromCommand(after.command);
    let command = after.command;
    for (const [index, step] of steps.entries()) {
      if (index) {
        const move = step.command.slice(command.length + 1);
        if (!step.command.startsWith(command + " ") || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error("Étape de contrôle sautée.");
        board.move(move);
      }
      if (board.fen() !== step.fen) throw new Error("Position de contrôle incohérente.");
      command = step.command;
    }
  }
  return review;
}
