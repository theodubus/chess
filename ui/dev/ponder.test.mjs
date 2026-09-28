import { once } from "node:events";
import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startBridge } from "./bridge.mjs";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { UciSession } from "../src/engine/UciSession";

for (const [name, command] of [
  ["ShallowRed", process.env.CHESS_ENGINE_BINARY],
  ["Stockfish", process.env.CHESS_STOCKFISH_BINARY],
]) {
  it.skipIf(!command)(
    `${name} : deux fils, ponderhit et annulation d’une anticipation réelle`,
    async () => {
      const bridge = startBridge({ command, port: 0 });
      let session;
      let latest;
      const board = new Chess();
      const position = () =>
        `position startpos moves ${board
          .history({ verbose: true })
          .map((m) => m.from + m.to + (m.promotion ?? ""))
          .join(" ")}`;
      const play = (uci) =>
        board.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci[4],
        });
      try {
        await once(bridge.server, "listening");
        vi.stubGlobal(
          "WebSocket",
          class extends WebSocket {
            constructor(url) {
              super(url, { origin: "http://127.0.0.1:5173" });
            }
          },
        );
        const engine = await connectDevelopmentEngine(
          (message) => session?.fail(message),
          `ws://127.0.0.1:${bridge.server.address().port}`,
        );
        session = new UciSession(
          engine,
          (snapshot) => {
            latest = snapshot;
          },
          5000,
          { threads: 2, ponder: true },
        );
        session.start();
        await vi.waitFor(() => expect(latest.state).toBe("ready"), {
          timeout: 5000,
        });
        expect(
          latest.log.some(
            (entry) => entry.line === "setoption name Threads value 2",
          ),
        ).toBe(true);
        const first = await session.search("position startpos", 150, "w");
        play(first);
        expect(session.ponderMove).toBeTruthy();
        play(session.ponderMove);
        const lastAnalysis = latest.analysis;
        session.ponder(position(), 100, board.turn());
        await vi.waitFor(() =>
          expect(
            latest.log.filter((entry) => entry.direction === "out").at(-1).line,
          ).toBe("go ponder movetime 100"),
        );
        // Dépasser le movetime ne doit pas faire jouer le moteur sur le temps humain.
        await new Promise((resolve) => setTimeout(resolve, 180));
        expect(latest.state).toBe("pondering");
        expect(latest.analysis).toEqual(lastAnalysis);
        play(await session.ponderHit());
        expect(latest.state).toBe("ready");
        const predicted = session.ponderMove;
        if (predicted) play(predicted);
        else board.move(board.moves()[0]);
        session.ponder(position(), 100, board.turn());
        await vi.waitFor(() =>
          expect(
            latest.log.filter((entry) => entry.direction === "out").at(-1).line,
          ).toBe("go ponder movetime 100"),
        );
        await session.cancelPonder();
        expect(latest.state).toBe("ready");
        expect(session.ponderMove).toBeNull();
        play(await session.search(position(), 50, board.turn()));
        expect(board.history()).toHaveLength(5);
      } finally {
        await session?.dispose();
        await bridge.close();
        vi.unstubAllGlobals();
      }
    },
    15000,
  );
}
