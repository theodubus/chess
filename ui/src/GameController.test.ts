import { afterEach, expect, it, vi } from "vitest";
import { GameController } from "./GameController";
import type { Engine } from "./engine/Engine";

class ControlledEngine implements Engine {
  commands: string[] = [];
  listeners = new Set<(line: string) => void>();
  disposed = false;
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") queueMicrotask(() => this.emit("uciok"));
    if (command === "isready") queueMicrotask(() => this.emit("readyok"));
  }
  emit(line: string) {
    for (const listener of this.listeners) listener(line);
  }
  onLine(listener: (line: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async dispose() {
    this.disposed = true;
  }
}
const controllers: GameController[] = [];
afterEach(async () => {
  for (const controller of controllers) await controller.disconnect();
  controllers.length = 0;
});

async function setup() {
  const controller = new GameController({ now: () => 0 });
  controllers.push(controller);
  const engine = new ControlledEngine();
  await controller.connect("local", async () => engine);
  await vi.waitFor(() => expect(controller.snapshot?.state).toBe("ready"));
  return { controller, engine };
}
async function reply(
  controller: GameController,
  engine: ControlledEngine,
  san: string,
) {
  await vi.waitFor(() =>
    expect(engine.commands.at(-1)).toMatch(
      /^go wtime \d+ btime \d+ winc 3000 binc 3000$/,
    ),
  );
  const move = controller.game.chess
    .moves({ verbose: true })
    .find((move) => move.san === san);
  if (!move) throw new Error(`Coup de test illégal : ${san}`);
  engine.emit(`bestmove ${move.from}${move.to}${move.promotion ?? ""}`);
  await vi.waitFor(() => expect(controller.snapshot?.state).toBe("ready"));
}

it("envoie tout l’historique, applique bestmove et bloque les pièces noires", async () => {
  const { controller, engine } = await setup();
  expect(controller.move("e2", "e4")).toBe(true);
  expect(controller.canMove).toBe(false);
  expect(controller.move("e7", "e5")).toBe(false);
  await reply(controller, engine, "e5");
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
  expect(controller.canMove).toBe(true);
  controller.move("g1", "f3");
  expect(engine.commands).toContain("position startpos moves e2e4 e7e5 g1f3");
});

it("termine une partie entière par mat sans relancer une recherche", async () => {
  const { controller, engine } = await setup();
  controller.move("f2", "f3");
  await reply(controller, engine, "e5");
  controller.move("g2", "g4");
  await reply(controller, engine, "Qh4#");
  expect(controller.game.chess.isCheckmate()).toBe(true);
  expect(controller.canMove).toBe(false);
  expect(
    engine.commands.filter((command) => command.startsWith("go ")),
  ).toHaveLength(2);
});

it("ignore un bestmove tardif après une nouvelle partie", async () => {
  const { controller, engine } = await setup();
  const oldListeners = [...engine.listeners];
  controller.move("e2", "e4");
  controller.reset();
  for (const listener of oldListeners) listener("bestmove e7e5");
  await Promise.resolve();
  expect(controller.game.chess.history()).toEqual([]);
  expect(engine.disposed).toBe(true);
});

it("conserve la partie lors du retour au mode deux joueurs", async () => {
  const { controller, engine } = await setup();
  controller.move("e2", "e4");
  await controller.disconnect();
  engine.emit("bestmove e7e5");
  expect(controller.game.chess.history()).toEqual(["e4"]);
  expect(controller.move("e7", "e5")).toBe(true);
});

it.each(["e7e4", "0000", "(none)", "incorrect"])(
  "suspend la partie sur une réponse invalide : %s",
  async (response) => {
    const { controller, engine } = await setup();
    controller.move("e2", "e4");
    await vi.waitFor(() =>
      expect(engine.commands.at(-1)).toMatch(
        /^go wtime \d+ btime \d+ winc 3000 binc 3000$/,
      ),
    );
    engine.emit(`bestmove ${response}`);
    await vi.waitFor(() => expect(controller.snapshot?.state).toBe("error"));
    expect(controller.game.chess.history()).toEqual(["e4"]);
    expect(controller.canMove).toBe(false);
  },
);

it("ne lance pas go si le moteur refuse la position", async () => {
  const { controller, engine } = await setup();
  controller.move("e2", "e4");
  engine.emit("info string coup illégal — position ignorée");
  await vi.waitFor(() => expect(controller.snapshot?.state).toBe("error"));
  expect(engine.commands.some((command) => command.startsWith("go "))).toBe(
    false,
  );
  expect(controller.game.chess.history()).toEqual(["e4"]);
});

it("attend la promotion blanche et applique directement la promotion noire", async () => {
  const { controller, engine } = await setup();
  for (const san of ["a4", "h5", "a5", "h4", "a6", "h3", "axb7", "hxg2"])
    controller.game.chess.move(san);
  controller.move("b7", "a8");
  expect(controller.game.pending).not.toBeNull();
  expect(
    engine.commands.some((command) => command.startsWith("position ")),
  ).toBe(false);
  controller.promote("n");
  expect(engine.commands).toContain(
    "position startpos moves a2a4 h7h5 a4a5 h5h4 a5a6 h4h3 a6b7 h3g2 b7a8n",
  );
  const promotion = controller.game.chess
    .moves({ verbose: true })
    .find((move) => move.promotion === "n");
  expect(promotion).toBeDefined();
  await reply(controller, engine, promotion!.san);
  expect(controller.game.chess.get(promotion!.to)).toEqual({
    color: "b",
    type: "n",
  });
  expect(controller.game.pending).toBeNull();
});

it("ferme une connexion qui arrive après son annulation", async () => {
  const controller = new GameController({ now: () => 0 });
  controllers.push(controller);
  const engine = new ControlledEngine();
  let resolve!: (engine: Engine) => void;
  const connecting = controller.connect(
    "local",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await Promise.resolve();
  await controller.disconnect();
  resolve(engine);
  await connecting;
  expect(engine.disposed).toBe(true);
  expect(controller.mode).toBeNull();
});

it("retire l’attente de readyok du budget envoyé au moteur et ignore une réponse hors délai", async () => {
  let now = 0;
  const controller = new GameController({
    timeControl: { initialMs: 1000, incrementMs: 100 },
    now: () => now,
  });
  controllers.push(controller);
  const engine = new ControlledEngine();
  await controller.connect("local", async () => engine);
  await vi.waitFor(() => expect(controller.canMove).toBe(true));
  controller.move("e2", "e4");
  now = 250;
  await vi.waitFor(() =>
    expect(engine.commands.at(-1)).toBe(
      "go wtime 1100 btime 750 winc 100 binc 100",
    ),
  );
  now = 1000;
  engine.emit("bestmove e7e5");
  await vi.waitFor(() => expect(controller.timeResult).toContain("Noirs"));
  expect(controller.game.chess.history()).toEqual(["e4"]);
  expect(engine.disposed).toBe(true);
});

it("suspend le temps sur une panne moteur puis reprend à deux joueurs", async () => {
  let now = 0;
  const controller = new GameController({
    timeControl: { initialMs: 10_000, incrementMs: 0 },
    now: () => now,
  });
  controllers.push(controller);
  const engine = new ControlledEngine();
  let fail!: (message: string) => void;
  await controller.connect("local", async (failure) => {
    fail = failure;
    return engine;
  });
  await vi.waitFor(() => expect(controller.canMove).toBe(true));
  controller.move("e2", "e4");
  now = 2000;
  fail("Connexion perdue");
  now = 100_000;
  expect(controller.clock.remaining.b).toBe(8000);
  await controller.disconnect();
  now += 1000;
  expect(controller.clock.remaining.b).toBe(7000);
});

it("affiche le score des noirs du point de vue blanc et l’efface à la nouvelle partie", async () => {
  const { controller, engine } = await setup();
  controller.move("e2", "e4");
  await vi.waitFor(() => expect(engine.commands.at(-1)).toMatch(/^go /));
  engine.emit("info depth 10 score cp 80 nodes 5000");
  expect(controller.snapshot?.analysis).toEqual({
    depth: 10,
    score: { kind: "cp", value: -80 },
  });
  await reply(controller, engine, "e5");
  expect(controller.snapshot?.analysis?.score?.value).toBe(-80);
  controller.reset();
  expect(controller.snapshot?.analysis).toBeNull();
});

it("annule une paire de coups contre le moteur et refait exactement cette paire", async () => {
  const { controller, engine } = await setup();
  controller.move("e2", "e4");
  await reply(controller, engine, "e5");
  const after = controller.game.chess.fen();
  controller.undo();
  expect(controller.game.chess.history()).toEqual([]);
  expect(engine.disposed).toBe(true);
  expect(controller.canRedo).toBe(true);
  controller.redo();
  expect(controller.game.chess.fen()).toBe(after);
  expect(controller.canRedo).toBe(false);
});

it("annule pendant la recherche sans appliquer la réponse tardive et reprend une autre ligne", async () => {
  const controller = new GameController({ now: () => 0 });
  controllers.push(controller);
  const engines: ControlledEngine[] = [];
  await controller.connect("local", async () => {
    const engine = new ControlledEngine();
    engines.push(engine);
    return engine;
  });
  await vi.waitFor(() => expect(controller.canMove).toBe(true));
  const first = engines[0];
  controller.move("e2", "e4");
  await vi.waitFor(() => expect(first.commands.at(-1)).toMatch(/^go /));
  const stale = [...first.listeners];
  controller.undo();
  for (const listener of stale) listener("bestmove e7e5");
  await vi.waitFor(() => expect(controller.canMove).toBe(true));
  expect(controller.game.chess.history()).toEqual([]);
  controller.move("d2", "d4");
  expect(controller.canRedo).toBe(false);
  expect(engines.at(-1)?.commands).toContain("position startpos moves d2d4");
});

it("reprend la recherche si refaire rétablit seulement le coup humain", async () => {
  const controller = new GameController({ now: () => 0 });
  controllers.push(controller);
  const engines: ControlledEngine[] = [];
  await controller.connect("local", async () => {
    const engine = new ControlledEngine();
    engines.push(engine);
    return engine;
  });
  await vi.waitFor(() => expect(controller.canMove).toBe(true));
  controller.move("e2", "e4");
  controller.undo();
  controller.redo();
  await vi.waitFor(() =>
    expect(engines.at(-1)?.commands.at(-1)).toMatch(/^go /),
  );
  expect(controller.game.chess.history()).toEqual(["e4"]);
  expect(engines.at(-1)?.commands).toContain("position startpos moves e2e4");
});

it("démarre explicitement la pendule blanche pour une partie à deux", async () => {
  let now = 0;
  const controller = new GameController({ now: () => now });
  controllers.push(controller);
  expect(controller.clock.started).toBe(false);
  await controller.start();
  now = 1200;
  expect(controller.clock.remaining.w).toBe(298800);
  expect(controller.clock.runningColor).toBe("w");
});

it("joue les blancs immédiatement lorsque l’humain choisit les noirs, après la connexion", async () => {
  let now = 0;
  const controller = new GameController({ humanSide: "b", now: () => now });
  controllers.push(controller);
  const engine = new ControlledEngine();
  let finish!: (engine: Engine) => void;
  const starting = controller.start(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  now = 9000;
  expect(controller.clock.started).toBe(false);
  finish(engine);
  await starting;
  await vi.waitFor(() =>
    expect(engine.commands).toContain("position startpos"),
  );
  await vi.waitFor(() => expect(engine.commands.at(-1)).toMatch(/^go /));
  expect(controller.canMove).toBe(false);
  expect(controller.clock.remaining.w).toBe(300000);
  now += 500;
  engine.emit("info depth 5 score cp 42");
  await reply(controller, engine, "e4");
  expect(controller.clock.remaining.w).toBe(302500);
  expect(controller.clock.runningColor).toBe("b");
  expect(controller.canUndo).toBe(false);
  expect(controller.canMove).toBe(true);
  expect(controller.snapshot?.analysis?.score?.value).toBe(42);
  expect(controller.move("e7", "e5")).toBe(true);
  await reply(controller, engine, "Nf3");
  const loaded = new (await import("chess.js")).Chess();
  loaded.loadPgn(controller.exportPgn());
  expect(loaded.getHeaders().White).toBe("Moteur UCI");
  expect(loaded.getHeaders().Black).toBe("Joueur local");
  controller.undo();
  expect(controller.game.chess.history()).toEqual(["e4"]);
  controller.redo();
  expect(controller.game.chess.history()).toEqual(["e4", "e5", "Nf3"]);
});

it("abandonne pendant une recherche, conserve le PGN et ignore le bestmove tardif", async () => {
  const { controller, engine } = await setup();
  controller.move("e2", "e4");
  await vi.waitFor(() => expect(engine.commands.at(-1)).toMatch(/^go /));
  const stale = [...engine.listeners];
  controller.resign();
  for (const listener of stale) listener("bestmove e7e5");
  expect(controller.finished).toBe(true);
  expect(controller.outcome).toEqual({
    reason: "resignation",
    winner: "b",
    result: "0-1",
  });
  expect(controller.clock.runningColor).toBeNull();
  expect(controller.game.chess.history()).toEqual(["e4"]);
  expect(controller.exportPgn()).toContain('[Result "0-1"]');
  expect(controller.exportPgn()).toContain("Abandon des Blancs");
  controller.undo();
  expect(controller.outcome).toBeNull();
});

it("abandonne le camp au trait à deux joueurs, même pendant une promotion", async () => {
  const controller = new GameController({ now: () => 0 });
  controllers.push(controller);
  await controller.start();
  for (const san of ["a4", "h5", "a5", "h4", "a6", "h3", "axb7", "hxg2"])
    controller.game.chess.move(san);
  controller.move("b7", "a8");
  expect(controller.game.pending).not.toBeNull();
  controller.resign();
  expect(controller.game.pending).toBeNull();
  expect(controller.outcome?.winner).toBe("b");
  expect(controller.canMove).toBe(false);
});

it("reconnecte sans changer de camp, de position ni facturer le temps de panne", async () => {
  let now = 0;
  const controller = new GameController({ humanSide: "b", now: () => now });
  controllers.push(controller);
  const engines: ControlledEngine[] = [];
  let fail!: (message: string) => void;
  await controller.start(async (failure) => {
    fail = failure;
    const engine = new ControlledEngine();
    engines.push(engine);
    return engine;
  });
  await reply(controller, engines[0], "e4");
  now = 1000;
  fail("Déconnecté");
  const time = controller.clock.remaining.b;
  const fen = controller.game.chess.fen();
  now = 50000;
  await controller.reconnect();
  await vi.waitFor(() => expect(controller.canMove).toBe(true));
  expect(controller.humanSide).toBe("b");
  expect(controller.game.chess.fen()).toBe(fen);
  expect(controller.clock.remaining.b).toBe(time);
});

it("annule un démarrage sans reprendre la pendule et ferme une connexion tardive", async () => {
  const controller = new GameController();
  controllers.push(controller);
  let done!: (engine: Engine) => void;
  const task = controller.start(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  await Promise.resolve();
  await controller.dispose();
  const engine = new ControlledEngine();
  done(engine);
  await task;
  expect(engine.disposed).toBe(true);
  expect(controller.clock.runningColor).toBeNull();
});

it("ferme la promotion en attente si le moteur devient indisponible", async () => {
  const { controller, engine } = await setup();
  for (const san of ["a4", "h5", "a5", "h4", "a6", "h3", "axb7", "hxg2"])
    controller.game.chess.move(san);
  const fen = controller.game.chess.fen();
  controller.move("b7", "a8");
  expect(controller.game.pending).not.toBeNull();
  engine.emit("info string invalid position");
  expect(controller.game.pending).toBeNull();
  expect(controller.game.chess.fen()).toBe(fen);
  expect(controller.canMove).toBe(false);
});

it("ne permet plus de jouer dans un contrôleur fermé", async () => {
  const controller = new GameController();
  await controller.start();
  await controller.dispose();
  expect(controller.move("e2", "e4")).toBe(false);
  expect(controller.clock.runningColor).toBeNull();
});
