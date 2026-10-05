import { Chess } from "chess.js";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { GameController } from "../src/GameController";
import { defaultArmy, matchPosition } from "../src/handicap";

function localSockets() {
  vi.stubGlobal("WebSocket", class extends WebSocket {
    constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); }
  });
}
const options = { threads: 1, ponder: false };

it.skipIf(!process.env.CHESS_ENGINE_BINARY)("fait jouer deux processus ShallowRed et ferme les deux au mat", async () => {
  const bridge = startBridge({ command: process.env.CHESS_ENGINE_BINARY, port: 0 });
  const controller = new GameController({
    initialFen: "7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1",
    timeControl: { initialMs: 2000, incrementMs: 0 },
  });
  try {
    await once(bridge.server, "listening"); localSockets();
    const url = `ws://127.0.0.1:${bridge.server.address().port}`;
    const factory = failure => connectDevelopmentEngine(failure, url);
    await controller.startMatch({
      w: { factory, options: { threads: 2, ponder: true } }, b: { factory, options },
    });
    await vi.waitFor(() => {
      controller.tick();
      expect(controller.snapshot?.error).toBe("");
      expect(controller.outcome?.reason).toBe("checkmate");
    }, { timeout: 6000, interval: 10 });
    expect(controller.game.chess.history()).toEqual(["Qxg7#"]);
    expect(controller.snapshotFor("w").name).toMatch(/ShallowRed/i);
    expect(controller.snapshotFor("b").name).toMatch(/ShallowRed/i);
    expect(controller.snapshotFor("w").log).toContainEqual({ direction: "out", line: "setoption name Threads value 2" });
    expect(controller.outcome.result).toBe("1-0");
    const exported = new Chess(); exported.loadPgn(controller.exportPgn());
    expect(exported.fen()).toBe(controller.game.chess.fen());
    await vi.waitFor(() => expect(bridge.server.clients.size).toBe(0), { timeout: 4000 });
  } finally {
    await controller.dispose(); await bridge.close(); vi.unstubAllGlobals();
  }
}, 15000);

it.skipIf(!process.env.CHESS_ENGINE_BINARY || !process.env.CHESS_STOCKFISH_BINARY)("joue ShallowRed contre Stockfish avec ponder et reprend le match après une pause", async () => {
  const bridge = startBridge({ command: process.env.CHESS_ENGINE_BINARY, port: 0,
    engines: [{ id: "stockfish", label: "Stockfish", command: process.env.CHESS_STOCKFISH_BINARY }] });
  const white = defaultArmy(), black = defaultArmy(); delete white.a8; delete black.h8;
  const initialFen = matchPosition({ w: white, b: black });
  const controller = new GameController({ initialFen, timeControl: {
    w: { initialMs: 5000, incrementMs: 100 }, b: { initialMs: 3000, incrementMs: 50 },
  } });
  let goal = 4, receivedAnalysis = false;
  const unsubscribe = controller.subscribe(() => {
    if (controller.snapshot?.analysis?.depth > 0) receivedAnalysis = true;
    if (!controller.paused && !controller.finished && controller.game.chess.history().length === goal)
      controller.pauseMatch();
  });
  try {
    await once(bridge.server, "listening"); localSockets();
    const base = `ws://127.0.0.1:${bridge.server.address().port}`;
    await controller.startMatch({
      w: { factory: failure => connectDevelopmentEngine(failure, base), options: { threads: 2, ponder: true } },
      b: { factory: failure => connectDevelopmentEngine(failure, `${base}?engine=stockfish`), options: { threads: 2, ponder: true } },
    });
    await vi.waitFor(() => {
      controller.tick(); expect(controller.snapshot?.error).toBe(""); expect(controller.paused).toBe(true);
    }, { timeout: 12000, interval: 10 });
    const before = controller.game.chess.fen(), times = controller.clock.remaining;
    expect(controller.game.chess.history()).toHaveLength(4);
    expect(controller.snapshotFor("w").name).toMatch(/ShallowRed/i);
    expect(controller.snapshotFor("b").name).toMatch(/Stockfish/i);
    await vi.waitFor(() => expect(bridge.server.clients.size).toBe(0), { timeout: 4000 });
    expect(controller.game.chess.fen()).toBe(before); expect(controller.clock.remaining).toEqual(times);
    goal = 8; await controller.reconnect();
    await vi.waitFor(() => {
      controller.tick(); expect(controller.snapshot?.error).toBe(""); expect(controller.paused).toBe(true);
    }, { timeout: 12000, interval: 10 });
    expect(controller.game.chess.history()).toHaveLength(8); expect(receivedAnalysis).toBe(true);
    controller.stopMatch();
    const exported = new Chess(); exported.loadPgn(controller.exportPgn());
    expect(exported.fen()).toBe(controller.game.chess.fen());
    expect(exported.getHeaders()).toMatchObject({ Result: "*", WhiteTimeControl: "5+0.1", BlackTimeControl: "3+0.05" });
    expect(exported.getHeaders()).toMatchObject({ SetUp: "1", FEN: initialFen });
    expect(exported.getHeaders().White).toMatch(/ShallowRed/i); expect(exported.getHeaders().Black).toMatch(/Stockfish/i);
    await vi.waitFor(() => expect(bridge.server.clients.size).toBe(0), { timeout: 4000 });
  } finally {
    unsubscribe(); await controller.dispose(); await bridge.close(); vi.unstubAllGlobals();
  }
}, 35000);
