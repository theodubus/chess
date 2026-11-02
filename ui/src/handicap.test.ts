import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import { expect, it, vi } from "vitest";
import {
  armyError,
  defaultArmy,
  readHandicap,
  handicapPosition,
  matchPosition,
  matchArmyError,
  readMatchArmies,
  localArmiesError,
  localPosition,
} from "./handicap";
import { GameController } from "./GameController";
import { DEFAULT_SETUP, readSetup } from "./preferences";
import { importPgn } from "./importPgn";
import { gamePositions } from "./review/model";

for (const human of ["w", "b"] as const) {
  it(`conserve votre camp ${human} et adapte une armée déplacée à la couleur du bot`, () => {
    const army = defaultArmy();
    delete army.a8;
    delete army.b8;
    delete army.c7;
    army.c6 = "n";
    const chess = new Chess(handicapPosition(army, human));
    const original = new Chess();
    for (const piece of original.board().flat())
      if (piece?.color === human)
        expect(chess.get(piece.square)).toEqual({
          type: piece.type,
          color: piece.color,
        });
    expect(chess.get(human === "w" ? "c6" : "c3")).toEqual({
      type: "n",
      color: human === "w" ? "b" : "w",
    });
    expect(chess.get(human === "w" ? "a8" : "a1")).toBeUndefined();
    expect(chess.getCastlingRights(human === "w" ? "b" : "w")).toEqual({
      k: true,
      q: false,
    });
    expect(chess.getCastlingRights(human)).toEqual({ k: true, q: true });
  });
}
it("garde la position habituelle sans handicap", () => {
  expect(handicapPosition(null, "w")).toBe(DEFAULT_POSITION);
  expect(handicapPosition(null, "b")).toBe(DEFAULT_POSITION);
  expect(handicapPosition(defaultArmy(), "w")).toBe(DEFAULT_POSITION);
});

it("combine les deux camps personnalisés et ajuste leurs droits de roque indépendamment", () => {
  const w = defaultArmy(), b = defaultArmy(); delete w.a8; delete b.h8;
  const fen = matchPosition({ w, b });
  const board = new Chess(fen);
  expect(board.get("a1")).toBeUndefined(); expect(board.get("h8")).toBeUndefined();
  expect(board.getCastlingRights("w")).toEqual({ k: true, q: false });
  expect(board.getCastlingRights("b")).toEqual({ k: false, q: true });
  for (const san of ["e4", "e5", "Nf3"]) board.move(san);
  const restored = new Chess(); restored.loadPgn(board.pgn());
  expect(restored.fen()).toBe(board.fen());
  expect(restored.getHeaders().FEN).toBe(fen);
  expect(matchPosition({ w: null, b: null })).toBe(DEFAULT_POSITION);
});

it("refuse les collisions entre camps, les rois en échec et les armées incomplètes", () => {
  const w = defaultArmy(), b = defaultArmy(); delete w.b8; delete b.b8;
  w.c5 = "n"; b.c4 = "n";
  expect(matchArmyError({ w, b })).toContain("case c4");
  expect(() => matchPosition({ w, b })).toThrow("case c4");
  const checking = defaultArmy(); delete checking.b8; checking.f3 = "n";
  expect(matchArmyError({ w: null, b: checking })).toContain("échec");
  expect(readMatchArmies({ w: null, b: { e8: "q" } })).toEqual({ w: null, b: null });
});

