import { Chess } from "chess.js";
import { materialBalance } from "../../material";
import { capturedSquare, uci, type DecisionContext, type PositionFrame } from "./context";

export type ExchangeContext = {
  scope: "consecutive-recaptures";
  role: "recapture" | "initial-capture" | "first-visible-capture";
  beginning: "known" | "unknown";
  from: number;
  to: number;
  moves: string[];
  totalBalance: number;
  balanceFromDecision: number;
  recaptureStillPossible: boolean;
  includesAnalysedContinuation: boolean;
};
/** Le bilan de l'épisode ne juge pas la décision. Une reprise peut récupérer du
 * matériel après une perte antérieure ; ce n'est pas un nouvel échange gagnant.
 * Les coups intermédiaires ne sont pas rattachés arbitrairement à cet épisode. */
export function exchangeContext(
  context: Pick<DecisionContext, "moves" | "decision" | "priorHistory"> & {
    frames: Pick<PositionFrame, "fen" | "terminal">[];
  },
): ExchangeContext | null {
  const { moves, decision, frames } = context;
  if (!moves[decision].captured) return null;
  const follows = (index: number) =>
    index > 0 &&
    !!moves[index - 1].captured &&
    capturedSquare(moves[index]) === moves[index - 1].to;
  let from = decision,
    to = decision;
  while (follows(from)) from--;
  while (to + 1 < moves.length && follows(to + 1)) to++;
  const beginning =
    from === 0 && context.priorHistory === "unknown" ? "unknown" : "known";
  const sign = moves[decision].color === "w" ? 1 : -1;
  const ending = new Chess(frames[to + 1].fen);
  return {
    scope: "consecutive-recaptures",
    role:
      from < decision
        ? "recapture"
        : beginning === "unknown"
          ? "first-visible-capture"
          : "initial-capture",
    beginning,
    from,
    to,
    moves: moves.slice(from, to + 1).map(uci),
    totalBalance:
      (materialBalance(ending) - materialBalance(new Chess(frames[from].fen))) *
      sign || 0,
    balanceFromDecision:
      (materialBalance(ending) -
        materialBalance(new Chess(frames[decision].fen))) *
      sign || 0,
    recaptureStillPossible:
      !frames[to + 1].terminal &&
      ending
        .moves({ verbose: true })
        .some((move) => capturedSquare(move) === moves[to].to),
    includesAnalysedContinuation: to > decision,
  };
}
