import { afterEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { UciSession, type SessionSnapshot } from "./UciSession";
import type { EngineOptions } from "./options";

const sessions: UciSession[] = [];
afterEach(async () => {
  for (const session of sessions) await session.dispose();
  sessions.length = 0;
  vi.useRealTimers();
});
function setup(
  options: EngineOptions = { ponder: true, threads: 2 },
  advertise = true,
) {
  let receive!: (line: string) => void;
  let snapshot!: SessionSnapshot;
  const engine = {
    send: vi.fn(),
    dispose: vi.fn(async () => {}),
    onLine: (listener: (line: string) => void) => {
      receive = listener;
      return () => {};
    },
  };
  const session = new UciSession(
    engine,
    (value) => {
      snapshot = value;
    },
    100,
    options,
  );
  sessions.push(session);
  session.start();
  if (advertise) {
    receive("option name Ponder type check default false");
    receive("option name Threads type spin default 1 min 1 max 8");
  }
  receive("uciok");
  receive("readyok");
  return { session, engine, receive, snapshot: () => snapshot };
}
function position() {
  const board = new Chess();
  for (const move of ["e4", "e5", "Nf3"]) board.move(move);
  const moves = board
    .history({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ""));
  return `position startpos moves ${moves.join(" ")}`;
}

it("configure seulement les options annoncées avant ucinewgame", () => {
  const { engine } = setup();
  expect(engine.send.mock.calls.map(([line]) => line)).toEqual([
    "uci",
    "setoption name Threads value 2",
    "setoption name Ponder value true",
    "ucinewgame",
    "isready",
  ]);
  expect(setup({ ponder: false, threads: 1 }, false).snapshot().state).toBe(
    "ready",
  );
});
it.each([
  { ponder: true, threads: 1 },
  { ponder: false, threads: 2 },
])("refuse une option demandée mais non disponible : %j", (options) => {
  expect(setup(options, false).snapshot().state).toBe("error");
});
it.each([0, 1.5, 9, NaN])(
  "refuse un nombre de cœurs hors limites : %s",
  (threads) => {
    expect(setup({ ponder: false, threads }).snapshot().state).toBe("error");
  },
);
it("ne publie pas la position supposée, attend le coup humain puis reprend avec ponderhit", async () => {
  vi.useFakeTimers();
  const { session, engine, receive, snapshot } = setup();
  session.ponder(position(), 500, "b");
  receive("readyok");
  expect(engine.send).toHaveBeenLastCalledWith("go ponder movetime 500");
  receive("info depth 12 score cp 900 pv b8c6");
  expect(snapshot().analysis).toBeNull();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(snapshot().state).toBe("pondering");
  const result = session.ponderHit();
  expect(engine.send).toHaveBeenLastCalledWith("ponderhit");
  receive("info depth 13 score cp 12 pv b8c6");
  receive("bestmove b8c6 ponder f1c4");
  await expect(result).resolves.toBe("b8c6");
  expect(snapshot().analysis?.score?.value).toBe(-12);
  expect(session.ponderMove).toBe("f1c4");
});
it("attend le bestmove de stop et jette cette réponse avant une nouvelle position", async () => {
  const { session, engine, receive, snapshot } = setup();
  session.ponder(position(), 500, "b");
  receive("readyok");
  const cancel = session.cancelPonder();
  expect(engine.send).toHaveBeenLastCalledWith("stop");
  expect(snapshot().state).toBe("stopping");
  await expect(session.search(position())).rejects.toThrow("disponible");
  receive("bestmove b8c6 ponder f1c4");
  await cancel;
  expect(snapshot().state).toBe("ready");
  expect(session.ponderMove).toBeNull();
});
it.each([true, false])(
  "gère un coup humain reçu avant le readyok du ponder (prévu=%s)",
  async (hit) => {
    const { session, engine, receive, snapshot } = setup();
    session.ponder(position(), 500, "b");
    const result = hit ? session.ponderHit() : session.cancelPonder();
    receive("readyok");
    if (hit) {
      expect(engine.send).toHaveBeenLastCalledWith("go movetime 500");
      receive("bestmove b8c6");
    } else expect(engine.send).toHaveBeenLastCalledWith("isready");
    await result;
    expect(snapshot().state).toBe("ready");
    expect(
      engine.send.mock.calls.some(([line]) => line.startsWith("go ponder")),
    ).toBe(false);
  },
);
it("refuse un moteur qui répond pendant le tour humain", () => {
  const { session, receive, snapshot } = setup();
  session.ponder(position(), 500, "b");
  receive("readyok");
  receive("bestmove b8c6");
  expect(snapshot().state).toBe("error");
});
