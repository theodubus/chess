import { boardFromCommand } from "../StudyTree";
import type { Square } from "chess.js";
import { capturedSquare, opposite, uci, type DecisionContext } from "./context";
import { tacticalFrameWork, type Pin } from "./constraints";
import { captureRelationsWork, type CaptureRelation } from "./relations";
import { finishWork, type Work } from "./work";

export type DivertedDefenceSeed = {
  exposedId: string; firstAttackerId: string; defenderId: string; victimId: string; secondAttackerId: string;
  firstCapture: string; recapture: string; secondCapture: string;
};
export type DivertedDefence = DivertedDefenceSeed & {
  kind: "recapture-diverts-defender";
  role: "allows-loss";
  status: "hypothesis";
  before: CaptureRelation;
  after: CaptureRelation;
  defenderFrom: Square;
  defenderTo: Square;
  /** Absent : reprise hors de portée. Présent : alignement conservé, mais
   * déplacer ce défenseur pour reprendre exposerait son roi à cet attaquant. */
  pin?: Pin;
  unverified: readonly ["engine-reply", "compensation", "total-balance", "quality"];
};
/** Amorçage peu coûteux : aucune phrase ni perte n'est déduite du simple motif
 * prise/reprise/prise. Les relations légales seront examinées séparément. */
export function divertedDefenceSeed(context: DecisionContext): DivertedDefenceSeed | null {
  const index = context.decision, [first, reply, second] = context.moves.slice(index + 1, index + 4),
    [root, captured, recaptured] = context.frames.slice(index + 1, index + 4), actor = context.before.turn;
  if (!first?.captured || !reply?.captured || !second?.captured || !root || !captured || !recaptured ||
    root.terminal || captured.terminal || recaptured.terminal || first.color === actor || reply.color !== actor || second.color === actor) return null;
  const exposed = root.pieces.find((p) => p.square === capturedSquare(first)),
    moved = root.pieces.find((p) => p.square === context.moves[index].to),
    firstAttacker = root.pieces.find((p) => p.square === first.from),
    defender = captured.pieces.find((p) => p.square === reply.from),
    victim = recaptured.pieces.find((p) => p.square === capturedSquare(second)),
    secondAttacker = recaptured.pieces.find((p) => p.square === second.from),
    taken = captured.pieces.find((p) => p.square === capturedSquare(reply));
  if (!exposed || exposed.id !== moved?.id || exposed.color !== actor || !firstAttacker || taken?.id !== firstAttacker.id ||
    !defender || !victim || victim.color !== actor || victim.id === exposed.id || !secondAttacker ||
    !root.pieces.some((p) => p.id === defender.id && p.square === defender.square) ||
    !root.pieces.some((p) => p.id === victim.id && p.square === victim.square) ||
    !root.pieces.some((p) => p.id === secondAttacker.id && p.square === secondAttacker.square)) return null;
  return { exposedId: exposed.id, firstAttackerId: firstAttacker.id, defenderId: defender.id, victimId: victim.id, secondAttackerId: secondAttacker.id,
    firstCapture: uci(first), recapture: uci(reply), secondCapture: uci(second) };
}
/** Deux prises par deux attaquants : la reprise de la première attire un
 * défenseur hors de la seconde. Cela décrit un changement observé, pas une
 * reprise forcée, un échange gagnant ou l'unique cause du verdict. */
export function* divertedDefenceWork(context: DecisionContext): Work<DivertedDefence | null> {
  yield "relations";
  const seed = divertedDefenceSeed(context);
  if (!seed) return null;
  const enemy = opposite(context.before.turn), old = yield* captureRelationsWork(context.before, enemy);
  // Pas de trait inventé pendant un échec. Une exposition déjà présente face
  // au même attaquant n'est pas attribuée au déplacement du coup examiné.
  if (old.status !== "available" || old.captures.some((c) => c.attackerId === seed.firstAttackerId && c.victimId === seed.exposedId)) return null;
  const initial = yield* captureRelationsWork(context.after, enemy), frame = context.frames[context.decision + 3],
    current = yield* captureRelationsWork(frame, enemy),
    before = initial.captures.find((c) => c.move === seed.secondCapture && c.attackerId === seed.secondAttackerId && c.victimId === seed.victimId),
    after = current.captures.find((c) => c.move === seed.secondCapture && c.attackerId === seed.secondAttackerId && c.victimId === seed.victimId),
    defender = context.after.pieces.find((p) => p.id === seed.defenderId)!, moved = frame.pieces.find((p) => p.id === seed.defenderId),
    victim = frame.pieces.find((p) => p.id === seed.victimId)!;
  if (!before || !after || !moved || moved.square === defender.square ||
    !before.recaptures.some((r) => r.defenderId === seed.defenderId) || after.recaptures.some((r) => r.defenderId === seed.defenderId) ||
    after.balanceAfterBestRecapture <= before.balanceAfterBestRecapture) return null;
  let pin: Pin | undefined;
  if (boardFromCommand(frame.command).attackers(victim.square, context.before.turn).includes(moved.square)) {
    const taken = context.frames[context.decision + 4], constraints = yield* tacticalFrameWork(taken);
    pin = constraints.pins.find((p) => p.kind === "absolute" && p.shield.id === moved.id && p.rear.color === context.before.turn);
    if (!pin) return null;
    // Un alignement ne suffit pas : la reprise géométrique doit réellement
    // découvrir l'attaque de ce même adversaire sur le roi, après la seconde prise.
    const probe = boardFromCommand(taken.command);
    probe.remove(moved.square); probe.remove(victim.square);
    probe.put({ type: moved.type, color: moved.color }, victim.square);
    if (!probe.attackers(pin.rear.square, enemy).includes(pin.attacker.square)) return null;
  }
  return { ...seed, kind: "recapture-diverts-defender", role: "allows-loss", status: "hypothesis", before, after,
    defenderFrom: defender.square, defenderTo: moved.square, ...(pin ? { pin } : {}), unverified: ["engine-reply", "compensation", "total-balance", "quality"] };
}
export const divertedDefence = (context: DecisionContext) => finishWork(divertedDefenceWork(context));
