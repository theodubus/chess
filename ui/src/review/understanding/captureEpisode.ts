import { Chess } from "chess.js";
import { materialBalance } from "../../material";
import { uci, type DecisionContext } from "./context";
import { captureReplies } from "./witness";

/** Bilan du premier épisode de capture, séparé de la suite totale. Une capture
 * compensatrice choisie à la place d'une reprise en fait partie ; une perte
 * ultérieure d'une autre pièce ne rend pas cet épisode perdant rétroactivement. */
export function captureEpisode(context: DecisionContext) {
  const frames = context.frames.slice(context.decision + 1), moves = context.moves.slice(context.decision + 1);
  if (!moves[0]?.captured) return null;
  const replies = captureReplies({ frames, moves });
  let outsideCapture = false;
  let cursor = 0, end = 0, ending: "exchange-ended" | "recapture-not-chosen" | "pending-recapture" | "pending-check" = "exchange-ended";
  while (cursor < moves.length) {
    const reply = replies.find(r => r.capturePly === cursor)!;
    if (reply.resolvedAt === null) { end = moves.length; ending = "pending-recapture"; break; }
    end = reply.resolvedAt + 1;
    // L'adversaire peut renoncer à reprendre pour prendre une autre pièce.
    // Cette nouvelle perte n'appartient pas à la cible du premier échange,
    // même si la contre-prise donne échec. La compensation du camp étudié,
    // elle, reste dans son bilan : l'omettre inventerait une perte nette.
    const nextLoss = moves.findIndex((move, index) => index > cursor && index < end &&
      move.color !== context.before.turn && !!move.captured &&
      !(reply.state === "recaptured" && index === reply.resolvedAt));
    if (nextLoss >= 0) {
      end = nextLoss; outsideCapture = true; ending = "recapture-not-chosen"; break;
    }
    if (reply.state === "recaptured") { cursor = reply.resolvedAt; continue; }
    if (reply.state === "not-chosen") ending = "recapture-not-chosen";
    break;
  }
  while (!outsideCapture && end < moves.length && new Chess(frames[end].fen).isCheck()) end++;
  if (new Chess(frames[end].fen).isCheck()) ending = "pending-check";
  const sign = context.before.turn === "w" ? 1 : -1;
  const balanceSinceDecision = (materialBalance(new Chess(frames[end].fen)) - materialBalance(new Chess(context.before.fen))) * sign || 0;
  return { scope: "first-capture-episode" as const, complete: !["pending-recapture", "pending-check"].includes(ending), ending,
    moves: moves.slice(0, end).map(uci), balanceSinceDecision, command: frames[end].command, fen: frames[end].fen };
}
