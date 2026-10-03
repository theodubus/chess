import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { FocusedAnalysis, usableResult } from "../src/review/FocusedAnalysis";
import {
  parseSearchInfo,
  parsePrincipalVariation,
} from "../src/engine/analysis";
import { legalVariation } from "../src/review/model";
import { boardFromCommand, StudyTree } from "../src/review/StudyTree";
import { explainMove } from "../src/review/explanations";
import {
  assessDecision,
  corpus,
  corpusInput,
} from "../src/review/understanding/corpus";
import { externalCorpus } from "../src/review/understanding/externalCorpus";
import { RelationVerification } from "../src/review/understanding/RelationVerification";
import { relationDraft } from "../src/review/understanding/relationDraft";
import {
  mechanismCases,
  mechanismInput,
} from "../src/review/understanding/mechanismCases";
import { Verification } from "../src/review/understanding/Verification";
import verificationCases from "../src/review/understanding/verificationCases.json";
import { understandDecision } from "../src/review/understanding/prototype";

for (const [name, command] of [
  ["ShallowRed", process.env.CHESS_ENGINE_BINARY],
  ["Stockfish", process.env.CHESS_STOCKFISH_BINARY],
]) {
  it.skipIf(!command)(
    `${name} : distingue la réponse trouvée, les faits de restriction et la cause encore à vérifier`,
    async () => {
      const { position } = corpusInput(
        corpus.find((test) => test.id === "queen-closes-retreat"),
      );
      const tree = new StudyTree(position);
      const node = tree.play(
        0,
        position.played.slice(0, 2),
        position.played.slice(2, 4),
      );
      const bridge = startBridge({ command, port: 0 }),
        focus = new FocusedAnalysis(800, 8000);
      try {
        await once(bridge.server, "listening");
        vi.stubGlobal(
          "WebSocket",
          class extends WebSocket {
            constructor(address) {
              super(address, { origin: "http://127.0.0.1:5173" });
            }
          },
        );
        const factory = (failure) =>
          connectDevelopmentEngine(
            failure,
            `ws://127.0.0.1:${bridge.server.address().port}`,
          );
        const results = await focus.analyse(
          {
            review: {},
            revision: 0,
            engineId: name,
            positions: [position, tree.position(node)],
          },
          factory,
        );
        expect(results, focus.error).toHaveLength(2);
        expect(results[1].bestMove).toBe("f5f4");
        const baseline = explainMove(position, results[0], results[1], {
          category: "blunder",
          reason: "",
          loss: 0.5,
        });
        const prototype = understandDecision(position, results[1]);
        expect(prototype.hypotheses).toContainEqual(
          expect.objectContaining({
            kind: "allows-restriction",
            victimSquare: "e3",
            status: "hypothesis",
          }),
        );
        expect(prototype.hypotheses[0].closedRoutes).toContainEqual(
          expect.objectContaining({ from: "e3", to: "d2", blocker: "d2" }),
        );
        expect(prototype.explanation).toBeNull();
        expect(baseline.concrete).toBe(false);
        console.info(
          JSON.stringify({
            engine: name,
            bestReply: results[1].bestMove,
            previousExplanation: baseline.concrete,
            prototypeHypotheses: prototype.hypotheses.map((h) => h.kind),
            publishableExplanation: false,
          }),
        );
      } finally {
        focus.stop();
        await bridge.close();
        vi.unstubAllGlobals();
      }
    },
    20000,
  );
}

