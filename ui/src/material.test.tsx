import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { capturedMaterial, materialBalance } from "./material";
import CapturedPieces from "./CapturedPieces";
import { StudyTree } from "./review/StudyTree";
import { gamePositions } from "./review/model";

it("compte les prises par joueur et ne montre le delta que pour le camp en avance", () => {
  const board = new Chess();
  for (const move of ["e4", "d5", "exd5"]) board.move(move);
  let captures = capturedMaterial(board.history({ verbose: true }));
  expect(captures.w).toEqual({ pieces: ["p"], points: 1 });
  expect(
    renderToStaticMarkup(
      <CapturedPieces
        captures={captures}
        balance={materialBalance(board)}
        side="w"
      />,
    ),
  ).toContain(">+1</strong>");
  expect(
    renderToStaticMarkup(
      <CapturedPieces
        captures={captures}
        balance={materialBalance(board)}
        side="b"
      />,
    ),
  ).not.toContain("capture-advantage");
  board.move("Qxd5");
  captures = capturedMaterial(board.history({ verbose: true }));
  expect(captures.b).toEqual({ pieces: ["p"], points: 1 });
  expect(
    renderToStaticMarkup(
      <CapturedPieces
        captures={captures}
        balance={materialBalance(board)}
        side="w"
      />,
    ),
  ).not.toContain("capture-advantage");
  expect(
    capturedMaterial(board.history({ verbose: true }).slice(0, 2)).w.pieces,
  ).toEqual([]);
});
it("utilise les valeurs classiques et regroupe les pièces par type", () => {
  const captures = capturedMaterial([
    { color: "w", captured: "q" },
    { color: "w", captured: "p" },
    { color: "w", captured: "r" },
    { color: "w", captured: "b" },
    { color: "w", captured: "n" },
    { color: "b", captured: "r" },
  ]);
  expect(captures.w).toEqual({ pieces: ["p", "n", "b", "r", "q"], points: 21 });
  const html = renderToStaticMarkup(
    <CapturedPieces captures={captures} balance={0} side="w" />,
  );
  expect(html.match(/<img /g)).toHaveLength(5);
  expect(html).not.toContain('src="undefined"');
});
it("gère la prise en passant, les promotions et les FEN sans inventer de prises", () => {
  const board = new Chess();
  for (const move of ["e4", "a6", "e5", "d5", "exd6"]) board.move(move);
  expect(board.history({ verbose: true }).at(-1)?.isEnPassant()).toBe(true);
  expect(capturedMaterial(board.history({ verbose: true })).w.points).toBe(1);
  const promotion = new Chess("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  expect(capturedMaterial(promotion.history({ verbose: true })).w.points).toBe(
    0,
  );
  promotion.move("axb8=Q+");
  expect(capturedMaterial(promotion.history({ verbose: true })).w).toEqual({
    pieces: ["r"],
    points: 5,
  });
});
it("suit les prises de la variante sans les confondre avec la partie", () => {
  const board = new Chess();
  for (const move of ["e4", "d5", "exd5"]) board.move(move);
  const tree = new StudyTree(gamePositions(board.pgn())[2]);
  const capture = tree.play(0, "e4", "d5");
  const quiet = tree.play(0, "e4", "e5");
  expect(
    capturedMaterial(tree.board(capture).history({ verbose: true })).w.points,
  ).toBe(1);
  expect(
    capturedMaterial(tree.board(quiet).history({ verbose: true })).w.points,
  ).toBe(0);
  expect(capturedMaterial(board.history({ verbose: true })).w.points).toBe(1);
});

it("réserve la ligne des captures avant la première prise", () => {
  const html = renderToStaticMarkup(
    <CapturedPieces captures={capturedMaterial([])} balance={0} side="w" />,
  );
  expect(html).toContain('class="captured-material"');
  expect(html).toContain('class="captured-icons"');
  expect(html).toContain("Prises des Blancs : aucune");
  expect(html).not.toContain("<img");
});

for (const [piece, gain] of [
  ["q", 8],
  ["r", 4],
  ["b", 2],
  ["n", 2],
] as const) {
  it(`compte la promotion en ${piece}, sans inventer de capture`, () => {
    for (const side of ["w", "b"] as const) {
      const board = new Chess(
        side === "w"
          ? "7k/P7/8/8/8/8/8/7K w - - 0 1"
          : "7k/8/8/8/8/8/p7/7K b - - 0 1",
      );
      const before = materialBalance(board);
      board.move({
        from: side === "w" ? "a7" : "a2",
        to: side === "w" ? "a8" : "a1",
        promotion: piece,
      });
      const balance = materialBalance(board);
      expect(balance - before).toBe(side === "w" ? gain : -gain);
      const html = renderToStaticMarkup(
        <CapturedPieces
          captures={capturedMaterial(board.history({ verbose: true }))}
          balance={balance}
          side={side}
        />,
      );
      expect(html).toContain(`>+${gain + 1}</strong>`);
      expect(html).not.toContain("<img");
    }
  });
}
it("recalcule le matériel après la capture d’une pièce promue et en remontant la partie", () => {
  const board = new Chess("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  expect(materialBalance(board)).toBe(-4);
  board.move("a8=Q");
  expect(materialBalance(board)).toBe(4);
  board.move("Rxa8");
  expect(materialBalance(board)).toBe(-5);
  expect(capturedMaterial(board.history({ verbose: true })).b.pieces).toEqual([
    "q",
  ]);
  board.undo();
  expect(materialBalance(board)).toBe(4);
  board.undo();
  expect(materialBalance(board)).toBe(-4);
  board.move("axb8=Q+");
  expect(materialBalance(board)).toBe(9);
  expect(capturedMaterial(board.history({ verbose: true })).w.pieces).toEqual([
    "r",
  ]);
});
it("compte le handicap initial sans le présenter comme une prise", () => {
  const board = new Chess();
  board.remove("a8");
  const html = renderToStaticMarkup(
    <CapturedPieces
      captures={capturedMaterial([])}
      balance={materialBalance(board)}
      side="w"
    />,
  );
  expect(html).toContain(
    "Prises des Blancs : aucune ; avantage matériel de 5 points",
  );
  expect(html).toContain(">+5</strong>");
  expect(html).not.toContain("<img");
});
it("calcule chaque variante de promotion depuis sa propre position", () => {
  const board = new Chess("1r5k/P7/8/8/8/8/8/7K w - - 0 1");
  board.move("a8=Q");
  const tree = new StudyTree(gamePositions(board.pgn())[0]);
  const queen = tree.play(0, "a7", "a8", "q");
  const knight = tree.play(0, "a7", "b8", "n");
  expect(materialBalance(tree.board(0))).toBe(-4);
  expect(materialBalance(tree.board(queen))).toBe(4);
  expect(materialBalance(tree.board(knight))).toBe(3);
});
