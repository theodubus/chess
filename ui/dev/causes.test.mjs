import { Chess } from "chess.js";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { FocusedAnalysis } from "../src/review/FocusedAnalysis";
import { explainMove } from "../src/review/explanations";
import { confirmCause } from "../src/review/decisionCause";
import { gamePositions } from "../src/review/model";

for (const [name, command] of [
  ["ShallowRed", process.env.CHESS_ENGINE_BINARY],
  ["Stockfish", process.env.CHESS_STOCKFISH_BINARY],
]) {
  it.skipIf(!command)(
    `${name} vérifie une dame perdue et limite la démonstration à sa capture`,
    async () => {
      const board = new Chess();
      for (const san of ["e4", "e5", "Qh5", "Nc6", "Qxe5+"]) board.move(san);
      const original = board.pgn();
      const positions = gamePositions(original).slice(-2);
      const bridge = startBridge({ command, port: 0 });
      const initial = new FocusedAnalysis(400, 8000);
      const focused = new FocusedAnalysis(1200, 8000);
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
        const request = { review: {}, revision: 0, engineId: name, positions };
        const results = await initial.analyse(request, factory);
        expect(results, initial.error).toHaveLength(2);
        const draft = explainMove(positions[0], results[0], results[1], {
          category: "blunder",
          loss: 0.5,
          reason: "",
        });
        expect(draft.candidate).toBeDefined();
        expect(draft.concrete).toBe(false);
        const checks = await focused.analyse(
          { ...request, positions: draft.candidate.positions },
          factory,
        );
        expect(checks, focused.error).toHaveLength(2);
        const explanation = confirmCause(draft, checks);
        expect(explanation.concrete).toBe(true);
        expect(explanation.summary).toContain("dame en e5");
        expect(explanation.proof.steps.map((step) => step.move.san)).toEqual([
          "Qxe5+",
          "Nxe5",
        ]);
        expect(explanation.candidate.positions[0].command).toBe(
          "position startpos moves e2e4 e7e5 d1h5 b8c6 h5e5 c6e5",
        );
        expect(explanation.comparison.steps).toHaveLength(1);
        expect(board.pgn()).toBe(original);
      } finally {
        initial.stop();
        focused.stop();
        await bridge.close();
        vi.unstubAllGlobals();
      }
    },
    20000,
  );
}
