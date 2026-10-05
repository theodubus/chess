import { Chess } from "chess.js";
import { materialBalance } from "../../material";
import { boardFromCommand } from "../StudyTree";
import { legalVariation } from "../model";
import { capturedSquare, type PositionFrame } from "./context";
import type { DefenceEvidence } from "./evidence";
import { captureReplies, witnessLine } from "./witness";

export type CaptureIllustration = {
  moves: string[];
  omittedMoves: string[];
  materialDelta: number;
  proofMaterialDelta: number;
};
/** La preuve peut suivre une autre perte après l'échange expliqué. Le repère
 * garde un préfixe légal, mais ne doit jamais cacher un gain compensateur,
 * une promotion, un échec ou une décision de reprise encore ouverte. */
export function captureIllustration(
  context: { before: PositionFrame; after: PositionFrame },
  victimId: string,
  evidence: Pick<DefenceEvidence, "moves" | "materialDelta" | "outcome">,
): CaptureIllustration {
  const line = witnessLine(
    context.after,
    legalVariation(context.after.fen, evidence.moves),
  );
  if (line.moves.length !== evidence.moves.length)
    throw new Error("Témoin d'illustration au-delà de la fin de partie.");
  const victim = context.after.pieces.find((p) => p.id === victimId);
  if (!victim) throw new Error("Victime absente du repère.");
  const capturedAt = line.moves.findIndex(
    (move, index) =>
      line.frames[index].pieces.find((p) => p.square === capturedSquare(move))
        ?.id === victimId,
  );
  let end = line.moves.length;
  if (capturedAt >= 0 && evidence.outcome === "loss-in-line") {
    const replies = captureReplies(line);
    let cursor = capturedAt;
    while (cursor < line.moves.length) {
      const reply = replies.find((r) => r.capturePly === cursor)!;
      if (reply.resolvedAt === null) break;
      end = reply.resolvedAt + 1;
      if (reply.state !== "recaptured") break;
      cursor = reply.resolvedAt;
    }
    // Une capture qui fait échec exige aussi la réponse légale. Les reprises
    // différées par un échec sont déjà incluses par la chaîne ci-dessus.
    while (end < line.moves.length && new Chess(line.frames[end].fen).isCheck())
      end++;
    const compensation = line.moves
      .slice(end)
      .some(
        (move) =>
          (move.color === victim.color && !!move.captured) ||
          !!move.promotion ||
          new Chess(move.after).isCheck(),
      );
    if (
      compensation ||
      new Chess(line.frames[end].fen).isCheck() ||
      replies.some(
        (r) =>
          r.capturePly < end && (r.resolvedAt === null || r.resolvedAt >= end),
      )
    )
      end = line.moves.length;
  }
  const sign = victim.color === "w" ? 1 : -1;
  const initial = materialBalance(new Chess(context.before.fen));
  const fullDelta =
    (materialBalance(boardFromCommand(line.frames.at(-1)!.command)) - initial) *
    sign;
  if (fullDelta !== evidence.materialDelta)
    throw new Error("Bilan du repère différent du témoin vérifié.");
  const materialDelta =
    (materialBalance(boardFromCommand(line.frames[end].command)) - initial) *
    sign;
  // Ne pas présenter une perte si le préfixe retenu ne la montre pas encore.
  if (end < line.moves.length && materialDelta >= 0) end = line.moves.length;
  return {
    moves: evidence.moves.slice(0, end),
    omittedMoves: evidence.moves.slice(end),
    materialDelta: end === line.moves.length ? fullDelta : materialDelta,
    proofMaterialDelta: fullDelta,
  };
}
