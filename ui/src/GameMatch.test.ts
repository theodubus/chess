import { Chess } from "chess.js";
import { afterEach, expect, it, vi } from "vitest";
import { GameController, type EngineFactory } from "./GameController";
import type { Engine } from "./engine/Engine";
import type { EngineOptions } from "./engine/options";
import type { Side } from "./engine/analysis";
import { defaultArmy, matchPosition } from "./handicap";

class MatchEngine implements Engine {
  commands: string[] = [];
  listeners = new Set<(line: string) => void>();
  disposed = false;
  autoReady = true;
  constructor(readonly name: string, private capabilities = true) {}
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") queueMicrotask(() => {
      this.emit(`id name ${this.name}`);
      if (this.capabilities) {
        this.emit("option name Ponder type check default false");
        this.emit("option name Threads type spin default 1 min 1 max 8");
      }
      this.emit("uciok");
    });
    if (command === "isready" && this.autoReady) queueMicrotask(() => this.emit("readyok"));
  }
  emit(line: string) { for (const listener of this.listeners) listener(line); }
  onLine(listener: (line: string) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  async dispose() { this.disposed = true; this.listeners.clear(); }
}
const controllers: GameController[] = [];
afterEach(async () => {
  await Promise.all(controllers.map(controller => controller.dispose()));
  controllers.length = 0;
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const options: EngineOptions = { threads: 1, ponder: false };
function createController(config: ConstructorParameters<typeof GameController>[0] = {}) {
  const controller = new GameController({ now: () => 0, ...config });
  controllers.push(controller);
  return controller;
}
function players(w: MatchEngine, b: MatchEngine, settings = { w: options, b: options }) {
  return {
    w: { factory: async () => w, options: settings.w },
    b: { factory: async () => b, options: settings.b },
  };
}
async function setup(config: ConstructorParameters<typeof GameController>[0] = {}, settings = { w: options, b: options }) {
  const controller = createController(config);
  const w = new MatchEngine("White Engine"), b = new MatchEngine("Black Engine");
  await controller.startMatch(players(w, b, settings));
  await searching(w);
  return { controller, w, b };
}
async function searching(engine: MatchEngine) {
  await vi.waitFor(() => expect(engine.commands.at(-1)).toMatch(/^(go (?!ponder)|ponderhit$)/));
}
async function reply(controller: GameController, engine: MatchEngine, san: string, prediction?: string) {
  await searching(engine);
  const board = new Chess(controller.game.chess.fen());
  const move = board.move(san);
  const predicted = prediction ? board.move(prediction).lan : null;
  const count = controller.game.chess.history().length;
  engine.emit(`bestmove ${move.lan}${predicted ? ` ponder ${predicted}` : ""}`);
  await vi.waitFor(() => expect(controller.game.chess.history()).toHaveLength(count + 1));
  await flush();
}

it("attend les deux moteurs avant de démarrer les pendules ou la recherche", async () => {
  let now = 0;
  const controller = createController({ now: () => now });
  const w = new MatchEngine("White"), b = new MatchEngine("Black");
  b.autoReady = false;
  const starting = controller.startMatch(players(w, b));
  await vi.waitFor(() => expect(b.commands.at(-1)).toBe("isready"));
  now = 30_000;
  expect(controller.clock.started).toBe(false);
  expect(controller.snapshot?.state).toBe("connecting");
  expect(w.commands.some(command => command.startsWith("go "))).toBe(false);
  b.autoReady = true; b.emit("readyok");
  await starting; await searching(w);
  expect(controller.clock.remaining.w).toBe(300_000);
  expect(controller.clock.runningColor).toBe("w");
  expect(controller.canMove).toBe(false);
  expect(controller.move("e2", "e4")).toBe(false);
  expect(controller.setPremove("e2", "e4")).toBe(false);
});

it("alterne les camps, transmet tout l’historique et applique des budgets distincts", async () => {
  let now = 0;
  const { controller, w, b } = await setup({ now: () => now, timeControl: {
    w: { initialMs: 60_000, incrementMs: 2000 }, b: { initialMs: 30_000, incrementMs: 1000 },
  } }, { w: { threads: 2, ponder: false }, b: { threads: 3, ponder: false } });
  expect(w.commands).toContain("setoption name Threads value 2");
  expect(b.commands).toContain("setoption name Threads value 3");
  expect(w.commands.at(-1)).toBe("go wtime 60000 btime 30000 winc 2000 binc 1000");
  now = 500;
  await reply(controller, w, "e4");
  await searching(b);
  expect(b.commands).toContain("position startpos moves e2e4");
  expect(b.commands.at(-1)).toBe("go wtime 61500 btime 30000 winc 2000 binc 1000");
  now = 1500;
  b.emit("info depth 10 score cp 80 pv e7e5");
  expect(controller.snapshot?.analysis?.score?.value).toBe(-80);
  await reply(controller, b, "e5");
  await searching(w);
  expect(w.commands).toContain("position startpos moves e2e4 e7e5");
  expect(controller.clock.remaining).toEqual({ w: 61500, b: 30000 });
  expect(controller.canUndo).toBe(false);
  controller.undo(); controller.redo();
  expect(controller.game.chess.history()).toEqual(["e4", "e5"]);
});

it("recalcule le budget après l’attente de readyok", async () => {
  let now = 0;
  const { controller, w, b } = await setup({ now: () => now, timeControl: { initialMs: 1000, incrementMs: 0 } });
  b.autoReady = false;
  await reply(controller, w, "e4");
  expect(b.commands.at(-1)).toBe("isready");
  now = 250; b.emit("readyok");
  expect(b.commands.at(-1)).toBe("go wtime 1000 btime 750 winc 0 binc 0");
});

it("envoie aux deux moteurs la position personnalisée complète et la conserve dans le PGN", async () => {
  const white = defaultArmy(), black = defaultArmy(); delete white.a8; delete black.h8;
  const initialFen = matchPosition({ w: white, b: black });
  const { controller, w, b } = await setup({ initialFen });
  expect(w.commands).toContain(`position fen ${initialFen}`);
  await reply(controller, w, "e4"); await reply(controller, b, "e5");
  expect(b.commands).toContain(`position fen ${initialFen} moves e2e4`);
  await searching(w); controller.pauseMatch();
  const restored = new Chess(); restored.loadPgn(controller.exportPgn());
  expect(restored.getHeaders()).toMatchObject({ SetUp: "1", FEN: initialFen });
  expect(restored.fen()).toBe(controller.game.chess.fen());
});

it("termine sur le mat, ferme les deux moteurs et exporte leurs noms et le résultat", async () => {
  const { controller, w, b } = await setup();
  for (const [engine, san] of [[w, "f3"], [b, "e5"], [w, "g4"], [b, "Qh4#"]] as const)
    await reply(controller, engine, san);
  expect(controller.outcome).toEqual({ reason: "checkmate", winner: "b", result: "0-1" });
  expect(controller.clock.runningColor).toBeNull();
  expect(w.disposed && b.disposed).toBe(true);
  const exported = new Chess(); exported.loadPgn(controller.exportPgn());
  expect(exported.fen()).toBe(controller.game.chess.fen());
  expect(exported.getHeaders()).toMatchObject({ White: "White Engine", Black: "Black Engine", Event: "Match de moteurs", Result: "0-1" });
});

it("détecte la répétition grâce à l’historique et ferme aussi les deux sessions sur une nulle", async () => {
  const { controller, w, b } = await setup();
  for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"])
    await reply(controller, controller.game.chess.turn() === "w" ? w : b, san);
  expect(controller.outcome?.result).toBe("1/2-1/2");
  expect(w.disposed && b.disposed).toBe(true);
});

it("pause et reprend avec deux nouvelles connexions, sans modifier les coups ni facturer la pause", async () => {
  let now = 0;
  const controller = createController({ now: () => now });
  const connections: Record<Side, MatchEngine[]> = { w: [], b: [] };
  const factory = (side: Side): EngineFactory => async () => {
    const engine = new MatchEngine(side); connections[side].push(engine); return engine;
  };
  await controller.startMatch({ w: { factory: factory("w"), options }, b: { factory: factory("b"), options } });
  await reply(controller, connections.w[0], "e4");
  await searching(connections.b[0]);
  now = 1000;
  const stale = [...connections.b[0].listeners];
  controller.pauseMatch();
  const remaining = controller.clock.remaining;
  now = 100_000;
  for (const listener of stale) listener("bestmove e7e5");
  expect(controller.clock.remaining).toEqual(remaining);
  expect(controller.paused).toBe(true);
  expect(controller.game.chess.history()).toEqual(["e4"]);
  expect(connections.w[0].disposed && connections.b[0].disposed).toBe(true);
  await controller.reconnect(); await searching(connections.b[1]);
  expect(connections.b[1].commands).toContain("position startpos moves e2e4");
  expect(controller.clock.remaining).toEqual(remaining);
  expect(controller.clock.runningColor).toBe("b");
  expect(controller.paused).toBe(false);
  await reply(controller, connections.b[1], "e5");
});

it("arrête sans attribuer une victoire et ignore les réponses tardives", async () => {
  const { controller, w, b } = await setup();
  await reply(controller, w, "e4"); await searching(b);
  const stale = [...b.listeners]; controller.stopMatch();
  for (const listener of stale) listener("bestmove e7e5");
  expect(controller.outcome).toEqual({ reason: "stopped", winner: null, result: "*" });
  expect(controller.clock.runningColor).toBeNull();
  expect(w.disposed && b.disposed).toBe(true);
  const board = new Chess(); board.loadPgn(controller.exportPgn());
  expect(board.history()).toEqual(["e4"]);
  expect(board.getHeaders()).toMatchObject({ Result: "*", Termination: "unterminated" });
  expect(controller.exportPgn()).toContain("sans résultat attribué");
});

it("refuse un coup illégal, suspend les deux moteurs puis permet de reconnecter", async () => {
  const controller = createController();
  const engines: MatchEngine[] = [];
  const factory = async () => { const e = new MatchEngine("Engine"); engines.push(e); return e; };
  await controller.startMatch({ w: { factory, options }, b: { factory, options } });
  await searching(engines[0]); engines[0].emit("bestmove a1a8");
  await vi.waitFor(() => expect(controller.snapshot?.error).toContain("Blancs : Coup illégal"));
  expect(controller.clock.runningColor).toBeNull();
  expect(engines.every(e => e.disposed)).toBe(true);
  await controller.reconnect(); await searching(engines[2]);
  expect(controller.snapshot?.error).toBe("");
  expect(controller.game.chess.history()).toEqual([]);
});

it("ferme le moteur prêt si son adversaire ne peut pas se connecter", async () => {
  const controller = createController(); const w = new MatchEngine("White");
  await controller.startMatch({ w: { factory: async () => w, options }, b: {
    factory: async () => { await flush(); throw new Error("Binaire introuvable"); }, options,
  } });
  expect(controller.snapshot?.error).toContain("Noirs : Binaire introuvable");
  expect(controller.clock.started).toBe(false);
  expect(w.disposed).toBe(true);
});

it("refuse les options incompatibles avant le match et ferme les deux processus", async () => {
  const controller = createController(); const w = new MatchEngine("White"), b = new MatchEngine("Old engine", false);
  await controller.startMatch(players(w, b, { w: options, b: { threads: 2, ponder: false } }));
  expect(controller.snapshot?.state).toBe("error");
  expect(controller.snapshot?.error).toContain("Noirs");
  expect(controller.clock.started).toBe(false);
  expect(w.disposed && b.disposed).toBe(true);
});

it("suspend aussi le moteur actif si le moteur inactif perd sa connexion", async () => {
  let now = 0;
  const controller = createController({ now: () => now });
  const w = new MatchEngine("White"), b = new MatchEngine("Black");
  let fail!: (message: string) => void;
  await controller.startMatch({ ...players(w, b), b: { factory: async failure => { fail = failure; return b; }, options } });
  await searching(w); now = 1200; fail("Connexion perdue");
  now = 100_000;
  expect(controller.snapshot?.error).toBe("Noirs : Connexion perdue");
  expect(controller.clock.remaining.w).toBe(298800);
  expect(w.disposed && b.disposed).toBe(true);
});

it("ferme une connexion tardive après l’annulation de la préparation", async () => {
  const controller = createController(); const w = new MatchEngine("White"), b = new MatchEngine("Black");
  let resolve!: (engine: Engine) => void;
  const starting = controller.startMatch({ ...players(w, b), b: { options, factory: () => new Promise(done => { resolve = done; }) } });
  await vi.waitFor(() => expect(w.commands).toContain("isready"));
  await controller.dispose(); resolve(b); await starting;
  expect(w.disposed && b.disposed).toBe(true);
  expect(controller.clock.runningColor).toBeNull();
});

it("ferme les deux recherches au temps écoulé et ignore un bestmove hors délai", async () => {
  let now = 0;
  const { controller, w, b } = await setup({ now: () => now, timeControl: { initialMs: 1000, incrementMs: 0 } });
  now = 1000; w.emit("bestmove e2e4");
  await vi.waitFor(() => expect(controller.outcome?.reason).toBe("timeout"));
  expect(controller.game.chess.history()).toEqual([]);
  expect(w.disposed && b.disposed).toBe(true);
  expect(controller.clock.runningColor).toBeNull();
});

it("utilise deux sessions distinctes même lorsque le même moteur est sélectionné", async () => {
  const controller = createController(); const engines: MatchEngine[] = [];
  const factory = async () => { const engine = new MatchEngine("ShallowRed"); engines.push(engine); return engine; };
  await controller.startMatch({ w: { factory, options }, b: { factory, options } });
  expect(engines).toHaveLength(2);
  await reply(controller, engines[0], "e4"); await reply(controller, engines[1], "e5");
  expect(controller.snapshotFor("w")?.name).toBe("ShallowRed");
  expect(controller.snapshotFor("b")?.name).toBe("ShallowRed");
  expect(engines[0].commands).toContain("position startpos");
  expect(engines[1].commands).toContain("position startpos moves e2e4");
});

it("gère la réflexion anticipée des deux camps et leur ponderhit sans rejouer la prédiction", async () => {
  const settings = { w: { threads: 2, ponder: true }, b: { threads: 1, ponder: true } };
  const { controller, w, b } = await setup({}, settings);
  await reply(controller, w, "e4", "e5");
  expect(w.commands).toContain("position startpos moves e2e4 e7e5");
  expect(w.commands.at(-1)).toMatch(/^go ponder /);
  await reply(controller, b, "e5", "Nf3");
  expect(w.commands.at(-1)).toBe("ponderhit");
  await reply(controller, w, "Nf3", "Nc6");
  expect(b.commands.at(-1)).toBe("ponderhit");
  await reply(controller, b, "Nc6");
  expect(controller.game.chess.history()).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  controller.pauseMatch();
  expect(w.disposed && b.disposed).toBe(true);
});

it("arrête une mauvaise prédiction avant de relancer sur la vraie réponse adverse", async () => {
  const { controller, w, b } = await setup({}, { w: { ...options, ponder: true }, b: options });
  await reply(controller, w, "e4", "e5");
  await reply(controller, b, "c5");
  expect(w.commands.at(-1)).toBe("stop");
  w.emit("bestmove g1f3"); await flush(); await searching(w);
  expect(w.commands).toContain("position startpos moves e2e4 c7c5");
  expect(controller.game.chess.history()).toEqual(["e4", "c5"]);
  await reply(controller, w, "Nf3");
});

it("rejoue un match avec des connexions neuves et ignore les anciens callbacks", async () => {
  const controller = createController(); const engines: MatchEngine[] = [];
  const factory = async () => { const e = new MatchEngine("Engine"); engines.push(e); return e; };
  await controller.startMatch({ w: { factory, options }, b: { factory, options } });
  await reply(controller, engines[0], "e4"); await searching(engines[1]);
  const stale = [...engines[1].listeners]; controller.stopMatch(); controller.reset();
  for (const listener of stale) listener("bestmove e7e5");
  await vi.waitFor(() => expect(engines).toHaveLength(4)); await searching(engines[2]);
  expect(controller.game.chess.history()).toEqual([]);
  expect(controller.outcome).toBeNull();
  expect(engines[2].commands).toContain("position startpos");
});