for (const [name, command] of [
  ["ShallowRed", process.env.CHESS_ENGINE_BINARY],
  ["Stockfish", process.env.CHESS_STOCKFISH_BINARY],
]) {
  for (const test of [
    corpus.find((c) => c.id === "queen-closes-retreat"),
    {
      ...corpus.find((c) => c.id === "queen-closes-retreat"),
      id: "explicit-retreat-comparison",
      alternative: "g1h1",
    },
    {
      ...corpus.find((c) => c.id === "queen-closes-retreat"),
      id: "explicit-attacker-capture",
      alternative: "e4f5",
    },
    ...verificationCases,
  ]) {
    it.skipIf(!command)(
      `${name} : vérification comparative ${test.id}`,
      async () => {
        const { position, result } = corpusInput({ prefix: [], ...test });
        const understanding = understandDecision(position, result),
          check = new Verification([200, 600], 25000),
          bridge = startBridge({ command, port: 0 });
        try {
          await once(bridge.server, "listening");
          vi.stubGlobal(
            "WebSocket",
            class extends WebSocket {
              constructor(address) {
                super(address, { origin: "http://127.0.0.1:5173" });
              }
            },
          );
          const report = await check.verify(
            {
              review: {},
              revision: 0,
              engineId: name,
              understanding,
              hypothesisIndex: 0,
              alternative: test.alternative,
            },
            (failure) =>
              connectDevelopmentEngine(
                failure,
                `ws://127.0.0.1:${bridge.server.address().port}`,
              ),
          );
          expect(report, check.error).not.toBeNull();
          expect(report.explanation).toBeNull();
          expect(report.searches).toBeLessThanOrEqual(10);
          if (test.family !== "restricted-piece")
            expect(report.status).not.toBe("supported");
          if (test.id === "other-piece-captures-attacker")
            expect(
              report.passes.some((p) => p.evidence?.outcome === "preserved"),
            ).toBe(true);
          if (
            ["mate-outweighs-restriction", "sacrifice-before-mate"].includes(
              test.id,
            )
          )
            expect(
              report.passes.every(
                (p) => p.evidence?.outcome === "mate-for-victim",
              ),
            ).toBe(true);
          if (test.id === "explicit-retreat-comparison") {
            expect(
              report.passes.every(
                (p) => p.contrast.reason === "restored-route",
              ),
            ).toBe(true);
            expect(
              report.passes.some(
                (p) =>
                  p.contrast.usedRoute &&
                  p.contrast.evidence?.outcome === "preserved",
              ),
            ).toBe(true);
          }
          if (test.id === "explicit-attacker-capture") {
            expect(
              report.passes.every(
                (p) => p.contrast.reason === "attacker-removed",
              ),
            ).toBe(true);
            expect(
              report.passes.every((p) =>
                p.questions.every((q) => q.purpose !== "same-threat"),
              ),
            ).toBe(true);
            expect(report.searches).toBeLessThanOrEqual(8);
          }
          console.info(
            JSON.stringify({
              engine: name,
              case: test.id,
              status: report.status,
              reason: report.reason,
              comparison: report.comparison,
              attribution: report.attribution,
              searches: report.searches,
              elapsedMs: report.elapsedMs,
              passes: report.passes.map((p) => ({
                depth: p.questions.find((q) => q.purpose === "defence").result
                  .depth,
                score: p.questions.find((q) => q.purpose === "defence").result
                  .score,
                evidence: p.evidence,
                alternative: p.alternative,
                contrast: p.contrast,
              })),
            }),
          );
        } finally {
          check.stop();
          await bridge.close();
          vi.unstubAllGlobals();
        }
      },
      30000,
    );
  }
}

for (const [name, command] of [
  ["ShallowRed", process.env.CHESS_ENGINE_BINARY],
  ["Stockfish", process.env.CHESS_STOCKFISH_BINARY],
]) {
  for (const test of mechanismCases.filter(
    (c) =>
      c.origin === "constructed" &&
      (c.expected === "supported" || c.id === "target-can-leave"),
  )) {
    it.skipIf(!command)(
      `${name} : relations causales ${test.id}`,
      async () => {
        const input = mechanismInput(test),
          check = new RelationVerification([200, 600], 25000),
          bridge = startBridge({ command, port: 0 });
        try {
          await once(bridge.server, "listening");
          vi.stubGlobal(
            "WebSocket",
            class extends WebSocket {
              constructor(address) {
                super(address, { origin: "http://127.0.0.1:5173" });
              }
            },
          );
          const trace = [];
          const factory = async (failure) => {
            const engine = await connectDevelopmentEngine(
              failure,
              `ws://127.0.0.1:${bridge.server.address().port}`,
            );
            let query;
            const send = engine.send.bind(engine);
            engine.send = (line) => {
              if (line.startsWith("position ")) {
                query = { command: line, answers: [] };
                trace.push(query);
              }
              send(line);
            };
            engine.onLine((line) => {
              if (query && /^(info depth |bestmove )/.test(line)) {
                query.answers.push(line);
                if (query.answers.length > 4) query.answers.shift();
              }
            });
            return engine;
          };
          const report = await check.verify(
            {
              ...input,
              review: {},
              revision: 0,
              engineId: name,
              alternative: test.alternativeUci,
            },
            factory,
          );
          if (!report) {
            // Une vraie réponse UCI peut rester bornée après une itération
            // interrompue. Vérifier ce refus précis, sans tolérer une panne.
            expect(check.state).toBe("error");
            expect(check.error).toContain(
              "Réponse moteur sans score exact ou variante exploitable.",
            );
            const query = trace.at(-1);
            const board = boardFromCommand(query.command);
            const infoLine = query.answers.findLast((line) =>
              line.includes(" score "),
            );
            const info = parseSearchInfo(infoLine ?? "", board.turn());
            const bestMove = query.answers
              .findLast((line) => line.startsWith("bestmove "))
              ?.split(" ")[1];
            const position = {
              command: query.command,
              fen: board.fen(),
              turn: board.turn(),
              label: "Contrôle du refus",
              played: null,
              playedSan: null,
              terminal: null,
            };
            const response = {
              score: info?.score ?? null,
              depth: info?.depth ?? null,
              bestMove,
              bestSan: null,
              variation: legalVariation(
                board.fen(),
                parsePrincipalVariation(infoLine ?? "") ?? [],
              ),
            };
            expect(response.score?.bound, JSON.stringify(query)).toBeDefined();
            expect(usableResult(position, response)).toBe(false);
            // La même ligne avec un score exact serait recevable : cela
            // distingue la borne d'une position ou d'un coup incohérents.
            expect(
              usableResult(position, {
                ...response,
                score: { ...response.score, bound: undefined },
              }),
            ).toBe(true);
            console.info(
              JSON.stringify({
                engine: name,
                case: test.id,
                status: "unavailable",
                reason: "bounded-final-iteration",
                explanation: null,
                query,
              }),
            );
            return;
          }
          expect(report.explanation).toBeNull();
          expect(report.searches).toBeLessThanOrEqual(10);
          if (test.id === "target-can-leave")
            expect(report.attribution.status).toBe("not-established");
          const draft = relationDraft(input.understanding, report);
          if (report.attribution.status === "supported") {
            expect(
              report.passes.every(
                (p) => p.matched && p.evidence.outcome === "loss-in-line",
              ),
            ).toBe(true);
            expect(draft.played[0].fen).toBe(
              input.understanding.context.after.fen,
            );
            expect(draft.played.length).toBeLessThanOrEqual(9);
          } else expect(draft).toBeNull();
          console.info(
            JSON.stringify({
              engine: name,
              case: test.id,
              status: report.status,
              reason: report.reason,
              attribution: report.attribution,
              searches: report.searches,
              elapsedMs: report.elapsedMs,
              draft: draft
                ? {
                    illustration: draft.illustration,
                    limitation: draft.limitation,
                    title: draft.title,
                    summary: draft.summary,
                    comparison: draft.comparisonText,
                    played: draft.played.map((s) => s.label),
                    alternative: draft.alternative.map((s) => s.label),
                  }
                : null,
              passes: report.passes.map((p) => ({
                matched: p.matched,
                evidence: p.evidence,
                score: p.score,
                alternative: p.alternative,
                contrast: p.contrast,
              })),
            }),
          );
        } finally {
          check.stop();
          await bridge.close();
          vi.unstubAllGlobals();
        }
      },
      30000,
    );
  }
}

