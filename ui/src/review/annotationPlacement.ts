import { Chess, type Square } from "chess.js";
export type BadgeCorner =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

/** Choisir un coin, jamais déplacer librement l'icône à l'intérieur de la case. */
export function annotationPlacement(
  fen: string,
  square: string,
  orientation: "white" | "black",
) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const column = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  const board = new Chess(fen);
  function occupied(x: number, y: number) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return 0;
    const f = orientation === "white" ? x : 7 - x;
    const r = orientation === "white" ? 7 - y : y;
    return board.get(`${String.fromCharCode(97 + f)}${r + 1}` as Square)
      ? 1
      : 0;
  }
  const corners: [BadgeCorner, number, number][] = [
    ["top-right", 1, -1],
    ["top-left", -1, -1],
    ["bottom-right", 1, 1],
    ["bottom-left", -1, 1],
  ];
  const candidates = corners.map(([corner, dx, dy], priority) => ({
    corner,
    // Les bords du plateau priment sur l'espace occupé par les pièces voisines.
    score:
      (column + dx < 0 || column + dx > 7 || row + dy < 0 || row + dy > 7
        ? 100
        : 0) +
      occupied(column + dx, row) * 3 +
      occupied(column, row + dy) * 3 +
      occupied(column + dx, row + dy) +
      (dy === 1 ? 2 : 0) +
      priority / 10,
  }));
  candidates.sort((a, b) => a.score - b.score);
  return { column, row, corner: candidates[0].corner };
}
