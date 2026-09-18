import { Chess } from "chess.js";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { GameReview } from "../src/review/GameReview";
import { importPgn } from "../src/importPgn";

it.skipIf(
  !process.env.CHESS_STOCKFISH_BINARY || !process.env.CHESS_ENGINE_BINARY,
)(
  "réanalyse un PGN importé avec Stockfish puis ShallowRed sans mélanger leurs résultats",
  async () => {
    const game = new Chess();
    for (const move of ["e4", "e5"]) game.move(move);
    const pgn = importPgn(game.pgn());
    const review = new GameReview(pgn);
    const bridge = startBridge({
      command: process.env.CHESS_ENGINE_BINARY,
      port: 0,
      engines: [
        {
          id: "stockfish",
          label: "Stockfish",
          command: process.env.CHESS_STOCKFISH_BINARY,
        },
      ],
    });
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
      const url = `ws://127.0.0.1:${bridge.server.address().port}`;
      await review.start(
        (failure) =>
          connectDevelopmentEngine(failure, `${url}/?engine=stockfish`),
        100,
      );
      expect(review.state).toBe("complete");
      expect(review.engineName).toMatch(/Stockfish/i);
      expect(
        review.results.every((result) => result?.score && result?.depth > 0),
      ).toBe(true);
      const names = [];
      const unsubscribe = review.subscribe(() => names.push(review.engineName));
      await review.start(
        (failure) => connectDevelopmentEngine(failure, url),
        100,
      );
      unsubscribe();
      expect(names[0]).toBe("");
      expect(review.engineName).toMatch(/ShallowRed/i);
      expect(review.state).toBe("complete");
      expect(review.positions.at(-1).fen).toBe(game.fen());
      expect(review.completed).toBe(3);
    } finally {
      await review.stop();
      await bridge.close();
      vi.unstubAllGlobals();
    }
  },
  30000,
);
