import { afterEach, expect, it } from "vitest";
import { Chess } from "chess.js";
import { GameController } from "./GameController";
import type { Engine } from "./engine/Engine";

class PonderEngine implements Engine {
  commands: string[] = [];
  listeners = new Set<(line: string) => void>();
  disposed = false;
  send(command: string) {
    this.commands.push(command);
    if (command === "uci")
      queueMicrotask(() => {
        this.emit("option name Ponder type check default false");
        this.emit("option name Threads type spin default 1 min 1 max 8");
        this.emit("uciok");
      });
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
    this.listeners.clear();
  }
}
const controllers: GameController[] = [];
afterEach(async () => {
  for (const controller of controllers) await controller.dispose();
  controllers.length = 0;
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function setup(ponder = true) {
  let now = 0;
  const controller = new GameController({
    now: () => now,
    timeControl: {
      w: { initialMs: 60000, incrementMs: 2000 },
      b: { initialMs: 30000, incrementMs: 1000 },
    },
    engineOptions: { ponder, threads: 2 },
  });
  controllers.push(controller);
  const engine = new PonderEngine();
  await controller.start(async () => engine);
  await flush();
  return {
    controller,
    engine,
    advance: (ms: number) => {
      now += ms;
      controller.tick();
    },
  };
}
async function firstReply(
  controller: GameController,
  engine: PonderEngine,
  prediction = "Nf3",
) {
  controller.move("e2", "e4");
  await flush();
  const board = new Chess(controller.game.chess.fen());
  const reply = board.move("e5");
  const predicted = board.move(prediction);
  engine.emit(
    `bestmove ${reply.from}${reply.to} ponder ${predicted.from}${predicted.to}${predicted.promotion ?? ""}`,
  );
  await flush();
}
it("pondère pendant le temps humain puis reprend sans rejouer le coup prévu", async () => {
  const { controller, engine, advance } = await setup();
  await firstReply(controller, engine);
  expect(engine.commands.at(-1)).toBe(
    "go ponder wtime 64000 btime 31000 winc 2000 binc 1000",
  );
  expect(controller.canMove).toBe(true);
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
  advance(4000);
  expect(controller.clock.remaining).toEqual({ w: 58000, b: 31000 });
  engine.emit("info depth 30 score cp 999 pv b8c6");
  expect(controller.snapshot?.analysis).toBeNull();
  controller.move("g1", "f3");
  expect(engine.commands.at(-1)).toBe("ponderhit");
  const future = new Chess(controller.game.chess.fen());
  const response = future.move("Nc6");
  advance(1000);
  engine.emit(`bestmove ${response.from}${response.to}`);
  await flush();
  expect(controller.game.chess.history()).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  expect(controller.clock.remaining).toEqual({ w: 60000, b: 31000 });
  expect(controller.canMove).toBe(true);
});
it("arrête une mauvaise prédiction, ignore son bestmove puis cherche sur le coup réel", async () => {
  const { controller, engine } = await setup();
  await firstReply(controller, engine);
  controller.move("d2", "d4");
  expect(engine.commands.at(-1)).toBe("stop");
  expect(controller.canMove).toBe(false);
  engine.emit("bestmove b8c6");
  await flush();
  expect(controller.game.chess.history()).toEqual(["e4", "e5", "d4"]);
  expect(engine.commands).toContain("position startpos moves e2e4 e7e5 d2d4");
  expect(engine.commands.at(-1)).toBe(
    "go wtime 64000 btime 31000 winc 2000 binc 1000",
  );
  const reply = new Chess(controller.game.chess.fen()).move("exd4");
  engine.emit(`bestmove ${reply.from}${reply.to}`);
  await flush();
  expect(controller.game.chess.history().at(-1)).toBe("exd4");
});
it.each(["resign", "timeout", "reset"] as const)(
  "annule la réflexion anticipée lors de %s et ignore une réponse tardive",
  async (action) => {
    const { controller, engine, advance } = await setup();
    await firstReply(controller, engine);
    const stale = [...engine.listeners];
    if (action === "resign") controller.resign();
    else if (action === "reset") controller.reset();
    else advance(100000);
    const history = controller.game.chess.history();
    for (const listener of stale) listener("bestmove b8c6");
    await flush();
    expect(engine.disposed).toBe(true);
    expect(controller.game.chess.history()).toEqual(history);
  },
);
it("ne pondère pas quand l’option est désactivée", async () => {
  const { controller, engine } = await setup(false);
  await firstReply(controller, engine);
  expect(controller.canMove).toBe(true);
  expect(
    engine.commands.some((command) => command.startsWith("go ponder")),
  ).toBe(false);
});
it("ne lance pas une prédiction illégale reçue du moteur", async () => {
  const { controller, engine } = await setup();
  controller.move("e2", "e4");
  await flush();
  const board = new Chess(controller.game.chess.fen());
  board.move("e5");
  expect(
    board
      .moves({ verbose: true })
      .some((move) => move.from === "a1" && move.to === "a8"),
  ).toBe(false);
  engine.emit("bestmove e7e5 ponder a1a8");
  await flush();
  expect(controller.canMove).toBe(true);
  expect(
    engine.commands.some((command) => command.startsWith("go ponder")),
  ).toBe(false);
});
