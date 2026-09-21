import { Chess } from "chess.js";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { GameReview } from "../src/review/GameReview";

it.skipIf(!process.env.CHESS_ENGINE_BINARY)(
  "analyse une partie terminée et interrompt une recherche avec le vrai moteur",
  async () => {
    const board = new Chess();
    for (const move of ["f3", "e5", "g4", "Qh4#"]) board.move(move);
    expect(board.isCheckmate()).toBe(true);
    const original = board.pgn();
    const review = new GameReview(original);
    const bridge = startBridge({
      command: process.env.CHESS_ENGINE_BINARY,
      port: 0,
    });
    try {
      await once(bridge.server, "listening");
      const url = `ws://127.0.0.1:${bridge.server.address().port}`;
      vi.stubGlobal(
        "WebSocket",
        class extends WebSocket {
          constructor(address) {
            super(address, { origin: "http://127.0.0.1:5173" });
          }
        },
      );
      const factory = (failure) => connectDevelopmentEngine(failure, url);
      await review.start(factory, 100);
      expect(review.error).toBe("");
      expect(review.state).toBe("complete");
      expect(review.completed).toBe(5);
      for (let index = 0; index < 4; index++) {
        const result = review.results[index];
        expect(result.depth).toBeGreaterThan(0);
        expect(result.score).not.toBeNull();
        expect(result.variation.length).toBeGreaterThan(0);
        const position = new Chess(review.positions[index].fen);
        const move = position.move({
          from: result.bestMove.slice(0, 2),
          to: result.bestMove.slice(2, 4),
          promotion: result.bestMove[4],
        });
        expect(move).toBeTruthy();
        expect(result.variation[0].fen).toBe(position.fen());
      }
      expect(review.results[4].score).toEqual({
        kind: "mate",
        value: 0,
        winner: "b",
      });
      expect(review.annotations[2]?.category).toBe("blunder");
      expect(review.annotations[3]?.category).toBe("great");
      expect(review.annotations[4]).toBeNull();
      expect(board.pgn()).toBe(original);
      const task = review.start(factory, 3000);
      await vi.waitFor(() => expect(review.liveDepth).toBeGreaterThan(0));
      await review.stop();
      await task;
      expect(review.state).toBe("stopped");
      expect(board.pgn()).toBe(original);
    } finally {
      await review.stop();
      await bridge.close();
      vi.unstubAllGlobals();
    }
  },
  20000,
);
