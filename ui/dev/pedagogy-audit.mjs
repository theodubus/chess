import { once } from "node:events";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), hash = (value) => createHash("sha256").update(value).digest("hex");
const { values } = parseArgs({ options: {
  engine: { type: "string", default: process.env.CHESS_ENGINE_BINARY ?? "../target/release/shallowred" },
  stockfish: { type: "string", default: process.env.CHESS_STOCKFISH_BINARY },
  output: { type: "string", default: "dev/pedagogy-audit-data.json" },
  "review-budget": { type: "string", default: "250" },
  "reuse-review": { type: "boolean", default: false },
} });
const budget = Number(values["review-budget"]);
if (![100, 250, 500, 1000, 3000].includes(budget)) throw new Error("Budget de revue invalide.");
const manifest = JSON.parse(await readFile(resolve(root, "src/review/understanding/amateurGames.json"), "utf8")),
  vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom" }), originalWebSocket = globalThis.WebSocket;
const document = { schema: 1, generatedAt: new Date().toISOString(), selection: manifest.selection, archiveHash: manifest.archiveHash,
  independentSemanticValidation: false, reviewBudgetMs: budget, consequenceBudgetsMs: [300, 900], games: [] };
const previous = values["reuse-review"] ? JSON.parse(await readFile(resolve(root, values.output), "utf8")) : null;
const sources = ["src/review/GameReview.ts", "src/review/understanding/PedagogicalAnalysis.ts", "src/review/understanding/forcedMate.ts",
  "src/review/understanding/MateConsequenceVerification.ts", "src/review/understanding/TacticalVerification.ts",
  "src/review/understanding/RelationVerification.ts", "src/review/understanding/RestrictionEffectVerification.ts"];
