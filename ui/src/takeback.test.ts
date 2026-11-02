import { afterEach, expect, it } from "vitest";
import { Chess } from "chess.js";
import { GameController } from "./GameController";
import type { Engine } from "./engine/Engine";

function play(controller: GameController, san: string) {
  const move = controller.game.chess.moves({ verbose: true }).find((move) => move.san === san);
  if (!move) throw new Error(`Coup de préparation illégal : ${san}`);
  expect(controller.move(move.from, move.to)).toBe(true);
}

/** Deux joueurs, 10 s + 2 s, temps injecté. */
function local(takebacks = { w: true, b: true }) {
  let now = 0;
  const controller = new GameController({
    now: () => now,
    timeControl: { initialMs: 10_000, incrementMs: 2000 },
    takebacks,
  });
  return { controller, wait: (ms: number) => { now += ms; } };
}

it("à deux : le temps de celui qui reprend reste dépensé, l’autre retrouve le sien", () => {
  const { controller, wait } = local();
  play(controller, "e4"); // La pendule part au premier coup.
  wait(3000);
  play(controller, "e5"); // Noirs : 10 − 3 + 2 = 9 s.
  wait(1000);
  play(controller, "Nf3"); // Blancs : 12 − 1 + 2 = 13 s.
  wait(2000); // Les Noirs réfléchissent 2 s…
  expect(controller.canTakeBack).toBe(true);
  expect(controller.takeBack()).toBe(true);
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
  // … et les retrouvent ; les Blancs gardent dépensée leur seconde, sans l’incrément.
  expect(controller.clock.remaining).toEqual({ w: 11_000, b: 9000 });
  expect(controller.clock.runningColor).toBe("w");
  // Reprendre puis rejouer le même coup ne fait pas gagner d’incrément.
  play(controller, "Nf3");
  expect(controller.clock.remaining).toEqual({ w: 13_000, b: 9000 });
});

it("à deux : seul l’auteur du dernier coup peut le reprendre, s’il y a droit", () => {
  const { controller } = local({ w: true, b: false });
  play(controller, "e4");
  play(controller, "e5");
  expect(controller.takebackAllowed).toBe(true);
  expect(controller.canTakeBack).toBe(false);
  expect(controller.takeBack()).toBe(false);
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
  play(controller, "Nf3");
  expect(controller.takeBack()).toBe(true);
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
  expect(local({ w: false, b: false }).controller.takebackAllowed).toBe(false);
});

it("ne reprend rien après la fin de la partie", () => {
  const { controller } = local();
  for (const san of ["f3", "e5", "g4", "Qh4#"]) play(controller, san);
  expect(controller.finished).toBe(true);
  expect(controller.canTakeBack).toBe(false);
  expect(controller.takeBack()).toBe(false);
  expect(controller.game.chess.isCheckmate()).toBe(true);
});

/** Un moteur scripté : il répond quand le test le lui dit. */
class ScriptedEngine implements Engine {
  commands: string[] = [];
  private listeners = new Set<(line: string) => void>();
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
    this.listeners.clear();
  }
}
const controllers: GameController[] = [];
afterEach(async () => {
  for (const controller of controllers) await controller.dispose();
  controllers.length = 0;
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function againstEngine(takeback = true, initialMs = 60_000) {
  let now = 0;
  const engines: ScriptedEngine[] = [];
  const controller = new GameController({
    now: () => now,
    timeControl: {
      w: { initialMs, incrementMs: 2000 },
      b: { initialMs: 30_000, incrementMs: 1000 },
    },
    takebacks: { w: takeback, b: false },
  });
  controllers.push(controller);
  await controller.start(async () => {
    engines.push(new ScriptedEngine());
    return engines.at(-1)!;
  });
  await flush();
  return {
    controller,
    engine: () => engines.at(-1)!,
    wait: (ms: number) => {
      now += ms;
    },
  };
}

it("face au moteur : reprend votre coup et sa réponse, et lui rend son temps", async () => {
  const { controller, engine, wait } = await againstEngine();
  wait(5000);
  play(controller, "e4"); // Vous : 60 − 5 + 2 = 57 s.
  await flush();
  wait(3000);
  const reply = new Chess(controller.game.chess.fen()).move("e5");
  engine().emit(`bestmove ${reply.from}${reply.to}`); // Moteur : 30 − 3 + 1 = 28 s.
  await flush();
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
  wait(2000); // Vous réfléchissez encore 2 s : 55 s.
  expect(controller.takeBack()).toBe(true);
  expect(controller.game.chess.history()).toEqual([]);
  expect(controller.clock.remaining).toEqual({ w: 53_000, b: 30_000 });
  await flush();
  // La nouvelle connexion rend la main au joueur, sa pendule repart.
  expect(controller.canMove).toBe(true);
  expect(controller.clock.runningColor).toBe("w");
  wait(1000);
  expect(controller.clock.remaining).toEqual({ w: 52_000, b: 30_000 });
});

it("face au moteur : pendant sa recherche, reprend votre seul coup et ignore sa réponse tardive", async () => {
  const { controller, engine, wait } = await againstEngine();
  wait(5000);
  play(controller, "e4");
  await flush();
  const searching = engine();
  wait(1000);
  expect(controller.takeBack()).toBe(true);
  expect(controller.game.chess.history()).toEqual([]);
  expect(controller.clock.remaining).toEqual({ w: 55_000, b: 30_000 });
  const late = new Chess();
  late.move("e4");
  const reply = late.move("e5");
  searching.emit(`bestmove ${reply.from}${reply.to}`);
  await flush();
  expect(controller.game.chess.history()).toEqual([]);
});

it("face au moteur : sans droit aux retours, rien n’est repris", async () => {
  const { controller } = await againstEngine(false);
  play(controller, "e4");
  await flush();
  expect(controller.takebackAllowed).toBe(false);
  expect(controller.takeBack()).toBe(false);
  expect(controller.game.chess.history()).toEqual(["e4"]);
});

it("face au moteur : la pendule tombe si le temps restant, incrément retiré, est épuisé", async () => {
  // Une reprise d’un seul coup laisse toujours du temps : il faut avoir
  // réfléchi, après la réponse du moteur, plus que ce qui restait sans l’incrément.
  const { controller, engine, wait } = await againstEngine(true, 10_000);
  wait(9000);
  play(controller, "e4"); // Vous : 10 − 9 + 2 = 3 s, dont 2 d’incrément.
  await flush();
  const reply = new Chess(controller.game.chess.fen()).move("e5");
  engine().emit(`bestmove ${reply.from}${reply.to}`);
  await flush();
  wait(2500); // Il vous reste 0,5 s : moins que l’incrément à retirer.
  expect(controller.takeBack()).toBe(true);
  expect(controller.clock.flagged).toBe("w");
  expect(controller.finished).toBe(true);
  expect(controller.status).toBe("Temps écoulé · Blancs");
});
