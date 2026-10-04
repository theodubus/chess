import { Chess, type Square } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import { frenchSan } from "../model";
import { capturedSquare, decisionContext, opposite, uci, type DecisionContext, type PositionFrame } from "./context";
import { tacticalFrameWork, type DoubleAttack, type Pin, type TacticalFrame } from "./constraints";
import { framePosition } from "./evidence";
import { sliderRay } from "./possibilities";
import { extendBranch } from "./relationContrast";
import { groupEvidence, targetExchange } from "./tacticalEvidence";
import { finishWork, type Work } from "./work";

type Read = { kind: "piece-position" | "empty-square" | "checking-piece"; square: Square; pieceId: string; sourcePly: number | null };
export type TimelineMove = { ply: number; move: string; reads: Read[] };
type Motif = { kind: "double-threat" | "pin"; key: string; attackerId: string; targetIds: string[]; fact: DoubleAttack | Pin };
export type DelayedTactic = Motif & {
  ply: number;
  frame: PositionFrame;
  role: "allows-loss" | "creates-opportunity";
  preexisting: boolean;
  reads: Read[];
  /** Une dépendance de faits, pas encore une preuve de cause du verdict. */
  rootPath: number[] | null;
};
export type TacticalTimeline = {
  scope: "observations-only";
  moves: TimelineMove[];
  events: DelayedTactic[];
  threatHorizon: 6;
  witnessHorizon: 8;
};
const value = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity };
function motifs(facts: TacticalFrame): Motif[] {
  const attacks = facts.doubleAttacks.flatMap((fact): Motif[] => {
    const targets = fact.targets.filter(t => value[t.piece.type] >= 3 && (t.check || t.captures === null || t.captures.length));
    if (targets.length < 2) return [];
    const targetIds = targets.map(t => t.piece.id).sort();
    return [{ kind: "double-threat", key: `fork/${fact.attacker.id}/${targetIds.join("/")}`, attackerId: fact.attacker.id, targetIds, fact }];
  });
  return [...attacks, ...facts.pins.filter(p => p.kind === "absolute").map((fact): Motif => ({
    kind: "pin", key: `pin/${fact.attacker.id}/${fact.shield.id}/${fact.rear.id}`, attackerId: fact.attacker.id,
    targetIds: [fact.shield.id, fact.rear.id].sort(), fact,
  }))];
}
const unique = (reads: Read[]) => [...new Map(reads.map(r => [JSON.stringify(r), r])).values()];
function rootPath(reads: Read[], moves: TimelineMove[]): number[] | null {
  for (const read of reads) {
    if (read.sourcePly === null) continue;
    if (read.sourcePly === 0) return [0];
    const move = moves[read.sourcePly];
    const path = move && rootPath(move.reads, moves);
    if (path) return [...path, move.ply];
  }
  return null;
}

/** Le même inventaire tactique est lu dans plusieurs frames. Les dépendances
 * expliquent d'où viennent positions, cases libérées et réponses aux échecs ;
 * elles ne transforment pas une suite choisie en meilleure défense démontrée. */
