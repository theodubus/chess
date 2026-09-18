import { Chess } from "chess.js";
import { frenchSan, type ReviewPosition } from "./model";
import type { Key } from "@lichess-org/chessground/types";

export type StudyNode = {
  id: number;
  parent: number | null;
  children: number[];
  uci: string | null;
  label: string;
  fen: string;
};

export function boardFromCommand(command: string) {
  const [start, moves] = command.split(" moves ");
  const board = new Chess(
    start.startsWith("position fen ") ? start.slice(13) : undefined,
  );
  for (const uci of moves?.split(" ") ?? [])
    board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
  return board;
}

/** Arbre séparé de la partie : revenir en arrière puis jouer conserve l'autre branche. */
export class StudyTree {
  readonly nodes: StudyNode[];
  constructor(readonly root: ReviewPosition) {
    this.nodes = [
      {
        id: 0,
        parent: null,
        children: [],
        uci: null,
        label: "Départ de la variante",
        fen: root.fen,
      },
    ];
  }
  path(id: number): StudyNode[] {
    const result: StudyNode[] = [];
    for (
      let node = this.nodes[id];
      node.parent !== null;
      node = this.nodes[node.parent]
    )
      result.unshift(node);
    return result;
  }
  command(id: number) {
    const moves = this.path(id)
      .map((node) => node.uci)
      .join(" ");
    return (
      this.root.command +
      (moves
        ? (this.root.command.includes(" moves ") ? " " : " moves ") + moves
        : "")
    );
  }
  board(id: number) {
    return boardFromCommand(this.command(id));
  }
  destinations(id: number) {
    const board = this.board(id),
      destinations = new Map<Key, Key[]>();
    if (board.isGameOver()) return destinations;
    for (const move of board.moves({ verbose: true })) {
      const targets = destinations.get(move.from) ?? [];
      if (!targets.includes(move.to)) targets.push(move.to);
      destinations.set(move.from, targets);
    }
    return destinations;
  }
  play(id: number, from: string, to: string, promotion?: string) {
    const board = this.board(id);
    if (board.isGameOver()) throw new Error("Cette variante est terminée.");
    const move = board.move({ from, to, promotion });
    const uci = move.from + move.to + (move.promotion ?? "");
    const existing = this.nodes[id].children.find(
      (child) => this.nodes[child].uci === uci,
    );
    if (existing !== undefined) return existing;
    const node: StudyNode = {
      id: this.nodes.length,
      parent: id,
      children: [],
      uci,
      fen: board.fen(),
      label: `${new Chess(move.before).moveNumber()}${move.color === "w" ? "." : "…"} ${frenchSan(move.san)}`,
    };
    this.nodes.push(node);
    this.nodes[id].children.push(node.id);
    return node.id;
  }
}
