import { capturedSquare, opposite, uci, type DecisionContext } from "./context";
import type { RelationChanges } from "./relations";

export type MovedPieceExposure = {
  kind: "moved-piece-exposure";
  status: "hypothesis";
  victimId: string;
  attackerId: string;
  capture: string;
  destination: string;
  scope: "actual-turn";
};
/** Une capture de la pièce déplacée ne prouve pas une perte : promotion,
 * prises précédentes, reprises et compensation demandent une vérification. */
export function movedPieceExposure({ context, relations }: { context: DecisionContext; relations: RelationChanges }): MovedPieceExposure | null {
  const played = context.moves[context.decision], reply = context.moves[context.decision + 1];
  if (!reply?.captured || capturedSquare(reply) !== played.to) return null;
  const victim = context.before.pieces.find(p => p.square === played.from), after = context.after.pieces.find(p => p.id === victim?.id);
  if (!victim || !after || after.square !== played.to || after.type === "k") return null;
  const captures = relations.after[opposite(context.before.turn)];
  if (captures.status !== "available" || captures.scope !== "actual-turn") return null;
  const fact = captures.captures.find(c => c.move === uci(reply) && c.victimId === victim.id);
  return fact ? { kind: "moved-piece-exposure", status: "hypothesis", victimId: victim.id, attackerId: fact.attackerId,
    capture: fact.move, destination: after.square, scope: "actual-turn" } : null;
}