for (const [name, command] of [
  ["ShallowRed", process.env.CHESS_ENGINE_BINARY],
  ["Stockfish", process.env.CHESS_STOCKFISH_BINARY],
]) {
  for (const id of ["morphy-31", "byrne-34"]) {
    it.skipIf(!command)(
      `${name} : partie publiée ${id}, réponse moteur distincte du PGN`,
      async () => {
        const test = externalCorpus.find((c) => c.id === id);
        const { position } = corpusInput(test);
        const tree = new StudyTree(position);
        const node = tree.play(
          0,
          position.played.slice(0, 2),
          position.played.slice(2, 4),
        );
        const after = tree.position(node);
        const focus = new FocusedAnalysis(600, 12000);
        const bridge = startBridge({ command, port: 0 });
        try {
          await once(bridge.server, "listening");
          vi.stubGlobal(
            "WebSocket",
            class extends WebSocket {
              constructor(address) {
                super(address, { origin: "http://127.0.0.1:5173" });
              }
            },
          );
          const factory = (failure) =>
            connectDevelopmentEngine(
              failure,
              `ws://127.0.0.1:${bridge.server.address().port}`,
            );
          const results = await focus.analyse(
            {
              review: {},
              revision: 0,
              engineId: name,
              positions: [position, after],
            },
            factory,
          );
          expect(results, focus.error).toHaveLength(2);
          expect(usableResult(position, results[0])).toBe(true);
          expect(usableResult(after, results[1])).toBe(true);
          if (id === "morphy-31") {
            // Ce coup est le seul légal, constaté avant d'ajouter le test. Le mat
            // est proche, sans attente figée sur la profondeur ou sa distance UCI.
            expect(results[1].bestMove).toBe("d7b8");
            expect(results[1].score.kind).toBe("mate");
          }
          const understanding = understandDecision(position, results[1]);
          const assessment = assessDecision(test, understanding);
          expect(understanding.context.priorHistory).toBe("complete");
          expect(understanding.explanation).toBeNull();
          expect(assessment.matched).toBe(false);
          console.info(
            JSON.stringify({
              engine: name,
              case: id,
              source: test.notes,
              commands: [position.command, after.command],
              historicalDecision: position.played,
              results: results.map((r) => ({
                score: r.score,
                depth: r.depth,
                bestMove: r.bestMove,
                pv: r.variation.map((m) => m.label),
              })),
              mainIdeaRecognized: assessment.matched,
              hypotheses: assessment.observed,
              publishableExplanation: false,
            }),
          );
        } finally {
          focus.stop();
          await bridge.close();
          vi.unstubAllGlobals();
        }
      },
      20000,
    );
  }
}