it("valide et restaure la position combinée plutôt que chacun des camps face à une armée classique", () => {
  const w = defaultArmy(), b = defaultArmy(); delete w.b8; w.f3 = "n";
  delete b.e8; delete b.d8; b.d8 = "k";
  expect(armyError(w)).toContain("échec");
  expect(matchArmyError({ w, b })).toBeNull();
  expect(readMatchArmies({ w, b })).toEqual({ w, b });
  const board = new Chess(matchPosition({ w, b }));
  expect(board.get("f6")).toEqual({ color: "w", type: "n" });
  expect(board.get("d8")).toEqual({ color: "b", type: "k" });
});
it("valide les rois, les pions, les effectifs et protège le camp humain", () => {
  const original = defaultArmy();
  const noKing = { ...original };
  delete noKing.e8;
  expect(armyError(noKing)).toContain("roi");
  expect(armyError({ ...original, e6: "k" })).toContain("roi");
  expect(armyError({ ...original, a1: "q" })).toContain("rangées de départ adverses");
  expect(armyError({ ...original, a8: "p" })).toContain("8 pions");
  expect(armyError({ ...original, a7: "r", a8: "p" })).toContain(
    "dernière rangée",
  );
  // Face à un camp complet, une pièce de plus ferait 33 pièces sur l’échiquier.
  expect(armyError({ ...original, a6: "n" })).toContain("32 pièces");
  expect(armyError({ ...original, a7: "q", a8: "n" })).toBeNull();
  expect(armyError({ ...original, a8: "x" })).toContain("pièce inconnue");
});
it("refuse les rois attaqués pour les deux couleurs possibles", () => {
  const army = defaultArmy();
  delete army.b8;
  army.b3 = "n";
  // Vérifier l’attaque du roi avec chess.js avant de construire le cas refusé.
  const check = new Chess();
  check.remove("b8");
  check.put({ type: "n", color: "b" }, "f3");
  expect(check.isAttacked("e1", "b")).toBe(true);
  delete army.b3;
  army.f3 = "n";
  expect(armyError(army)).toContain("échec");
  expect(() => handicapPosition(army, "w")).toThrow("échec");
});
it("restaure l’armée sauvegardée et migre les anciens handicaps", () => {
  const army = defaultArmy();
  delete army.a8;
  expect(readHandicap("rook")).toEqual(army);
  expect(readHandicap("none")).toBeNull();
  expect(readHandicap({ e8: "q" })).toBeNull();
  try {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ ...DEFAULT_SETUP, handicap: army }),
    });
    expect(readSetup().handicap).toEqual(army);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("conserve le handicap en recherche, ponder, export, analyse et remise à zéro", async () => {
  const initialFen = handicapPosition(readHandicap("rook"), "w");
  const controller = new GameController({
    initialFen,
    now: () => 0,
    engineOptions: { ponder: true, threads: 1 },
  });
  const commands: string[] = [];
  let emit: (line: string) => void = () => {};
  const engine = {
    send(command: string) {
      commands.push(command);
      if (command === "uci")
        queueMicrotask(() => {
          emit("option name Ponder type check default false");
          emit("uciok");
        });
      if (command === "isready") queueMicrotask(() => emit("readyok"));
    },
    onLine(listener: (line: string) => void) {
      emit = listener;
      return () => {};
    },
    async dispose() {},
  };
  try {
    await controller.start(async () => engine);
    await vi.waitFor(() => expect(controller.snapshot?.state).toBe("ready"));
    expect(controller.move("e2", "e4")).toBe(true);
    await vi.waitFor(() =>
      expect(commands).toContain(`position fen ${initialFen} moves e2e4`),
    );
    const verify = new Chess(initialFen);
    for (const san of ["e4", "e5", "Nf3"]) verify.move(san);
    emit("bestmove e7e5 ponder g1f3");
    await vi.waitFor(() =>
      expect(commands).toContain(
        `position fen ${initialFen} moves e2e4 e7e5 g1f3`,
      ),
    );
    expect(controller.move("g1", "f3")).toBe(true);
    expect(commands).toContain("ponderhit");
    const next = verify.move("Nc6");
    emit(`bestmove ${next.from}${next.to}`);
    await vi.waitFor(() =>
      expect(controller.game.chess.fen()).toBe(verify.fen()),
    );
    const pgn = controller.exportPgn();
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${initialFen}"]`);
    const restored = new Chess();
    restored.loadPgn(importPgn(pgn));
    expect(restored.fen()).toBe(verify.fen());
    expect(gamePositions(pgn)[0].fen).toBe(initialFen);
    controller.game.reset();
    expect(controller.game.chess.fen()).toBe(initialFen);
    expect(controller.game.chess.get("a8" as Square)).toBeUndefined();
  } finally {
    await controller.dispose();
  }
});

it("modifie aussi votre camp face au moteur, quelle que soit votre couleur", () => {
  const player = defaultArmy();
  delete player.d8; // votre dame, enregistrée comme si vous aviez les Noirs
  const engine = defaultArmy();
  delete engine.a8;
  for (const human of ["w", "b"] as const) {
    const chess = new Chess(localPosition(engine, player, human));
    const own = human === "w" ? "d1" : "d8";
    const rook = human === "w" ? "a8" : "a1";
    expect(chess.get(own)).toBeFalsy();
    expect(chess.get(rook)).toBeFalsy();
    expect(chess.get(human === "w" ? "d8" : "d1")).toEqual({ type: "q", color: human === "w" ? "b" : "w" });
    expect(chess.turn()).toBe("w");
  }
  // Sans armée personnelle, la position reste celle d'avant.
  expect(localPosition(engine, null, "w")).toBe(handicapPosition(engine, "w"));
  expect(localPosition(null, null, "b")).toBe(DEFAULT_POSITION);
});

it("refuse deux camps qui se chevauchent face au moteur, dans un sens comme dans l'autre", () => {
  const player = defaultArmy();
  delete player.e7;
  player.e5 = "p"; // votre pion avancé de trois cases : e4 avec les Blancs
  const engine = defaultArmy();
  delete engine.e7;
  engine.e4 = "p"; // le pion du moteur descendu en e4 avec les Noirs
  expect(localArmiesError(engine, player)).toContain("e4");
  expect(() => localPosition(engine, player, "b")).toThrow();
  expect(localArmiesError(null, null)).toBeNull();
});

it("n’impose plus de limite par camp, seulement 32 pièces sur l’échiquier", () => {
  // Vingt pièces d’un côté, douze de l’autre : 32, accepté.
  const big = defaultArmy();
  for (const square of ["a6", "b6", "c6", "d6"] as const) big[square] = "n";
  const small = defaultArmy();
  for (const square of ["a8", "b8", "c8", "f8"] as const) delete small[square];
  const armies = { w: big, b: small };
  expect(matchArmyError(armies)).toBeNull();
  const chess = new Chess(matchPosition(armies));
  expect(chess.board().flat().filter(Boolean)).toHaveLength(32);
  expect(chess.board().flat().filter((piece) => piece?.color === "w")).toHaveLength(20);
  // Une pièce de plus : 33, refusé.
  expect(matchArmyError({ w: { ...big, e6: "n" }, b: small })).toContain("32 pièces");
});
