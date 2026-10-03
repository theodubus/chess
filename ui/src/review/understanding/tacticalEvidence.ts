import { Chess } from "chess.js";
import { materialBalance } from "../../material";
import { boardFromCommand } from "../StudyTree";
import type { ReviewResult } from "../model";
import { capturedSquare, uci, type PositionFrame } from "./context";
import { captureReplies, witnessLine, type CaptureReply } from "./witness";

export type TargetCapture = {
  ply: number;
  move: string;
  targetId: string;
  attackerId: string;
};
export type GroupEvidence = {
  outcome: "loss-in-line" | "compensated" | "preserved" | "mate" | "unresolved";
  winner: "w" | "b" | null;
  moves: string[];
  captured: TargetCapture[];
  surviving: string[];
  materialDelta: number;
  replies: CaptureReply[];
  ending: "settled" | "preserved" | "pending-recapture" | "quiet-limit" | "ply-limit" | "continuation-missing" | "mate" | "draw";
  scope: "bounded-engine-line";
};

/** Une seule preuve pour les deux cibles : sauver la dame ne suffit pas si le
 * cavalier reste attaqué. Tout le matériel du camp est compté, compensations
 * comprises ; aucune reprise isolée n'est déclarée gagnante. */
export function groupEvidence(
  before: PositionFrame,
  frame: PositionFrame,
  targetIds: string[],
  result: Pick<ReviewResult, "variation">,
  setupPlies = 0,
): GroupEvidence {
  if (![0, 1].includes(setupPlies)) throw new Error("Préfixe de menace trop long.");
  const targets = targetIds.map((id) => frame.pieces.find((p) => p.id === id));
  if (!targets.length || targets.some((p) => !p) ||
      targets.some((p) => p!.color !== targets[0]!.color))
    throw new Error("Groupe de cibles incohérent.");
  const side = targets[0]!.color, sign = side === "w" ? 1 : -1;
  const initial = materialBalance(new Chess(before.fen));
  const line = witnessLine(frame, result.variation);
  const replies = captureReplies(line);
  const board = boardFromCommand(frame.command);
  const evidence: GroupEvidence = {
    outcome: "unresolved", winner: null, moves: [], captured: [],
    surviving: [...targetIds], materialDelta: 0, replies: [],
    ending: result.variation.length > 8 ? "ply-limit" : "continuation-missing",
    scope: "bounded-engine-line",
  };
  let quiet = 0;
  for (const [index, move] of line.moves.entries()) {
    const previous = line.frames[index], current = line.frames[index + 1];
    const captured = previous.pieces.find((p) => p.square === capturedSquare(move));
    if (captured && targetIds.includes(captured.id)) {
      evidence.captured.push({
        ply: index, move: uci(move), targetId: captured.id,
        attackerId: previous.pieces.find((p) => p.square === move.from)!.id,
      });
    }
    board.move(move);
    evidence.moves.push(uci(move));
    evidence.surviving = targetIds.filter((id) => current.pieces.some((p) => p.id === id));
    evidence.materialDelta = (materialBalance(board) - initial) * sign || 0;
    quiet = index < setupPlies || move.captured || move.promotion || board.isCheck() ? 0 : quiet + 1;
    if (board.isCheckmate()) {
      evidence.outcome = "mate";
      evidence.winner = move.color;
      evidence.ending = "mate";
      break;
    }
    if (board.isDraw()) { evidence.ending = "draw"; break; }
    const settled = !board.isCheck() && replies.filter((r) => r.capturePly <= index)
      .every((r) => r.resolvedAt !== null && r.resolvedAt <= index);
    if (!evidence.captured.length && board.turn() !== side && settled && evidence.materialDelta >= 0) {
      const captures = board.moves({ verbose: true }).filter((m) => m.captured);
      const capturable = evidence.surviving.some((id) => {
        const piece = current.pieces.find((p) => p.id === id)!;
        return piece.type !== "k" && captures.some((m) => capturedSquare(m) === piece.square);
      });
      if (!capturable) {
        evidence.outcome = "preserved"; evidence.ending = "preserved"; break;
      }
    }
    if (evidence.captured.length && settled) {
      const next = line.moves[index + 1];
      // Ne pas masquer la compensation immédiate, même sur une autre pièce.
      if (next && (next.captured || next.promotion || /[+#]/.test(next.san))) continue;
      evidence.outcome = evidence.materialDelta < 0 ? "loss-in-line" : "compensated";
      evidence.ending = "settled";
      break;
    }
    if (quiet > 1) { evidence.ending = "quiet-limit"; break; }
  }
  evidence.replies = replies.filter((r) => r.capturePly < evidence.moves.length).map((r) => {
    const within = r.resolvedAt !== null && r.resolvedAt < evidence.moves.length;
    return {
      ...r, state: within ? r.state : "pending", resolvedAt: within ? r.resolvedAt : null,
      choice: within ? r.choice : null,
      intermediateChecks: r.intermediateChecks.filter((c) => c.ply < evidence.moves.length),
    };
  });
  if (evidence.outcome === "unresolved" && evidence.replies.some((r) => r.state === "pending") &&
      !["mate", "draw", "quiet-limit"].includes(evidence.ending))
    evidence.ending = "pending-recapture";
  return evidence;
}

/** Le bilan du premier échange est séparé du bilan du témoin entier. Une
 * seconde prise ailleurs ne transforme pas cet échange égal en échange gagnant. */
export function targetExchange(
  frame: PositionFrame,
  result: Pick<ReviewResult, "variation">,
  capture: TargetCapture,
  observedPlies: number,
) {
  const line = witnessLine(frame, result.variation);
  const replies = captureReplies(line);
  let last = capture.ply;
  while (true) {
    const reply = replies.find((r) => r.capturePly === last);
    if (!reply || reply.resolvedAt === null || reply.resolvedAt >= observedPlies)
      return { complete: false, from: capture.ply, to: last, balance: null };
    if (reply.state !== "recaptured") break;
    last = reply.resolvedAt;
  }
  const side = line.frames[capture.ply].pieces.find((p) => p.id === capture.targetId)!.color;
  return {
    complete: true, from: capture.ply, to: last,
    balance: (materialBalance(new Chess(line.frames[last + 1].fen)) -
      materialBalance(new Chess(line.frames[capture.ply].fen))) * (side === "w" ? 1 : -1),
  };
}
