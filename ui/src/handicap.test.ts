import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import { expect, it, vi } from "vitest";
import {
  armyError,
  defaultArmy,
  readHandicap,
  handicapPosition,
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
it("valide les rois, les pions, les effectifs et protège le camp humain", () => {
  const original = defaultArmy();
  const noKing = { ...original };
  delete noKing.e8;
  expect(armyError(noKing)).toContain("roi");
  expect(armyError({ ...original, e6: "k" })).toContain("roi");
  expect(armyError({ ...original, a1: "q" })).toContain("camp du moteur");
  expect(armyError({ ...original, a8: "p" })).toContain("8 pions");
  expect(armyError({ ...original, a7: "r", a8: "p" })).toContain(
    "dernière rangée",
  );
  expect(armyError({ ...original, a6: "n" })).toContain("16 pièces");
  expect(armyError({ ...original, a7: "q", a8: "n" })).toBeNull();
  expect(armyError({ ...original, a8: "x" })).toContain("camp du moteur");
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
