import { Chess, type Color, type Move, type Square } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import {
  capturedSquare,
  uci,
  type DecisionContext,
  type PositionFrame,
  type TrackedPiece,
} from "./context";
import { boardFor, sliderRay } from "./possibilities";
import { finishWork, type Work } from "./work";

type Scope = "actual-turn" | "geometric-turn-probe";
export type AttackTarget = {
  piece: TrackedPiece;
  /** Le roi est en échec, jamais une cible de capture. null : sonde impossible. */
  captures: string[] | null;
  check: boolean;
};
export type DoubleAttack = {
  attacker: TrackedPiece;
  targets: AttackTarget[];
  scope: Scope;
};
export type Pin = {
  kind: "absolute" | "relative-alignment";
  attacker: TrackedPiece;
  shield: TrackedPiece;
  rear: TrackedPiece;
  ray: Square[];
  /** Un alignement avec une dame ne rend pas le déplacement illégal. */
  legalMoves: string[] | null;
  scope: Scope;
};
export type MateMove = {
  attackerId: string;
  kingId: string;
  move: string;
  scope: Scope;
};
export type TacticalFrame = {
  frame: PositionFrame;
  doubleAttacks: DoubleAttack[];
  pins: Pin[];
  mates: MateMove[];
  unavailable: Color[];
};

const value = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity };
/** Inventaire peu profond : captures légales une fois par camp. Aucune reprise,
 * aucun score et aucune affirmation de gain forcé par une double attaque. */
export function tacticalFrame(frame: PositionFrame): TacticalFrame {
  return finishWork(tacticalFrameWork(frame));
}
export function* tacticalFrameWork(frame: PositionFrame): Work<TacticalFrame> {
  const result: TacticalFrame = {
    frame,
    doubleAttacks: [],
    pins: [],
    mates: [],
    unavailable: [],
  };
  if (frame.terminal) return result;
  // La légalité et le mat dépendent de ce plateau ; l'état terminal historique
  // a déjà été conservé dans frame. La preuve de réponses garde l'historique.
  const board = new Chess(frame.fen);
  const legal = new Map<Color, Move[] | null>();
  for (const side of ["w", "b"] as const) {
    yield "tactics";
    const probe = frame.turn === side ? board : boardFor(frame, side);
    const moves = probe?.moves({ verbose: true }) ?? null;
    legal.set(side, moves);
    if (!moves) result.unavailable.push(side);
    for (const move of moves ?? []) {
      if (!move.san.endsWith("#")) continue;
      // Le suffixe de chess.js est confirmé dans le contexte réel, y compris
      // les nulles historiques ; une sonde conserve sa portée conditionnelle.
      probe!.move(move);
      const mate = probe!.isCheckmate();
      probe!.undo();
      if (!mate) continue;
      result.mates.push({
        attackerId: frame.pieces.find((p) => p.square === move.from)!.id,
        kingId: frame.pieces.find((p) => p.color !== side && p.type === "k")!.id,
        move: uci(move),
        scope: side === frame.turn ? "actual-turn" : "geometric-turn-probe",
      });
    }
  }
  for (const attacker of frame.pieces) {
    yield "tactics";
    const moves = legal.get(attacker.color)!;
    const targets = frame.pieces
      .filter(
        (p) =>
          p.color !== attacker.color &&
          board.attackers(p.square, attacker.color).includes(attacker.square),
      )
      .map((piece): AttackTarget => ({
        piece,
        captures:
          piece.type === "k"
            ? []
            : moves
                ?.filter(
                  (m) =>
                    m.from === attacker.square &&
                    capturedSquare(m) === piece.square,
                )
                .map(uci) ?? null,
        check: piece.type === "k" && frame.turn === piece.color && board.isCheck(),
      }));
    if (targets.length >= 2)
      result.doubleAttacks.push({
        attacker,
        targets,
        scope: attacker.color === frame.turn ? "actual-turn" : "geometric-turn-probe",
      });
    if (!"brq".includes(attacker.type)) continue;
    for (const rear of frame.pieces) {
      if (
        rear.color === attacker.color ||
        !"krq".includes(rear.type)
      ) continue;
      const ray = sliderRay(attacker.type, attacker.square, rear.square);
      if (!ray.length) continue;
      const obstacles = ray.slice(0, -1)
        .flatMap((square) => frame.pieces.filter((p) => p.square === square));
      if (obstacles.length !== 1) continue;
      const shield = obstacles[0];
      if (shield.color !== rear.color || shield.type === "k") continue;
      if (rear.type !== "k" && value[rear.type] <= value[shield.type]) continue;
      result.pins.push({
        kind: rear.type === "k" ? "absolute" : "relative-alignment",
        attacker,
        shield,
        rear,
        ray,
        legalMoves: legal.get(shield.color)
          ?.filter((m) => m.from === shield.square).map(uci) ?? null,
        scope: shield.color === frame.turn ? "actual-turn" : "geometric-turn-probe",
      });
    }
  }
  return result;
}

