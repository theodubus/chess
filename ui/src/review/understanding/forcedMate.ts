import type { Color, Move } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import { uci } from "./context";
import { completeWork, finishWork, type Work } from "./work";

export type MateStrategy = {
  command: string;
  fen: string;
  turn: Color;
  plies: number;
  branches: { move: string; next: MateStrategy }[];
};
export type ForcedMateProof = {
  status: "proved" | "refuted" | "incomplete";
  reason: "all-defences-covered" | "defence-outside-horizon" | "node-limit";
  winner: Color;
  horizon: number;
  nodes: number;
  strategy: MateStrategy | null;
};
type NodeResult = { status: ForcedMateProof["status"]; strategy: MateStrategy | null };
const append = (command: string, move: string) => command + (command.includes(" moves ") ? " " : " moves ") + move;

/** Ce n'est pas un moteur d'évaluation : on vérifie uniquement un mat annoncé,
 * dans un horizon et un nombre de nœuds bornés. Les défenses sont exhaustives,
 * y compris les coups calmes, promotions et interpositions. Une borne atteinte
 * conserve l'inconnu au lieu de transformer la PV en preuve forcée. */
export function* forcedMateWork(command: string, winner: Color, horizon: number, hint: string[] = [], maxNodes = 1200): Work<ForcedMateProof> {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 6 || !Number.isInteger(maxNodes) || maxNodes < 1)
    throw new Error("Preuve de mat bornée à six demi-coups.");
  const board = boardFromCommand(command);
  let nodes = 0;
  function* visit(current: string, remaining: number, preferred: string[]): Work<NodeResult> {
    yield "mate";
    if (nodes >= maxNodes) return { status: "incomplete", strategy: null };
    nodes++;
    const frame = { command: current, fen: board.fen(), turn: board.turn() };
    if (board.isCheckmate()) return board.turn() !== winner
      ? { status: "proved", strategy: { ...frame, plies: 0, branches: [] } }
      : { status: "refuted", strategy: null };
    if (board.isDraw() || remaining === 0) return { status: "refuted", strategy: null };
    const attacking = board.turn() === winner;
    const priority = (m: Move) => uci(m) === preferred[0] ? 100 : m.san.endsWith("#") ? 90 : m.san.endsWith("+") ? 80 : m.promotion ? 70 : m.captured ? 60 : 0;
    const moves = board.moves({ verbose: true }).sort((a, b) => priority(b) - priority(a));
    const branches: MateStrategy["branches"] = [];
    let incomplete = false;
    for (const [index, move] of moves.entries()) {
      board.move(move);
      const played = uci(move), child = yield* visit(append(current, played), remaining - 1,
        played === preferred[0] ? preferred.slice(1) : []);
      board.undo();
      if (child.status === "incomplete") incomplete = true;
      if (attacking && child.status === "proved") return {
        status: "proved", strategy: { ...frame, plies: child.strategy!.plies + 1, branches: [{ move: played, next: child.strategy! }] },
      };
      if (!attacking && child.status === "refuted") return { status: "refuted", strategy: null };
      if (child.strategy) branches.push({ move: played, next: child.strategy });
      if (nodes >= maxNodes && index < moves.length - 1) { incomplete = true; break; }
    }
    if (incomplete) return { status: "incomplete", strategy: null };
    return attacking ? { status: "refuted", strategy: null } : {
      status: "proved", strategy: { ...frame, plies: 1 + Math.max(...branches.map((b) => b.next.plies)), branches },
    };
  }
  const result = yield* visit(command, horizon, hint);
  return { ...result, winner, horizon, nodes, reason: result.status === "proved" ? "all-defences-covered"
    : result.status === "refuted" ? "defence-outside-horizon" : "node-limit" };
}
export function forcedMateProof(command: string, winner: Color, horizon: number, hint: string[] = [], maxNodes = 1200) {
  return finishWork(forcedMateWork(command, winner, horizon, hint, maxNodes));
}
/** Un rapport mis en cache reste lié à l'historique, et aucune branche de
 * défense ne peut disparaître lors de sa conversion en texte. */
export function validMateStrategy(proof: ForcedMateProof, command: string): boolean {
  if (proof.status !== "proved" || !proof.strategy || !Number.isInteger(proof.horizon) || proof.horizon < 1 || proof.horizon > 6) return false;
  const board = boardFromCommand(command);
  let nodes = 0;
  const visit = (node: MateStrategy, current: string, remaining: number): boolean => {
    if (++nodes > 1200 || node.command !== current || node.fen !== board.fen() || node.turn !== board.turn()) return false;
    if (board.isCheckmate()) return board.turn() !== proof.winner && node.plies === 0 && node.branches.length === 0;
    if (board.isDraw() || remaining === 0 || !node.branches.length) return false;
    const legal = board.moves({ verbose: true }).map(uci), moves = node.branches.map((b) => b.move);
    if (new Set(moves).size !== moves.length || moves.some((m) => !legal.includes(m)) ||
      (board.turn() === proof.winner ? moves.length !== 1 : moves.length !== legal.length)) return false;
    for (const branch of node.branches) {
      board.move(branch.move);
      const valid = visit(branch.next, append(current, branch.move), remaining - 1);
      board.undo();
      if (!valid) return false;
    }
    return node.plies === 1 + Math.max(...node.branches.map((b) => b.next.plies));
  };
  return visit(proof.strategy, command, proof.horizon);
}
/** La preuve cède au navigateur entre primitives, et se ferme sans résultat
 * lors d'une navigation ou d'un délai expiré dans le vérificateur appelant. */
export async function proveMate(command: string, winner: Color, horizon: number, hint: string[], signal: AbortSignal, maxNodes = 1200) {
  return completeWork(forcedMateWork(command, winner, horizon, hint, maxNodes), signal);
}
/** Une défense de la PV peut choisir n'importe quelle branche légale couverte.
 * Un coup d'attaque absent de la stratégie ne devient pas un coup « moteur ». */
export function mateWitness(strategy: MateStrategy, hint: string[]): { moves: string[]; origins: ("engine-line" | "rules")[] } {
  const moves: string[] = [], origins: ("engine-line" | "rules")[] = [];
  let node = strategy, followsHint = true;
  while (node.branches.length) {
    const found: MateStrategy["branches"][number] | undefined = followsHint ? node.branches.find((b) => b.move === hint[moves.length]) : undefined;
    const branch = found ?? [...node.branches].sort((a, b) => b.next.plies - a.next.plies)[0];
    followsHint = followsHint && !!found;
    moves.push(branch.move); origins.push(followsHint ? "engine-line" : "rules"); node = branch.next;
  }
  return { moves, origins };
}
