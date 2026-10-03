import { Chess, type Square } from "chess.js";
import { materialBalance } from "../../material";
import { usableResult } from "../FocusedAnalysis";
import { boardFromCommand } from "../StudyTree";
import {
  legalVariation,
  type ReviewPosition,
  type ReviewResult,
} from "../model";
import { capturedSquare, uci, type PositionFrame } from "./context";
import type { RestrictionHypothesis, Understanding } from "./prototype";
import { captureReplies, witnessLine, type CaptureReply } from "./witness";

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
/** Ne lire que le témoin court jusqu'à la première fin de partie. Certains
 * moteurs prolongent une PV légale au-delà d'une nulle que chess.js termine. */
export function boundedContinuation(
  frame: Pick<PositionFrame, "fen" | "command">,
  result: ReviewResult,
): ReviewResult {
  const board = boardFromCommand(frame.command);
  const variation: ReviewResult["variation"] = [];
  for (const item of result.variation.slice(0, 8)) {
    if (board.isGameOver()) break;
    const move = board
      .moves({ verbose: true })
      .find(
        (m) => m.from === item.from && m.to === item.to && m.after === item.fen,
      );
    if (!move) throw new Error("Variante bornée incohérente.");
    board.move(move);
    variation.push(item);
  }
  return { ...result, variation };
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
  replies: CaptureReply[];
  ending:
    | "continuation-missing"
    | "pending-recapture"
    | "check-unresolved"
    | "quiet-limit"
    | "ply-limit"
    | "exchange-ended"
    | "recapture-not-chosen"
    | "piece-preserved"
    | "mate"
    | "draw";
  /** Le témoin appartient à cette seule variante, jamais à toutes les défenses. */
  scope: "engine-line" | "conditional-engine-line";
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
  if (!usableResult(framePosition(frame), result))
    throw new Error("Réponse moteur inutilisable pour cette position.");
  return pieceEvidence(before, frame, hypothesis.victimId, result, maxPlies);
}

/** Le bilan inclut la capture préventive, pas seulement sa reprise.
 * L'adversaire choisit librement sa réponse après l'alternative. */
export function preventionEvidence(
  context: Pick<Understanding["context"], "before" | "after">,
  victimId: string,
  result: ReviewResult,
): DefenceEvidence {
  if (!usableResult(framePosition(context.after), result))
    throw new Error("Réponse moteur inutilisable pour cette position.");
  return pieceEvidence(context.before, context.after, victimId, result, 8);
}

/** La capture est une question conditionnelle légale, suivie de la réponse
 * libre du moteur. Ce témoin n'est jamais présenté comme sa PV depuis la décision. */
export function conditionalEvidence(
  context: Pick<Understanding["context"], "before" | "after">,
  victimId: string,
  prefix: string[],
  result: ReviewResult,
): DefenceEvidence {
  const board = boardFromCommand(context.after.command);
  for (const move of prefix) board.move(move);
  const command =
    context.after.command +
    (context.after.command.includes(" moves ") ? " " : " moves ") +
    prefix.join(" ");
  const position = {
    ...framePosition(context.after),
    command,
    fen: board.fen(),
    turn: board.turn(),
  };
  if (!usableResult(position, result))
    throw new Error(
      "Réponse moteur inutilisable pour la branche conditionnelle.",
    );
  const bounded = boundedContinuation(position, result);
  const moves: string[] = [];
  for (const item of bounded.variation.slice(
    0,
    Math.max(0, 8 - prefix.length),
  )) {
    const move = board
      .moves({ verbose: true })
      .find(
        (m) => m.from === item.from && m.to === item.to && m.after === item.fen,
      )!;
    if (!move) throw new Error("Variante conditionnelle incohérente.");
    board.move(move);
    moves.push(uci(move));
  }
  const variation = legalVariation(context.after.fen, [...prefix, ...moves]);
  return {
    ...pieceEvidence(context.before, context.after, victimId, { variation }, 8),
    scope: "conditional-engine-line",
  };
}