document.implementationHashes = Object.fromEntries(await Promise.all(sources.map(async (path) => [path, hash(await readFile(resolve(root, path)))])));
// Une ligne par position/décision garde le rapport lisible dans la PR sans
// multiplier par les indentations les longues variantes et leurs historiques.
const save = () => {
  const { games, ...metadata } = document;
  const blocks = games.map(({ results, annotations, decisions, ...game }) => {
    const arrays = Object.entries({ results, annotations, decisions }).map(([key, rows]) =>
      `    "${key}": [\n${rows.map((row) => "      " + JSON.stringify(row)).join(",\n")}\n    ]`);
    return JSON.stringify(game, null, 2).slice(0, -2) + ",\n" + arrays.join(",\n") + "\n  }";
  });
  return writeFile(resolve(root, values.output), JSON.stringify(metadata, null, 2).slice(0, -2) + ",\n  \"games\": [\n" + blocks.join(",\n") + "\n  ]\n}\n");
};
try {
  const [{ GameReview }, { PedagogicalAnalysis, adverseCategory }, { explainMove }, { directExplanation }, { boardFromCommand }, { notablePositions }, { connectDevelopmentEngine }] = await Promise.all([
    vite.ssrLoadModule("/src/review/GameReview.ts"), vite.ssrLoadModule("/src/review/understanding/PedagogicalAnalysis.ts"),
    vite.ssrLoadModule("/src/review/explanations.ts"), vite.ssrLoadModule("/src/review/directExplanation.ts"),
    vite.ssrLoadModule("/src/review/StudyTree.ts"), vite.ssrLoadModule("/src/review/study.ts"), vite.ssrLoadModule("/src/engine/DevelopmentEngine.ts"),
  ]);
  // Cet outil emploie le même adaptateur Engine que la revue. Aucun accès direct
  // aux sorties du processus moteur ni hypothèse MultiPV ne remplace l'UCI.
  globalThis.WebSocket = class extends WebSocket { constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); } };
  for (const [engine, path] of [["ShallowRed", values.engine], ["Stockfish", values.stockfish]]) {
    if (!path) continue;
    const command = resolve(root, path), engineHash = hash(await readFile(command)), bridge = startBridge({ command, port: 0 });
    try {
      await once(bridge.server, "listening");
      const factory = (failure) => connectDevelopmentEngine(failure, `ws://127.0.0.1:${bridge.server.address().port}`);
      for (const game of manifest.games) {
        const review = new GameReview(game.pgn), analysis = new PedagogicalAnalysis(), began = performance.now();
        let progress = "";
        const off = review.subscribe(() => {
          const next = `${review.phase}:${Math.floor(review.current / 10)}`;
          if (next !== progress) { progress = next; console.log(`${engine} ${game.id} : ${review.phase}, position ${review.current}/${game.plies}`); }
        });
        try {
          const cached = previous?.reviewBudgetMs === budget ? previous.games.find((g) => g.complete && g.id === game.id &&
            g.engine === engine && g.engineHash === engineHash && g.pgnHash === hash(game.pgn)) : null;
          if (cached) {
            // Réutiliser uniquement la revue moteur, jamais les explications :
            // elles sont recalculées avec le code et les diagnostics courants.
            review.results = structuredClone(cached.results); review.verified = new Set(cached.verified);
            review.state = "complete"; review.engineName = cached.engineName;
          } else await review.start(factory, budget);
          off();
          if (review.state !== "complete") throw new Error(`${engine}/${game.id} : ${review.error || review.state}`);
          const row = { id: game.id, source: game.source, pgnHash: hash(game.pgn), capturedAt: new Date().toISOString(), engine, engineName: review.engineName, engineHash,
            reviewCapturedAt: cached?.reviewCapturedAt ?? cached?.capturedAt ?? new Date().toISOString(), reusedReview: !!cached,
            reviewElapsedMs: cached?.reviewElapsedMs ?? Math.round(performance.now() - began), plies: game.plies, revision: review.revision, results: review.results, verified: [...review.verified],
            annotations: review.annotations, moments: Object.fromEntries(["w", "b", "both"].map((side) => [side, notablePositions(review.annotations, review.positions, side)])), decisions: [], complete: false };
          document.games.push(row); await save();
          for (const [index, position] of review.positions.entries()) {
            if (!position.played) continue;
            const annotation = review.annotations[index];
            if (!adverseCategory(annotation?.category)) continue;
            const before = review.results[index], after = review.results[index + 1], start = performance.now(),
              baseline = explainMove(position, before, after, annotation), request = { review, revision: review.revision, engineId: engine, position, result: after, category: annotation.category },
              result = await analysis.analyse(request, factory), view = directExplanation(explainMove(position, before, after, annotation, false), result?.consequence ?? null);
            // Légalité et fidélité de chaque repère, pas jugement pédagogique.
            for (const step of view.proof?.steps ?? []) if (boardFromCommand(step.command).fen() !== step.fen) throw new Error("Repère d'une autre position.");
            row.decisions.push({ index, label: review.positions[index + 1].label, played: position.playedSan, turn: position.turn, category: annotation.category,
              status: result?.status ?? "unavailable", controllerState: analysis.state, error: analysis.error || null,
              attempts: result?.attempts ?? null, searches: result?.searches ?? null, checks: result?.checks ?? null,
              elapsedMs: Math.round(performance.now() - start), consequence: result?.consequence ?? null,
              baseline: { concrete: baseline.concrete, summary: baseline.summary, primary: baseline.primary ?? null, proofTitle: baseline.proof?.title ?? null,
                proofPositions: baseline.proof?.steps.length ?? 0 }, semanticAssessment: "pending" });
            console.log(`${engine} ${game.id} ${index + 1}. ${position.playedSan} : ${result?.status ?? analysis.state} (${Math.round(performance.now() - start)} ms)`);
            await save();
          }
          row.complete = true;
          row.summary = { adverseDecisions: row.decisions.length, supported: row.decisions.filter((d) => d.status === "supported").length,
            unconfirmed: row.decisions.filter((d) => d.status === "unconfirmed").length, unavailable: row.decisions.filter((d) => d.status === "unavailable").length,
            unclassified: review.unclassifiedCount, baselineConcrete: row.decisions.filter((d) => d.baseline.concrete).length,
            semanticReviewed: 0, proofPositions: row.decisions.reduce((n, d) => n + (d.consequence?.steps.length ?? 0), 0) };
          await save(); console.log(JSON.stringify({ engine, game: game.id, ...row.summary }));
        } finally { off(); analysis.stop(); await review.stop(); }
      }
    } finally { await bridge.close(); }
  }
} finally { globalThis.WebSocket = originalWebSocket; await vite.close(); }
