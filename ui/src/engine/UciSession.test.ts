import { afterEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { FakeEngine } from "./FakeEngine";
import { UciSession, type SessionSnapshot } from "./UciSession";

afterEach(() => vi.useRealTimers());

it("attend uciok puis readyok avant de déclarer le moteur prêt", async () => {
  const engine = new FakeEngine();
  const snapshots: SessionSnapshot[] = [];
  const session = new UciSession(engine, (snapshot) =>
    snapshots.push(snapshot),
  );
  session.start();
  expect(snapshots.at(-1)?.state).toBe("connecting");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(snapshots.at(-1)?.state).toBe("ready");
  expect(snapshots.at(-1)?.name).toBe("Moteur factice");
  expect(snapshots.at(-1)?.log.map((entry) => entry.line)).toEqual([
    "uci",
    "id name Moteur factice",
    "id author Chess UI",
    "uciok",
    "ucinewgame",
    "isready",
    "readyok",
  ]);
  await session.dispose();
});

it("signale un moteur silencieux et libère ses ressources", async () => {
  vi.useFakeTimers();
  const engine = {
    send: vi.fn(),
    onLine: () => vi.fn(),
    dispose: vi.fn(async () => {}),
  };
  const update = vi.fn();
  const session = new UciSession(engine, update, 100);
  session.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(update.mock.lastCall?.[0].state).toBe("error");
  expect(engine.dispose).toHaveBeenCalledOnce();
  await session.dispose();
});

it("ignore les réponses tardives après déconnexion", async () => {
  const engine = new FakeEngine();
  const update = vi.fn();
  const session = new UciSession(engine, update);
  session.start();
  await session.dispose();
  const count = update.mock.calls.length;
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(count);
  expect(() => engine.send("uci")).toThrow("déconnecté");
});

it("refuse une commande contenant plusieurs lignes", () => {
  expect(() => new FakeEngine().send("uci\nisready")).toThrow(
    "une seule ligne",
  );
});

it("permet de retirer un abonnement", async () => {
  const engine = new FakeEngine();
  const listener = vi.fn();
  engine.onLine(listener)();
  engine.send("uci");
  await Promise.resolve();
  expect(listener).not.toHaveBeenCalled();
  await engine.dispose();
});

it("ne devient pas prêt si readyok arrive avant uciok", async () => {
  let emit: (line: string) => void = () => {};
  const engine = {
    send: vi.fn(),
    onLine: (listener: (line: string) => void) => {
      emit = listener;
      return () => {};
    },
    dispose: vi.fn(async () => {}),
  };
  const update = vi.fn();
  const session = new UciSession(engine, update);
  session.start();
  emit("readyok");
  expect(update.mock.lastCall?.[0].state).toBe("connecting");
  emit("uciok");
  expect(engine.send).toHaveBeenLastCalledWith("isready");
  emit("readyok");
  expect(update.mock.lastCall?.[0].state).toBe("ready");
  await session.dispose();
});

it("interrompt une recherche silencieuse au lieu de bloquer la partie", async () => {
  vi.useFakeTimers();
  const engine = new FakeEngine();
  const update = vi.fn();
  const session = new UciSession(engine, update, 100);
  session.start();
  await vi.advanceTimersByTimeAsync(0);
  vi.spyOn(engine, "send").mockImplementation(() => {});
  const search = session.search("position startpos moves e2e4");
  const rejected = expect(search).rejects.toThrow("Délai");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(update.mock.lastCall?.[0].state).toBe("error");
  await session.dispose();
});

it("rejette la recherche en cours lors de la fermeture", async () => {
  const engine = new FakeEngine();
  const session = new UciSession(engine, () => {});
  session.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.spyOn(engine, "send").mockImplementation(() => {});
  const rejected = expect(
    session.search("position startpos moves e2e4"),
  ).rejects.toThrow("fermée");
  await session.dispose();
  await rejected;
});

it("associe les infos à la recherche, garde le signe après bestmove et efface avant la suivante", async () => {
  let emit: (line: string) => void = () => {};
  const engine = {
    send: vi.fn(),
    onLine: (listener: (line: string) => void) => {
      emit = listener;
      return () => {};
    },
    dispose: vi.fn(async () => {}),
  };
  let latest!: SessionSnapshot;
  const session = new UciSession(engine, (snapshot) => {
    latest = snapshot;
  });
  session.start();
  emit("uciok");
  emit("readyok");
  emit("info depth 99 score cp 900");
  expect(latest.analysis).toBeNull();
  const search = session.search("position startpos moves e2e4", 500, "b");
  emit("readyok");
  emit("info depth 8 score cp 125");
  expect(latest.analysis).toEqual({
    depth: 8,
    score: { kind: "cp", value: -125 },
  });
  emit("info depth 9");
  expect(latest.analysis?.depth).toBe(9);
  expect(latest.analysis?.score?.value).toBe(-125);
  emit("bestmove e7e5");
  await expect(search).resolves.toBe("e7e5");
  expect(latest.analysis?.score?.value).toBe(-125);
  emit("info depth 99 score cp 900");
  expect(latest.analysis?.depth).toBe(9);
  const next = session.search(
    "position startpos moves e2e4 e7e5 g1f3",
    500,
    "b",
  );
  expect(latest.analysis).toBeNull();
  const rejected = expect(next).rejects.toThrow("Connexion perdue");
  session.fail("Connexion perdue");
  await rejected;
  expect(latest.analysis).toBeNull();
  await session.dispose();
});

it("associe la variante à la profondeur et ne réutilise pas celle d’une autre recherche", async () => {
  let emit: (line: string) => void = () => {};
  const engine = {
    send: vi.fn(),
    onLine: (listener: (line: string) => void) => {
      emit = listener;
      return () => {};
    },
    dispose: async () => {},
  };
  let latest!: SessionSnapshot;
  const session = new UciSession(engine, (snapshot) => {
    latest = snapshot;
  });
  session.start();
  emit("uciok");
  emit("readyok");
  const search = session.search("position startpos", 100);
  emit("readyok");
  emit("info depth 1 score cp 10 pv e2e4 e7e5");
  expect(latest.analysis?.pv).toEqual(["e2e4", "e7e5"]);
  emit("info depth 2");
  expect(latest.analysis?.pv).toBeUndefined();
  emit("info depth 2 score cp 15 pv d2d4 d7d5");
  emit("bestmove d2d4");
  await search;
  expect(latest.analysis?.pv).toEqual(["d2d4", "d7d5"]);
  const next = session.search("position startpos moves d2d4", 100, "b");
  const rejected = expect(next).rejects.toThrow("fermée");
  expect(latest.analysis).toBeNull();
  await session.dispose();
  await rejected;
});

it("préfère la dernière itération exacte à une borne interrompue seulement pour le même meilleur coup", async () => {
  const board = new Chess();
  expect(board.moves()).toContain("e4");
  expect(board.moves()).toContain("d4");
  let emit: (line: string) => void = () => {};
  const engine = {
    send: vi.fn(),
    onLine: (listener: (line: string) => void) => {
      emit = listener;
      return () => {};
    },
    dispose: async () => {},
  };
  let latest!: SessionSnapshot;
  const session = new UciSession(engine, (snapshot) => {
    latest = snapshot;
  });
  session.start();
  emit("uciok");
  emit("readyok");
  const first = session.search("position startpos", 100);
  emit("readyok");
  emit("info depth 8 score cp 30 pv e2e4");
  emit("info depth 9 score cp 80 lowerbound pv e2e4");
  expect(latest.analysis?.score?.bound).toBe("lower");
  emit("bestmove e2e4");
  await first;
  expect(latest.analysis).toEqual({
    depth: 8,
    score: { kind: "cp", value: 30 },
    pv: ["e2e4"],
  });
  const next = session.search("position startpos", 100);
  emit("readyok");
  emit("info depth 8 score cp 30 pv e2e4");
  emit("info depth 9 score cp 80 lowerbound pv d2d4");
  emit("bestmove d2d4");
  await next;
  expect(latest.analysis?.score?.bound).toBe("lower");
  const last = session.search("position startpos", 100);
  emit("readyok");
  emit("info depth 1 score cp 20 upperbound pv e2e4");
  emit("bestmove e2e4");
  await last;
  expect(latest.analysis?.score?.bound).toBe("upper");
  expect(latest.analysis?.depth).toBe(1);
  await session.dispose();
});
