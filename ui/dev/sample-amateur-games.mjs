import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { Chess } from "chess.js";

const { values } = parseArgs({ options: { archive: { type: "string" }, output: { type: "string", default: "src/review/understanding/amateurGames.json" } } });
if (!values.archive) throw new Error("Indiquer --archive <archive Lichess janvier 2013 .pgn.zst>.");
const sha256 = (data) => createHash("sha256").update(data).digest("hex"), archiveHash = sha256(await readFile(values.archive));
if (archiveHash !== "aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635") throw new Error("L'archive diffère de l'empreinte publiée par Lichess.");
// Sélection figée avant toute recherche moteur : les trois premières parties
// légales, normales, 40–160 demi-coups, deux classements 800–1800 inclus,
// cadence initiale 180–1200 s, sans réutiliser un joueur déjà sélectionné.
// Aucune sélection selon un motif, un score ou une sortie du détecteur.
const selected = [], players = new Set();
let ordinal = 0, block = [];
function consider(lines) {
  if (!lines.length) return;
  ordinal++;
  const raw = lines.join("\n").trim(), tags = Object.fromEntries([...raw.matchAll(/^\[(\w+) "(.*)"\]$/gm)].map((m) => [m[1], m[2]]));
  const ratings = [Number(tags.WhiteElo), Number(tags.BlackElo)], seconds = Number(tags.TimeControl?.split("+")[0]);
  if (tags.Termination !== "Normal" || !["1-0", "0-1", "1/2-1/2"].includes(tags.Result) ||
    ratings.some((r) => !Number.isInteger(r) || r < 800 || r > 1800) || !Number.isFinite(seconds) || seconds < 180 || seconds > 1200 ||
    players.has(tags.White) || players.has(tags.Black)) return;
  const board = new Chess();
  try { board.loadPgn(raw, { strict: true }); } catch { return; }
  const plies = board.history().length;
  if (plies < 40 || plies > 160) return;
  // Les identités ne servent qu'à diversifier le prélèvement ; les fichiers
  // versionnés gardent le lien public et les métadonnées échiquéennes utiles.
  players.add(tags.White); players.add(tags.Black);
  const clean = new Chess(); clean.loadPgn(raw);
  for (const key of Object.keys(clean.getHeaders())) clean.removeHeader(key);
  for (const [key, value] of Object.entries({ Event: "Échantillon Lichess CC0", Site: tags.Site, White: "Blancs", Black: "Noirs", Result: tags.Result, Date: tags.Date ?? tags.UTCDate })) clean.setHeader(key, value);
  for (const key of ["Date", "UTCDate", "TimeControl", "WhiteElo", "BlackElo", "Termination"]) if (tags[key]) clean.setHeader(key, tags[key]);
  clean.removeComments();
  selected.push({ id: tags.Site.split("/").at(-1), ordinal, source: tags.Site, rawGameHash: sha256(raw), plies, ratings, pgn: clean.pgn(), semanticReview: "pending" });
}
const decoder = spawn("zstd", ["-dc", resolve(values.archive)], { stdio: ["ignore", "pipe", "pipe"] });
let stderr = ""; decoder.stderr.on("data", (data) => { stderr += data; });
const done = new Promise((resolveDone, reject) => {
  decoder.on("error", reject);
  decoder.on("exit", (code, signal) => code === 0 || signal === "SIGTERM" ? resolveDone() : reject(new Error(stderr || `zstd : ${code}`)));
});
const lines = createInterface({ input: decoder.stdout, crlfDelay: Infinity });
try {
  for await (const line of lines) {
    if (line.startsWith("[Event ") && block.length) {
      consider(block); block = [];
      if (selected.length === 3) break;
    }
    block.push(line);
  }
  if (selected.length < 3) consider(block);
} finally { lines.close(); decoder.kill("SIGTERM"); await done; }
if (selected.length !== 3) throw new Error("Trois parties attendues.");
await writeFile(values.output, JSON.stringify({ schema: 1, source: "https://database.lichess.org/", archive: "lichess_db_standard_rated_2013-01.pgn.zst",
  archiveHash, license: "CC0-1.0", selectionFrozenAt: "2026-10-04", selection: "Premières 3 parties normales légales, 40–160 demi-coups, deux Elo 800–1800, temps initial 180–1200 s, joueurs distincts, ordre de l'archive.",
  independentSemanticValidation: false, usedForDevelopment: false, games: selected }, null, 2) + "\n");
console.log(JSON.stringify(selected.map(({ id, ordinal, plies, ratings }) => ({ id, ordinal, plies, ratings }))));