export function tacticalTimeline(context: DecisionContext): TacticalTimeline {
  return finishWork(tacticalTimelineWork(context));
}
export function* tacticalTimelineWork(context: DecisionContext): Work<TacticalTimeline> {
  const timeline: TacticalTimeline = { scope: "observations-only", moves: [], events: [], threatHorizon: 6, witnessHorizon: 8 };
  const changed = new Map<string, number>(), vacated = new Map<Square, { pieceId: string; ply: number }>();
  const initial = motifs(yield* tacticalFrameWork(context.before));
  const preexisting = new Set(initial.map(f => f.key));
  let previous = new Set(preexisting);
  const pieceRead = (frame: PositionFrame, pieceId: string, kind: Read["kind"] = "piece-position"): Read => ({
    kind, pieceId, square: frame.pieces.find(p => p.id === pieceId)!.square, sourcePly: changed.get(pieceId) ?? null,
  });
  const empties = (frame: PositionFrame, squares: Square[]): Read[] => squares.flatMap(square => {
    const source = vacated.get(square);
    return source && !frame.pieces.some(p => p.square === square)
      ? [{ kind: "empty-square" as const, square, pieceId: source.pieceId, sourcePly: source.ply }] : [];
  });
  for (let ply = 0; ply <= 8 && context.moves[context.decision + ply]; ply++) {
    yield "tactics";
    const before = context.frames[context.decision + ply], after = context.frames[context.decision + ply + 1];
    if (before.terminal) break;
    const move = context.moves[context.decision + ply], mover = before.pieces.find(p => p.square === move.from)!;
    const captured = before.pieces.find(p => p.square === capturedSquare(move));
    const reads = [pieceRead(before, mover.id), ...(captured ? [pieceRead(before, captured.id)] : [])];
    const route = sliderRay(mover.type, move.from, move.to);
    reads.push(...empties(before, route.length ? route : [move.to]));
    const board = new Chess(before.fen);
    if (board.isCheck()) {
      const king = before.pieces.find(p => p.type === "k" && p.color === before.turn)!;
      for (const square of board.attackers(king.square, opposite(before.turn))) {
        const checker = before.pieces.find(p => p.square === square)!;
        reads.push(pieceRead(before, checker.id, "checking-piece"), ...empties(before, sliderRay(checker.type, checker.square, king.square)));
      }
    }
    timeline.moves.push({ ply, move: uci(move), reads: unique(reads) });
    for (const piece of before.pieces) {
      const next = after.pieces.find(p => p.id === piece.id);
      if (!next || next.square !== piece.square || next.type !== piece.type) {
        changed.set(piece.id, ply);
        if (!after.pieces.some(p => p.square === piece.square)) vacated.set(piece.square, { pieceId: piece.id, ply });
      }
    }
    if (ply > timeline.threatHorizon || after.terminal) continue;
    const next = motifs(yield* tacticalFrameWork(after));
    for (const motif of next) {
      if (previous.has(motif.key)) continue;
      const participants = [motif.attackerId, ...motif.targetIds];
      const dependencies = participants.map(id => pieceRead(after, id));
      const attacker = after.pieces.find(p => p.id === motif.attackerId)!;
      for (const id of motif.targetIds) {
        const target = after.pieces.find(p => p.id === id)!;
        dependencies.push(...empties(after, sliderRay(attacker.type, attacker.square, target.square)));
      }
      const path = rootPath(dependencies, timeline.moves);
      timeline.events.push({ ...motif, ply, frame: after, preexisting: preexisting.has(motif.key), reads: unique(dependencies),
        role: attacker.color === context.before.turn ? "creates-opportunity" : "allows-loss",
        rootPath: path ? [...path.filter(p => p !== ply), ply] : null });
    }
    previous = new Set(next.map(m => m.key));
  }
  return timeline;
}

/** Le bilan depuis la décision et celui de la première prise restent séparés.
 * Une fourchette observée mais compensée ne devient pas un récit de gain. */
export function delayedTacticEffect(context: DecisionContext, event: DelayedTactic) {
  const index = context.decision + event.ply + 1;
  if (context.frames[index]?.command !== event.frame.command) throw new Error("Motif d'une autre suite.");
  const variation = context.moves.slice(index, context.decision + 9).map(m => ({ from: m.from, to: m.to, fen: m.after, label: frenchSan(m.san) }));
  const targetIds = "shield" in event.fact ? [event.fact.shield.id] : event.targetIds;
  const evidence = groupEvidence(context.before, event.frame, targetIds, { variation });
  const capture = evidence.captured[0] ?? null;
  const exchange = capture ? targetExchange(event.frame, { variation }, capture, evidence.moves.length) : null;
  const loss = evidence.outcome === "loss-in-line" && evidence.materialDelta < 0 && exchange?.complete && exchange.balance! < 0 &&
    (event.kind === "pin" || capture?.attackerId === event.attackerId);
  return { status: loss ? "loss-observed" as const : evidence.outcome === "compensated" ? "compensated" as const : "unresolved" as const,
    evidence, exchange, capture };
}

