import { readFile, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";

// Instantané CC0 conservé dans le dépôt : génération reproductible, sans réseau.
const edges = new Map();
let lines = 0;
for (const volume of ["a", "b", "c", "d", "e"]) {
  const data = await readFile(
    new URL(`../data/openings/${volume}.tsv`, import.meta.url),
    "utf8",
  );
  for (const row of data.trim().split("\n").slice(1)) {
    const [, , pgn] = row.split("\t");
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true });
    for (const move of history.slice(0, 40)) {
      const key = move.before.split(" ").slice(0, 4).join(" ");
      const choices = edges.get(key) ?? new Set();
      choices.add(move.from + move.to + (move.promotion ?? ""));
      edges.set(key, choices);
    }
    lines++;
  }
}
const index = Object.fromEntries(
  [...edges]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, moves]) => [key, [...moves].sort().join(" ")]),
);
await writeFile(
  new URL("../src/review/opening-book.json", import.meta.url),
  JSON.stringify(index) + "\n",
);
console.log(
  `${lines} lignes, ${edges.size} positions, ${[...edges.values()].reduce((n, moves) => n + moves.size, 0)} coups répertoriés (40 demi-coups maximum).`,
);
