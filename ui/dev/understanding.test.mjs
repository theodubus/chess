import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { FocusedAnalysis } from "../src/review/FocusedAnalysis";
import { StudyTree } from "../src/review/StudyTree";
import { explainMove } from "../src/review/explanations";
import { corpus, corpusInput } from "../src/review/understanding/corpus";
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
