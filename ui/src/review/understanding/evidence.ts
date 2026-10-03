import { Chess, type Move, type Square } from "chess.js";
import { materialBalance } from "../../material";
import { usableResult } from "../FocusedAnalysis";
import { boardFromCommand } from "../StudyTree";
import type { ReviewPosition, ReviewResult } from "../model";
import { capturedSquare, uci, type PositionFrame } from "./context";
import type { RestrictionHypothesis, Understanding } from "./prototype";

export function framePosition(frame: PositionFrame): ReviewPosition {
  const board = boardFromCommand(frame.command);
  return {
    ...frame,
    label: "Vérification",
    played: null,
    playedSan: null,
    terminal: board.isCheckmate()
      ? { kind: "mate", value: 0, winner: board.turn() === "w" ? "b" : "w" }
      : board.isDraw()
        ? { kind: "cp", value: 0 }
        : null,
  };
}
export type DefenceEvidence = {
  outcome:
    | "loss-in-line"
    | "preserved"
    | "mate-for-victim"
    | "compensated"
    | "unresolved";
  moves: string[];
  materialDelta: number;
  victimSquare: Square | null;
  includesIntermediateCheck: boolean;
  /** Le témoin appartient à cette seule variante, jamais à toutes les défenses. */
  scope: "engine-line";
};

/** S'arrêter dès le mécanisme visible, sans aller chercher une prise éloignée
 * dans la PV. Une reprise disponible ou un échec non résolu garde le témoin ouvert. */
export function defenceEvidence(
  understanding: Pick<Understanding, "context">,
  hypothesis: Pick<RestrictionHypothesis, "victimId" | "threatPly">,
  result: ReviewResult,
  maxPlies = 8,
): DefenceEvidence {
  const before = understanding.context.frames[hypothesis.threatPly],
    frame = understanding.context.frames[hypothesis.threatPly + 1],
    victim = frame.pieces.find((piece) => piece.id === hypothesis.victimId);
  if (!victim || frame.turn !== victim.color)
    throw new Error("La vérification doit rendre le trait au camp menacé.");
  return pieceEvidence(before, frame, hypothesis.victimId, result, maxPlies);
}

/** Le bilan inclut la capture préventive, pas seulement sa reprise.
 * L'adversaire choisit librement sa réponse après l'alternative. */
export function preventionEvidence(
  context: Pick<Understanding["context"], "before" | "after">,
  victimId: string,
  result: ReviewResult,
): DefenceEvidence {
  return pieceEvidence(context.before, context.after, victimId, result, 8);
}

function pieceEvidence(
  before: PositionFrame,
  frame: PositionFrame,
  victimId: string,
  result: ReviewResult,
  maxPlies: number,
): DefenceEvidence {
  if (!Number.isInteger(maxPlies) || maxPlies < 1 || maxPlies > 8)
    throw new Error("Témoin limité à huit demi-coups.");
  const victim = frame.pieces.find((piece) => piece.id === victimId);
  if (!victim) throw new Error("Victime absente de la branche.");
  if (!usableResult(framePosition(frame), result))
    throw new Error("Réponse moteur inutilisable pour cette position.");
  const board = boardFromCommand(frame.command),
    sign = victim.color === "w" ? 1 : -1,
    initial = materialBalance(new Chess(before.fen));
  let square: Square | null = victim.square;
  let lastCapture: Move | undefined;
  let quietPlies = 0;
  const evidence: DefenceEvidence = {
    outcome: "unresolved",
    moves: [],
    materialDelta: 0,
    victimSquare: square,
    includesIntermediateCheck: false,
    scope: "engine-line",
  };
  const capturable = () =>
    square !== null &&
    board
      .moves({ verbose: true })
      .some((move) => capturedSquare(move) === square);
  const settled = () =>
    !board.isCheck() &&
    (!lastCapture ||
      !board
        .moves({ verbose: true })
        .some((move) => capturedSquare(move) === lastCapture!.to));
  for (const [index, item] of result.variation.slice(0, maxPlies).entries()) {
    if (board.isGameOver()) break;
    const move = board
      .moves({ verbose: true })
      .find(
        (m) => m.from === item.from && m.to === item.to && m.after === item.fen,
      )!;
    if (!move) throw new Error("Variante de défense incohérente.");
    const movedVictim = move.from === square;
    if (capturedSquare(move) === square) square = null;
    else if (move.from === square) square = move.to;
    board.move(move);
    if (!move.captured && !board.isCheck()) quietPlies++;
    evidence.moves.push(uci(move));
    evidence.victimSquare = square;
    evidence.materialDelta = (materialBalance(board) - initial) * sign;
    if (move.color === victim.color && board.isCheck() && !movedVictim)
      evidence.includesIntermediateCheck = true;
    lastCapture = move.captured ? move : undefined;
    if (board.isCheckmate() && move.color === victim.color) {
      evidence.outcome = "mate-for-victim";
      break;
    }
    // Un témoin de sauvetage doit laisser le trait à l'adversaire : l'absence
    // de capture pendant le tour du défenseur ne dit rien de sa sécurité.
    if (
      square &&
      board.turn() !== victim.color &&
      !board.isCheck() &&
      !capturable() &&
      evidence.materialDelta >= 0 &&
      settled()
    ) {
      evidence.outcome = "preserved";
      break;
    }
    if (quietPlies > 1) break;
    if (!square && settled()) {
      // Une capture ne doit pas cacher le mat ou la récupération matérielle
      // au coup suivant. Continuer la séquence forcée ; au-delà de la borne,
      // rester indéterminé plutôt que publier la moitié d'une combinaison.
      const next = result.variation[index + 1];
      const continuation =
        next &&
        board
          .moves({ verbose: true })
          .find(
            (m) =>
              m.from === next.from && m.to === next.to && m.after === next.fen,
          );
      if (
        continuation &&
        (continuation.captured ||
          continuation.promotion ||
          /[+#]/.test(continuation.san))
      )
        continue;
      evidence.outcome =
        evidence.materialDelta < 0 ? "loss-in-line" : "compensated";
      break;
    }
  }
  return evidence;
}