function pieceEvidence(
  before: PositionFrame,
  frame: PositionFrame,
  victimId: string,
  result: Pick<ReviewResult, "variation">,
  maxPlies: number,
): DefenceEvidence {
  const line = witnessLine(frame, result.variation, maxPlies),
    replies = captureReplies(line),
    victim = frame.pieces.find((piece) => piece.id === victimId);
  if (!victim) throw new Error("Victime absente de la branche.");
  const board = boardFromCommand(frame.command),
    sign = victim.color === "w" ? 1 : -1,
    initial = materialBalance(new Chess(before.fen));
  let square: Square | null = victim.square,
    quietPlies = 0;
  const evidence: DefenceEvidence = {
    outcome: "unresolved",
    moves: [],
    materialDelta: 0,
    victimSquare: square,
    includesIntermediateCheck: false,
    replies: [],
    ending:
      result.variation.length > maxPlies ? "ply-limit" : "continuation-missing",
    scope: "engine-line",
  };
  const capturable = () =>
    square !== null &&
    board
      .moves({ verbose: true })
      .some((move) => capturedSquare(move) === square);
  const settled = (index: number) =>
    !board.isCheck() &&
    replies
      .filter((reply) => reply.capturePly <= index)
      .every((reply) => reply.resolvedAt !== null && reply.resolvedAt <= index);
  for (const [index, move] of line.moves.entries()) {
    const movedVictim = move.from === square;
    if (capturedSquare(move) === square) square = null;
    else if (movedVictim) square = move.to;
    board.move(move);
    quietPlies =
      move.captured || move.promotion || board.isCheck() ? 0 : quietPlies + 1;
    evidence.moves.push(uci(move));
    evidence.victimSquare = square;
    evidence.materialDelta = (materialBalance(board) - initial) * sign;
    if (move.color === victim.color && board.isCheck() && !movedVictim)
      evidence.includesIntermediateCheck = true;
    if (board.isCheckmate()) {
      if (move.color === victim.color) evidence.outcome = "mate-for-victim";
      evidence.ending = "mate";
      break;
    }
    if (board.isDraw()) {
      evidence.ending = "draw";
      break;
    }
    // La sécurité se constate au tour adverse, avec le bilan depuis la décision.
    if (
      square &&
      board.turn() !== victim.color &&
      !capturable() &&
      evidence.materialDelta >= 0 &&
      settled(index)
    ) {
      evidence.outcome = "preserved";
      evidence.ending = "piece-preserved";
      break;
    }
    if (!square && settled(index)) {
      // Conserver la compensation tactique immédiate. La borne peut interrompre
      // ce suivi, y compris si le prochain coup forçant est juste hors témoin.
      const next = result.variation[index + 1];
      const continuation =
        next &&
        !board.isGameOver() &&
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
      evidence.ending = replies.some(
        (reply) => reply.state === "not-chosen" && reply.resolvedAt === index,
      )
        ? "recapture-not-chosen"
        : "exchange-ended";
      break;
    }
    if (quietPlies > 1) {
      evidence.ending = "quiet-limit";
      break;
    }
  }
  evidence.replies = replies
    .filter((reply) => reply.capturePly < evidence.moves.length)
    .map((reply) => {
      const within =
        reply.resolvedAt !== null && reply.resolvedAt < evidence.moves.length;
      return {
        ...reply,
        state: within ? reply.state : "pending",
        resolvedAt: within ? reply.resolvedAt : null,
        choice: within ? reply.choice : null,
        intermediateChecks: reply.intermediateChecks.filter(
          (check) => check.ply < evidence.moves.length,
        ),
      };
    });
  if (
    evidence.outcome === "unresolved" &&
    evidence.ending !== "draw" &&
    evidence.ending !== "mate" &&
    evidence.ending !== "quiet-limit"
  ) {
    if (board.isCheck()) evidence.ending = "check-unresolved";
    else if (evidence.replies.some((reply) => reply.state === "pending"))
      evidence.ending = "pending-recapture";
  }
  return evidence;
}