export type ShortMateProof = {
  status: "proved" | "refuted" | "unavailable" | "budget-exhausted";
  scope: "all-legal-replies-mate-in-one";
  replies: { move: string; command: string; mates: string[] }[];
  counterexample: string | null;
  examinedMoves: number;
};
/** Preuve de règles bornée à réponse + mat : pas une recherche stratégique.
 * Chaque défense réelle doit permettre un mat immédiat. Une seule échappatoire,
 * une nulle ou le plafond suffisent à interdire la conclusion universelle. */
export function shortMateProof(frame: PositionFrame, maxMoves = 1200): ShortMateProof {
  return finishWork(shortMateProofWork(frame, maxMoves));
}
function* shortMateProofWork(frame: PositionFrame, maxMoves = 1200): Work<ShortMateProof> {
  if (!Number.isInteger(maxMoves) || maxMoves < 1)
    throw new Error("Plafond de coups invalide.");
  const proof: ShortMateProof = {
    status: "unavailable",
    scope: "all-legal-replies-mate-in-one",
    replies: [],
    counterexample: null,
    examinedMoves: 0,
  };
  if (frame.terminal) return proof;
  const board = boardFromCommand(frame.command);
  if (board.isGameOver()) return proof;
  const defences = board.moves({ verbose: true });
  for (const reply of defences) {
    yield "mate";
    if (proof.examinedMoves >= maxMoves) {
      proof.status = "budget-exhausted";
      return proof;
    }
    proof.examinedMoves++;
    board.move(reply);
    const answers = board.isGameOver() ? [] : board.moves({ verbose: true });
    if (proof.examinedMoves + answers.length > maxMoves) {
      board.undo();
      proof.status = "budget-exhausted";
      return proof;
    }
    proof.examinedMoves += answers.length;
    const mates = answers.filter((m) => m.san.endsWith("#")).map(uci);
    board.undo();
    proof.replies.push({
      move: uci(reply),
      command: frame.command + (frame.command.includes(" moves ") ? " " : " moves ") + uci(reply),
      mates,
    });
    if (!mates.length) {
      proof.status = "refuted";
      proof.counterexample = uci(reply);
      return proof;
    }
  }
  if (defences.length) proof.status = "proved";
  return proof;
}

type Role = "allows-loss" | "creates-opportunity";
export type TacticalHypothesis = {
  kind: "double-threat" | "pin" | "mate-threat" | "deflection-mate";
  status: "hypothesis";
  role: Role;
  threatPly: number;
  attackerId: string;
  targetIds: string[];
  fact: DoubleAttack | Pin | MateMove | {
    proof: ShortMateProof;
    blockerId: string;
    ray: Square[];
    mate: string;
  };
  unverified: readonly ["best-defence", "compensation", "alternative", "causal-contribution"];
};
export type TacticalConstraints = {
  before: TacticalFrame;
  after: TacticalFrame;
  reply: TacticalFrame | null;
  hypotheses: TacticalHypothesis[];
  shortMate: ShortMateProof | null;
};
const unverified = ["best-defence", "compensation", "alternative", "causal-contribution"] as const;
const mateKey = (mate: MateMove) => `${mate.attackerId}/${mate.kingId}/${mate.move.slice(2)}`;
const pinKey = (pin: Pin) => `${pin.kind}/${pin.attacker.id}/${pin.shield.id}/${pin.rear.id}`;

