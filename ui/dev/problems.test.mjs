import { Chess } from "chess.js";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { LiveStudy } from "../src/review/LiveStudy";
import { isCompleteMateLine } from "../src/review/completeMateLine";
import { importProblem } from "../src/problems/importProblem";
import { ProblemStudy } from "../src/problems/ProblemStudy";

for (const { name, command, budget } of [
  { name: "ShallowRed", command: process.env.CHESS_ENGINE_BINARY, budget: 1000 },
  { name: "ShallowRed", command: process.env.CHESS_ENGINE_BINARY, budget: 30000 },
  { name: "Stockfish", command: process.env.CHESS_STOCKFISH_BINARY, budget: 1000 },
]) {
  it.skipIf(!command)(`résout Pitschel jusqu'au mat avec ${name} (${budget} ms)`, async () => {
    const source = importProblem("r5rk/2p1Nppp/3p3P/pp2p1P1/4P3/2qnPQK1/8/R6R w - - 0 1");
    const study = new LiveStudy(), commands = [];
    const bridge = startBridge({ command, port: 0 });
    try {
      await once(bridge.server, "listening");
      vi.stubGlobal("WebSocket", class extends WebSocket {
        constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); }
      });
      const url = `ws://127.0.0.1:${bridge.server.address().port}`;
      await study.analyse(source.position.command, async failure => {
        const engine = await connectDevelopmentEngine(failure, url);
        return {
          send(line) { commands.push(line); engine.send(line); },
          onLine: listener => engine.onLine(listener),
          dispose: () => engine.dispose(),
        };
      }, budget, { completeMateLine: true });
      expect(study.error).toBe(""); expect(study.state).toBe("complete");
      expect(commands).toContain(`go movetime ${budget}`);
      expect(study.result.bestSan).toBe("hxg7+");
      expect(study.result.score).toEqual({ kind: "mate", value: 4, winner: "w" });
      expect(study.result.variation).toHaveLength(7);
      expect(isCompleteMateLine(study.result.score, "w", study.result.variation)).toBe(true);
      expect(new Chess(study.result.variation.at(-1).fen).isCheckmate()).toBe(true);
    } finally {
      await study.stop(); await bridge.close(); vi.unstubAllGlobals();
    }
  }, 40000);
}

for (const { name, command } of [
  { name: "ShallowRed", command: process.env.CHESS_ENGINE_BINARY },
  { name: "Stockfish", command: process.env.CHESS_STOCKFISH_BINARY },
]) {
  it.skipIf(!command)(`reconstruit la solution après une autre défense avec ${name}`, async () => {
    const study = new ProblemStudy(importProblem("r5rk/2p1Nppp/3p3P/pp2p1P1/4P3/2qnPQK1/8/R6R w - - 0 1"));
    const bridge = startBridge({ command, port: 0 });
    try {
      await once(bridge.server, "listening");
      vi.stubGlobal("WebSocket", class extends WebSocket {
        constructor(address) { super(address, { origin: "http://127.0.0.1:5173" }); }
      });
      const url = `ws://127.0.0.1:${bridge.server.address().port}`;
      const factory = failure => connectDevelopmentEngine(failure, url);
      await study.solve(factory, 1000);
      expect(study.live.error).toBe("");
      const original = [...study.nodes], originalLine = JSON.stringify(study.line);
      expect(study.tree.nodes[original[0]].uci).toBe("h6g7");
      const alternative = study.tree.nodes[original[1]].uci === "h8g7" ? "g8g7" : "h8g7";
      study.select(1);
      await study.reply(alternative.slice(0, 2), alternative.slice(2, 4), undefined, factory, 1000);
      expect(study.live.error).toBe(""); expect(study.nodes[0]).toBe(original[0]);
      expect(study.tree.nodes[study.nodes[1]].uci).toBe(alternative);
      expect(study.selected).toBe(2); expect(study.chosenReplies).toHaveLength(1);
      expect(study.result.score?.kind).toBe("mate"); expect(study.result.score?.winner).toBe("w");
      expect(isCompleteMateLine(study.result.score, "w", study.result.variation)).toBe(true);
      expect(new Chess(study.line.at(-1).fen).isCheckmate()).toBe(true);
      study.restoreSolution();
      expect(study.nodes).toEqual(original); expect(JSON.stringify(study.line)).toBe(originalLine);
    } finally {
      await study.stop(); await bridge.close(); vi.unstubAllGlobals();
    }
  }, 20000);
}
