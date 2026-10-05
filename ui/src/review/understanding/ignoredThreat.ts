import { opposite, type DecisionContext } from "./context";
import type { RelationChanges } from "./relations";

export type IgnoredThreat = {
  kind: "ignored-threat";
  status: "hypothesis";
  attackerId: string;
  victimId: string;
  capture: string;
  beforeScope: "geometric-turn-probe";
  afterScope: "actual-turn";
};
/** Une menace restée identique n'est ni une attaque créée par le coup, ni un
 * défenseur retiré. Sa perte et l'existence d'une défense restent à vérifier. */
export function ignoredThreat({ context, relations }: { context: DecisionContext; relations: RelationChanges }): IgnoredThreat | null {
  const enemy = opposite(context.before.turn), old = relations.before[enemy], next = relations.after[enemy];
  if (old.status !== "available" || next.status !== "available" || old.scope !== "geometric-turn-probe" || next.scope !== "actual-turn") return null;
  const reply = context.moves[context.decision + 1];
  if (!reply?.captured) return null;
  const capture = next.captures.find(c => c.move === reply.lan), previous = old.captures.find(c => c.move === reply.lan);
  if (!capture || !previous || capture.attackerId !== previous.attackerId || capture.victimId !== previous.victimId) return null;
  if (![capture.attackerId, capture.victimId].every(id => {
    const a = context.before.pieces.find(p => p.id === id), b = context.after.pieces.find(p => p.id === id);
    return a && b && a.type === b.type && a.square === b.square;
  })) return null;
  const recaptures = (c: typeof capture) => c.recaptures.map(r => `${r.defenderId}:${r.move}`).sort().join("|");
  if (recaptures(capture) !== recaptures(previous) || capture.balanceAfterBestRecapture !== previous.balanceAfterBestRecapture) return null;
  return { kind: "ignored-threat", status: "hypothesis", attackerId: capture.attackerId, victimId: capture.victimId, capture: capture.move,
    beforeScope: "geometric-turn-probe", afterScope: "actual-turn" };
}