export function tacticalConstraints(context: DecisionContext): TacticalConstraints {
  return finishWork(tacticalConstraintsWork(context));
}
export function* tacticalConstraintsWork(context: DecisionContext): Work<TacticalConstraints> {
  const before = yield* tacticalFrameWork(context.before), after = yield* tacticalFrameWork(context.after);
  const replyFrame = context.frames[context.decision + 2];
  const reply = replyFrame ? yield* tacticalFrameWork(replyFrame) : null;
  const hypotheses: TacticalHypothesis[] = [];
  const actor = context.before.turn;
  for (const [old, next, ply] of [
    [before, after, context.decision],
    [after, reply, context.decision + 1],
  ] as const) {
    if (!next || next.frame.terminal) continue;
    const mover = context.moves[ply].color;
    const role: Role = mover === actor ? "creates-opportunity" : "allows-loss";
    for (const attack of next.doubleAttacks) {
      if (attack.attacker.color !== mover) continue;
      if (attack.targets.some((t) => t.captures === null) && !attack.targets.some((t) => t.check)) continue;
      // Ce premier lot vise deux pièces au moins mineures, ou échec + pièce.
      // Les attaques de plusieurs pions restent des faits, sans candidat de gain.
      const actionable = attack.targets.filter((t) =>
        value[t.piece.type] >= 3 && (t.check || t.captures === null || t.captures.length));
      if (actionable.length < 2) continue;
      const previous = old.doubleAttacks.find((a) => a.attacker.id === attack.attacker.id);
      if (actionable.every((t) => previous?.targets.some((p) => p.piece.id === t.piece.id))) continue;
      hypotheses.push({
        kind: "double-threat", status: "hypothesis", role, threatPly: ply,
        attackerId: attack.attacker.id,
        targetIds: actionable.map((t) => t.piece.id).sort(), fact: attack, unverified,
      });
    }
    for (const pin of next.pins) {
      if (pin.kind !== "absolute" || pin.attacker.color !== mover ||
          old.pins.some((p) => pinKey(p) === pinKey(pin))) continue;
      hypotheses.push({
        kind: "pin", status: "hypothesis", role, threatPly: ply,
        attackerId: pin.attacker.id, targetIds: [pin.shield.id, pin.rear.id].sort(),
        fact: pin, unverified,
      });
    }
    for (const mate of next.mates) {
      const side = next.frame.pieces.find((p) => p.id === mate.attackerId)!.color;
      if (old.mates.some((m) => mateKey(m) === mateKey(mate))) continue;
      // Une nouvelle menace adverse immédiate peut aussi venir du coup étudié
      // (défense retirée), sans attendre une réponse jouée dans le PGN.
      hypotheses.push({
        kind: "mate-threat", status: "hypothesis",
        role: side === actor ? "creates-opportunity" : "allows-loss", threatPly: ply,
        attackerId: mate.attackerId, targetIds: [mate.kingId], fact: mate, unverified,
      });
    }
  }
  const checking = new Chess(context.after.fen).isCheck();
  const shortMate = !context.after.terminal && (checking || after.mates.some((m) =>
    context.after.pieces.find((p) => p.id === m.attackerId)!.color === actor))
    ? yield* shortMateProofWork(context.after) : null;
  // Déviation courte : réponse unique prenant la pièce sacrifiée, qui quitte
  // exactement le trajet du coup de mat. Un sacrifice générique ne suffit pas.
  if (shortMate?.status === "proved" && shortMate.replies.length === 1) {
    const defence = shortMate.replies[0], board = boardFromCommand(context.after.command);
    const moved = context.moves[context.decision];
    const response = board.move(defence.move);
    const blocker = context.after.pieces.find((p) => p.square === response.from)!;
    if (capturedSquare(response) === moved.to && blocker.color !== actor) {
      for (const mate of defence.mates) {
        const attacker = context.after.pieces.find((p) => p.square === mate.slice(0, 2));
        if (!attacker || attacker.color !== actor) continue;
        const ray = sliderRay(attacker.type, attacker.square, mate.slice(2, 4) as Square);
        if (!ray.slice(0, -1).includes(blocker.square)) continue;
        const obstacles = context.after.pieces.filter((p) => ray.slice(0, -1).includes(p.square));
        if (obstacles.length !== 1) continue;
        hypotheses.push({
          kind: "deflection-mate", status: "hypothesis", role: "creates-opportunity",
          threatPly: context.decision, attackerId: attacker.id,
          targetIds: [blocker.id, context.after.pieces.find((p) => p.color !== actor && p.type === "k")!.id].sort(),
          fact: { proof: shortMate, blockerId: blocker.id, ray, mate }, unverified,
        });
      }
    }
  }
  return { before, after, reply, hypotheses, shortMate };
}
