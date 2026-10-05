import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  source: { type: "string", default: "dev/pedagogy-audit-final-data.json" },
  output: { type: "string", default: "dev/delayed-tactics-prototype-data.json" },
  manifest: { type: "string", default: "src/review/understanding/amateurGames.json" },
  verify: { type: "boolean", default: false },
  engine: { type: "string", default: process.env.CHESS_ENGINE_BINARY ?? "../target/release/shallowred" },
  stockfish: { type: "string", default: process.env.CHESS_STOCKFISH_BINARY },
} });
const hash = data => createHash("sha256").update(data).digest("hex");
const raw = await readFile(resolve(root, values.source));
const manifestRaw = await readFile(resolve(root, values.manifest)), audit = JSON.parse(raw), sample = JSON.parse(manifestRaw);
const vite = await createServer({ root, server: { middlewareMode: true, ws: false }, appType: "custom" });
const bridges = [], factories = new Map(), originalWebSocket = globalThis.WebSocket;
try {
  const [{ auditReview }, { decisionContext }, { boundedContinuation }, { tacticalTimeline, delayedTacticEffect, delayedTacticContrast },
    { DelayedTacticVerification }, { delayedTacticInput }, { connectDevelopmentEngine }] = await Promise.all([
    vite.ssrLoadModule("/src/review/understanding/auditModel.ts"), vite.ssrLoadModule("/src/review/understanding/context.ts"),
    vite.ssrLoadModule("/src/review/understanding/evidence.ts"), vite.ssrLoadModule("/src/review/understanding/delayedTactics.ts"),
    vite.ssrLoadModule("/src/review/understanding/DelayedTacticVerification.ts"), vite.ssrLoadModule("/src/review/understanding/delayedTacticCases.ts"),
    vite.ssrLoadModule("/src/engine/DevelopmentEngine.ts"),
  ]);
  if (audit.games.some(g => !g.complete)) throw new Error("Audit source incomplet.");
  if (values.verify) {
    globalThis.WebSocket = class extends WebSocket { constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); } };
    for (const [engine, path] of [["ShallowRed", values.engine], ["Stockfish", values.stockfish]]) {
      if (!path) continue;
      const command = resolve(root, path), engineHash = hash(await readFile(command));
      if (audit.games.some(g => g.engine === engine && g.engineHash !== engineHash)) throw new Error("Binaire différent de la revue source.");
      const bridge = startBridge({ command, port: 0 }); bridges.push(bridge);
      await once(bridge.server, "listening");
      factories.set(engine, { engineHash, factory: failure => connectDevelopmentEngine(failure, `ws://127.0.0.1:${bridge.server.address().port}`) });
    }
    if (audit.games.some(g => !factories.has(g.engine))) throw new Error("Moteur de la revue source absent.");
  }
  const rows = [], constructed = [];
  const verify = async (position, event, engine, review, revision) => {
    const verification = new DelayedTacticVerification();
    try {
      const report = await verification.verify({ review, revision, engineId: engine, position, event: { key: event.key, ply: event.ply } }, factories.get(engine).factory);
      return { report, state: verification.state, error: verification.error || null };
    } finally { verification.stop(); }
  };
  for (const game of audit.games) {
    const pgn = sample.games.find(g => g.id === game.id)?.pgn;
    if (!pgn) throw new Error("Partie source absente.");
    const review = auditReview(game, pgn);
    for (const decision of game.decisions) {
      const start = performance.now(), position = review.positions[decision.index], result = review.results[decision.index + 1];
      const root = decisionContext(position), context = decisionContext(position, result ? boundedContinuation(root.after, result) : null);
      const timeline = tacticalTimeline(context), alternative = review.results[decision.index]?.bestMove;
      const events = timeline.events.filter(e => e.ply > 1 && e.role === "allows-loss").map(event => {
        const effect = delayedTacticEffect(context, event);
        const contrast = alternative && alternative !== position.played ? delayedTacticContrast(context, event, alternative) : null;
        return { ...event, effect, contrast: contrast && { scope: contrast.scope, status: contrast.status, reason: contrast.reason,
          alternative: contrast.alternative, prefix: contrast.prefix } };
      });
      if (values.verify) for (const event of events) if (event.contrast?.status === "conditional-contribution") {
        event.verification = await verify(position, event, game.engine, review, review.revision);
        console.log(`${game.engine} ${game.id} ${decision.label} : ${event.verification.report?.status ?? event.verification.state}`);
      }
      rows.push({ engine: game.engine, engineHash: game.engineHash, game: game.id, index: decision.index, label: decision.label,
        category: decision.category, previousStatus: decision.status, semanticAssessment: "pending",
        elapsedMs: Math.round(performance.now() - start), events });
    }
  }
  // Suites construites : vérifier aussi que le moteur peut refuser nos témoins
  // choisis. Elles restent séparées des trois parties sélectionnées avant mesure.
  if (values.verify) for (const [engine, { engineHash }] of factories) for (const id of ["delayed-fork", "delayed-fork-black", "delayed-pin"]) {
    const source = delayedTacticInput(id), event = tacticalTimeline(source.context).events.find(e => e.ply > 1 && e.role === "allows-loss");
    if (!event) throw new Error("Témoin logiciel absent.");
    const checked = await verify(source.position, event, engine, {}, 0);
    constructed.push({ id, engine, engineHash, semanticAssessment: "pending", ...checked });
    console.log(`${engine} ${id} : ${checked.report?.status ?? checked.state}`);
  }
  const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1];
  const checks = [...rows.flatMap(r => r.events.flatMap(e => e.verification ? [e.verification] : [])), ...constructed];
  const report = { schema: 1, generatedAt: new Date().toISOString(), stage: values.verify ? "engine-checked-experiment" : "prototype-facts-only", publishable: false,
    independentSemanticValidation: false, source: values.source, sourceHash: hash(raw),
    manifest: values.manifest, manifestHash: hash(manifestRaw),
    implementationHash: hash(await readFile(resolve(root, "src/review/understanding/delayedTactics.ts"))),
    verificationHash: hash(await readFile(resolve(root, "src/review/understanding/DelayedTacticVerification.ts"))),
    threatHorizon: 6, witnessHorizon: 8, consequenceBudgetsMs: [300, 900], deadlineMs: 12000,
    // Les recherches d'un échec sans rapport ne sont pas inventées à zéro.
    reportedEngineSearches: checks.reduce((n, c) => n + (c.report?.searches ?? 0), 0),
    checksWithoutCostReport: checks.filter(c => !c.report).length,
    summary: { decisions: rows.length, withDelayedMotif: rows.filter(r => r.events.length).length,
      withRootDependency: rows.filter(r => r.events.some(e => e.rootPath && !e.preexisting)).length,
      withObservedLoss: rows.filter(r => r.events.some(e => e.rootPath && !e.preexisting && e.effect.status === "loss-observed")).length,
      withConditionalContrast: rows.filter(r => r.events.some(e => e.contrast?.status === "conditional-contribution")).length,
      previouslyUnconfirmedWithContrast: rows.filter(r => r.previousStatus !== "supported" && r.events.some(e => e.contrast?.status === "conditional-contribution")).length,
      corroboratedCandidates: rows.filter(r => r.events.some(e => e.verification?.report?.status === "corroborated-candidate")).length,
      previouslyUnconfirmedCorroborated: rows.filter(r => r.previousStatus !== "supported" && r.events.some(e => e.verification?.report?.status === "corroborated-candidate")).length,
      // Un fait ou contraste local ne devient pas une explication confirmée.
      newConfirmedExplanations: 0,
      medianMs: percentile(rows.map(r => r.elapsedMs), 0.5), p95Ms: percentile(rows.map(r => r.elapsedMs), 0.95),
      maxMs: Math.max(...rows.map(r => r.elapsedMs)) }, rows, constructed };
  // Une ligne par décision garde le diff lisible sans multiplier les frames
  // et questions répétées par les seules indentations JSON.
  const { rows: savedRows, constructed: savedExamples, ...metadata } = report;
  const array = (key, items) => `  "${key}": [\n${items.map(item => "    " + JSON.stringify(item)).join(",\n")}\n  ]`;
  await writeFile(resolve(root, values.output), JSON.stringify(metadata, null, 2).slice(0, -2) + ",\n" +
    array("rows", savedRows) + ",\n" + array("constructed", savedExamples) + "\n}\n");
  console.log(JSON.stringify(report.summary));
} finally { for (const bridge of bridges) await bridge.close(); globalThis.WebSocket = originalWebSocket; await vite.close(); }
