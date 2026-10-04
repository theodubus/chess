import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { FocusedAnalysis } from "../src/review/FocusedAnalysis";
import { boardFromCommand } from "../src/review/StudyTree";
import { corpus, corpusInput } from "../src/review/understanding/corpus";
import { tacticalInput } from "../src/review/understanding/tacticalCases";
import { mechanismCases } from "../src/review/understanding/mechanismCases";
import { PedagogicalAnalysis } from "../src/review/understanding/PedagogicalAnalysis";
import { directExplanation } from "../src/review/directExplanation";
import { explainMove } from "../src/review/explanations";
import { mateConsequenceCases } from "../src/review/understanding/mateConsequenceTestEngine";
import { divertedDefenceCases } from "../src/review/understanding/divertedDefenceTestEngine";
import { DivertedDefenceVerification } from "../src/review/understanding/DivertedDefenceVerification";
import { divertedDefenceDraft } from "../src/review/understanding/divertedDefenceDraft";

for (const [name, command] of [["ShallowRed", process.env.CHESS_ENGINE_BINARY], ["Stockfish", process.env.CHESS_STOCKFISH_BINARY]]) {
  for (const id of ["allows-fork", "line-left", "queen-closes-retreat", "queen-closes-retreat-black", "fools-mate", "reverse-fools-mate", "legals-mate", "diverted-white", "diverted-black", "diverted-compensation"]) {
    it.skipIf(!command)(`${name} : raccordement revue ${id}`, async () => {
      const test = divertedDefenceCases.find((c) => "diverted-" + c.id === id) ?? mateConsequenceCases.find((c) => c.id === id) ?? (id === "allows-fork" ? tacticalInput(id).example.test : id.startsWith("queen-closes-retreat")
        ? corpus.find((c) => c.id === id) : { ...mechanismCases.find((c) => c.id === id), prefix: [] });
      const { position } = corpusInput(test), afterBoard = boardFromCommand(position.command);
      afterBoard.move(position.played);
      const after = { ...position, command: position.command + (position.command.includes(" moves ") ? " " : " moves ") + position.played,
        fen: afterBoard.fen(), turn: afterBoard.turn(), played: null, playedSan: null };
      const bridge = startBridge({ command, port: 0 }), initial = new FocusedAnalysis(300, 12000), analysis = new PedagogicalAnalysis(), diversion = new DivertedDefenceVerification();
      try {
        await once(bridge.server, "listening");
        vi.stubGlobal("WebSocket", class extends WebSocket {
          constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); }
        });
        const trace = [], protocol = [];
        const factory = async (failure) => {
          const engine = await connectDevelopmentEngine(failure, `ws://127.0.0.1:${bridge.server.address().port}`);
          engine.onLine((line) => { if (line.startsWith("info depth ") || line.startsWith("bestmove ")) { protocol.push(line); if (protocol.length > 100) protocol.shift(); } });
          const send = engine.send.bind(engine);
          engine.send = (line) => { if (line.startsWith("position ")) trace.push(line); send(line); };
          return engine;
        };
        const identity = { review: {}, revision: 0, engineId: name };
        const results = await initial.analyse({ ...identity, positions: [after] }, factory);
        // Le verdict négatif est fourni ici pour tester le raccordement, pas
        // pour mesurer la qualité du classificateur sur une position construite.
        const request = { ...identity, position, result: results?.[0] ?? null, category: "blunder" };
        const result = await analysis.analyse(request, factory);
        expect(result, analysis.error).not.toBeNull();
        expect(result.status, JSON.stringify({ error: analysis.error, checks: result.checks, trace, protocol })).not.toBe("unavailable");
        if (id === "fools-mate" || id === "reverse-fools-mate") expect(result.status).toBe("supported");
        expect(result.attempts).toBeLessThanOrEqual(2); expect(result.searches).toBeLessThanOrEqual(14);
        expect(trace.every((c) => c === position.command || c === after.command || c.startsWith(after.command + " "))).toBe(true);
        const view = directExplanation(explainMove(position, null, request.result, null, false), result.consequence);
        expect(view.comparison).toBeUndefined(); expect(view.candidate).toBeUndefined();
        if (result.status === "supported") {
          expect(view.concrete).toBe(true); expect(view.proof.steps[0].command).toBe(after.command);
          expect(view.proof.steps[0].move).toBeNull(); expect(view.proof.steps.length).toBeLessThanOrEqual(9);
          for (const step of view.proof.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
        } else { expect(view.proof).toBeUndefined(); expect(view.concrete).toBe(false); }
        console.info(JSON.stringify({ engine: name, case: id, status: result.status, title: result.consequence?.title ?? null,
          elapsedMs: result.elapsedMs, attempts: result.attempts, searches: result.searches, positions: result.consequence?.steps.length ?? 0,
          error: analysis.error, initialError: initial.error }));
        if (id.startsWith("diverted-")) {
          const report = await diversion.verify({ ...identity, position }, factory);
          expect(report, diversion.error).not.toBeNull(); expect(report.searches).toBeLessThanOrEqual(8);
          const draft = divertedDefenceDraft(position, report);
          if (draft) {
            expect(report.status).toBe("supported"); expect(draft.evidence.materialDelta).toBeLessThan(0);
            for (const step of draft.played) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
          } else expect(report.status).not.toBe("supported");
          console.info(JSON.stringify({ engine: name, case: id, verifier: "diversion", status: report.status, reason: report.reason,
            elapsedMs: report.elapsedMs, searches: report.searches, deltas: report.passes.map((p) => p.evidence?.materialDelta ?? null) }));
        }
      } finally { initial.stop(); analysis.stop(); diversion.stop(); await bridge.close(); vi.unstubAllGlobals(); }
    }, 30000);
  }
}
