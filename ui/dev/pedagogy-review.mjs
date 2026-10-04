import { once } from "node:events";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  engine: { type: "string", default: process.env.CHESS_ENGINE_BINARY ?? "../target/release/shallowred" },
  stockfish: { type: "string", default: process.env.CHESS_STOCKFISH_BINARY },
  output: { type: "string", default: "dev/pedagogy-review-data.json" },
  cases: { type: "string" },
} });
const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
const load = (name) => vite.ssrLoadModule(`/src/review/understanding/${name}.ts`);
const originalWebSocket = globalThis.WebSocket;

try {
  const [{ tacticalInput }, { TacticalVerification, TacticalEffectVerification }, { tacticalDraft }, { MateVerification }, { mateDraft },
    { corpus, corpusInput }, { externalCorpus }, { decisionContext }, { tacticalConstraints }, { moveLabel }, { connectDevelopmentEngine },
    { understandDecision }, { RestrictionEffectVerification }, { restrictionDraft }, { divertedDefenceCases }, { DivertedDefenceVerification }, { divertedDefenceDraft },
    { ignoredThreatCases }, { ignoredThreat }, { IgnoredThreatVerification }, { ignoredThreatDraft },
    { movedPieceCases }, { movedPieceExposure }, { MovedPieceVerification }, { captureLossDraft }] = await Promise.all([
    load("tacticalCases"), load("TacticalVerification"), load("tacticalDraft"), load("MateVerification"), load("mateDraft"),
    load("corpus"), load("externalCorpus"), load("context"), load("constraints"), load("draftModel"), vite.ssrLoadModule("/src/engine/DevelopmentEngine.ts"),
    load("prototype"), load("RestrictionEffectVerification"), load("restrictionDraft"),
    load("divertedDefenceTestEngine"), load("DivertedDefenceVerification"), load("divertedDefenceDraft"),
    load("ignoredThreatTestEngine"), load("ignoredThreat"), load("IgnoredThreatVerification"), load("ignoredThreatDraft"),
    load("movedPieceTestEngine"), load("movedPieceExposure"), load("MovedPieceVerification"), load("captureLossDraft"),
  ]);
  const allCases = ["queen-closes-retreat", "queen-closes-retreat-black", "allows-fork-direct", "allows-fork", "allows-fork-other-defence", "allows-fork-white", "allows-fork-false-defence", "pin-retreat", "fork-direct", "fork-black", "byrne-22", "byrne-allows-fork", "morphy-31", "diverted-white", "diverted-black", "diverted-compensation", "diverted-pin-white", "diverted-pin-black", "diverted-unconstrained", "diverted-relative"];
  allCases.push("diverted-pin-queen-white", "diverted-pin-queen-black");
  allCases.push("ignored-white", "ignored-black", "ignored-history", "ignored-compensation");
  allCases.push(...movedPieceCases.map(c => "moved-" + c.id));
  const selectedCases = values.cases ? values.cases.split(",") : allCases;
  if (!selectedCases.length || selectedCases.some((id) => !allCases.includes(id))) throw new Error("Exemples demandés inconnus.");
  // Adaptateur Node de cet outil local, comme celui des essais UCI. Aucun
  // transport n'entre dans la vue, qui ne lit qu'un instantané de brouillons.
  globalThis.WebSocket = class extends WebSocket {
    constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); }
  };
  const examples = [];
  for (const [engine, path] of [["ShallowRed", values.engine], ["Stockfish", values.stockfish]]) {
    if (!path) continue;
    const command = resolve(root, path), engineHash = createHash("sha256").update(await readFile(command)).digest("hex");
    const bridge = startBridge({ command, port: 0 });
    try {
      await once(bridge.server, "listening");
      let engineName = engine;
      const factory = async (failure) => {
        const adapter = await connectDevelopmentEngine(failure, `ws://127.0.0.1:${bridge.server.address().port}`);
        adapter.onLine((line) => { if (line.startsWith("id name ")) engineName = line.slice(8); });
        return adapter;
      };
      for (const id of selectedCases) {
        let input, check, build, source, origin;
        if (id.startsWith("moved-")) {
          const test = movedPieceCases.find(c => "moved-" + c.id === id), { position, result } = corpusInput(test), understanding = understandDecision(position, result);
          input = { position, threat: movedPieceExposure(understanding), understanding };
          check = new MovedPieceVerification(); build = (_understanding, report) => captureLossDraft(position, report);
          source = test.notes; origin = "constructed";
        } else if (id.startsWith("ignored-")) {
          const test = ignoredThreatCases.find(c => "ignored-" + c.id === id), { position, result } = corpusInput(test), understanding = understandDecision(position, result);
          input = { position, threat: ignoredThreat(understanding), understanding };
          check = new IgnoredThreatVerification(); build = (_understanding, report) => ignoredThreatDraft(position, report);
          source = test.notes; origin = "constructed";
        } else if (id.startsWith("diverted-")) {
          const test = divertedDefenceCases.find((c) => "diverted-" + c.id === id), { position, result } = corpusInput(test);
          input = { position, understanding: { context: decisionContext(position, result) } };
          check = new DivertedDefenceVerification(); build = (_understanding, report) => divertedDefenceDraft(position, report);
          source = test.notes; origin = "constructed";
        } else if (id.startsWith("queen-closes-retreat")) {
          const test = corpus.find((c) => c.id === id), { position, result } = corpusInput(test), understanding = understandDecision(position, result);
          input = { understanding, hypothesisIndex: understanding.hypotheses.findIndex((h) => h.kind === "allows-restriction") };
          check = new RestrictionEffectVerification([200, 600], 25000); build = restrictionDraft;
          source = test.notes; origin = test.origin;
        } else if (id === "morphy-31") {
          const test = externalCorpus.find((c) => c.id === id);
          const { position, result } = corpusInput(test), context = decisionContext(position, result), constraints = tacticalConstraints(context);
          input = { understanding: { context, constraints }, hypothesisIndex: constraints.hypotheses.findIndex((h) => h.kind === "deflection-mate"), alternative: "b3a3" };
          check = new MateVerification([200, 600], 25000); build = mateDraft; source = test.notes; origin = "published";
        } else {
          input = tacticalInput(id === "allows-fork-direct" ? "allows-fork" : id);
          check = id === "allows-fork-direct" ? new TacticalEffectVerification([200, 600], 25000) : new TacticalVerification([200, 600], 25000); build = tacticalDraft;
          source = input.example.test.notes; origin = input.example.test.origin;
        }
        const context = input.understanding.context;
        try {
          const request = { ...input, review: {}, revision: 0, engineId: engine };
          if (id === "allows-fork-direct") delete request.alternative;
          const report = await check.verify(request, factory);
          const draft = report ? build(input.understanding, report) : null;
          examples.push({ id, capturedAt: new Date().toISOString(), label: `${context.before.fen.split(" ")[5]}${context.before.turn === "b" ? "…" : "."} ${moveLabel(context.before, context.moves[context.decision].lan)}`, source, origin, engine, engineName, engineHash,
            beforeFen: context.before.fen, afterFen: context.after.fen, state: report?.status ?? "unavailable",
            reason: report?.attribution?.reason ?? report?.reason ?? "engine-unavailable", error: check.error || null,
            elapsedMs: report?.elapsedMs ?? 0, searches: report?.searches ?? 0, draft,
            ...(/^(diverted|ignored|moved)-/.test(id) ? { verification: report } : {}) });
          console.log(`${engineName} • ${id} : ${draft ? "brouillon à relire" : "abstention"} (${report?.reason ?? check.error})`);
        } finally { check.stop(); }
      }
    } finally { await bridge.close(); }
  }
  const document = { schema: 1, generatedAt: new Date().toISOString(), publishable: false, independentSample: false, examples };
  await writeFile(resolve(root, values.output), `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${examples.length} exemples enregistrés. Aperçu : /dev/pedagogy-review.html (npm run dev).`);
} finally { globalThis.WebSocket = originalWebSocket; await vite.close(); }