export type DelayedContrast = {
  scope: "legal-prefix-only";
  status: "conditional-contribution" | "unconfirmed";
  reason: "motif-removed" | "root-not-linked" | "preexisting" | "effect-unconfirmed" | "prefix-changed" | "still-present" | "other-threat";
  event: DelayedTactic;
  alternative: string;
  prefix: string[];
};
/** Intervention sur un seul choix légal, sans effacer de pièces. Les coups
 * suivants sont rejoués conditionnellement, jamais présentés comme la réponse
 * libre du moteur dans l'autre branche. Le lot moteur devra encore les vérifier. */
export function delayedTacticContrast(context: DecisionContext, selected: Pick<DelayedTactic, "key" | "ply">, alternative: string): DelayedContrast {
  return finishWork(delayedTacticContrastWork(context, selected, alternative));
}
export function* delayedTacticContrastWork(context: DecisionContext, selected: Pick<DelayedTactic, "key" | "ply">, alternative: string): Work<DelayedContrast> {
  // Une contrainte peut disparaître puis revenir. Sa signature seule ne suffit
  // pas à désigner l'occurrence dont on examine le lien avec la décision.
  const timeline = yield* tacticalTimelineWork(context), event = timeline.events.find(e => e.key === selected.key && e.ply === selected.ply);
  if (!event) throw new Error("Motif absent de cette chronologie.");
  if (alternative === uci(context.moves[context.decision])) throw new Error("Alternative identique.");
  const contrast: DelayedContrast = { scope: "legal-prefix-only", status: "unconfirmed", reason: "root-not-linked", event, alternative, prefix: [] };
  const setup = decisionContext({ ...framePosition(context.before), played: alternative });
  if (event.preexisting) return { ...contrast, reason: "preexisting" };
  if (!event.rootPath) return contrast;
  if (delayedTacticEffect(context, event).status !== "loss-observed") return { ...contrast, reason: "effect-unconfirmed" };
  const board = boardFromCommand(setup.after.command);
  let alternate = setup;
  for (let ply = 1; ply <= event.ply; ply++) {
    yield "context";
    const original = context.moves[context.decision + ply], frame = context.frames[context.decision + ply];
    const move = board.moves({ verbose: true }).find(m => uci(m) === uci(original));
    if (board.isGameOver() || !move || board.isCheck() !== new Chess(frame.fen).isCheck()) return { ...contrast, reason: "prefix-changed" };
    // Le même UCI peut viser une autre pièce après l'alternative. Conserver les
    // identités avant toute comparaison de contraintes.
    const actualMover = frame.pieces.find(p => p.square === original.from)!;
    const actualVictim = frame.pieces.find(p => p.square === capturedSquare(original))?.id;
    const alternateFrame = alternate.frames.at(-1)!, otherMover = alternateFrame.pieces.find(p => p.square === move.from);
    if (otherMover?.id !== actualMover.id || otherMover.type !== actualMover.type ||
        alternateFrame.pieces.find(p => p.square === capturedSquare(move))?.id !== actualVictim)
      return { ...contrast, reason: "prefix-changed" };
    board.move(move); contrast.prefix.push(uci(move));
    alternate = extendBranch(setup, contrast.prefix);
  }
  const next = motifs(yield* tacticalFrameWork(alternate.frames.at(-1)!));
  if (next.some(m => m.key === event.key)) return { ...contrast, reason: "still-present" };
  if (next.some(m => alternate.frames.at(-1)!.pieces.find(p => p.id === m.attackerId)!.color === opposite(context.before.turn) && event.role === "allows-loss"))
    return { ...contrast, reason: "other-threat" };
  return { ...contrast, status: "conditional-contribution", reason: "motif-removed" };
}
