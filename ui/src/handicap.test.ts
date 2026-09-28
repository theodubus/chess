import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import { expect, it, vi } from "vitest";
import { HANDICAPS, handicapPosition } from "./handicap";
import { GameController } from "./GameController";
import { DEFAULT_SETUP, readSetup } from "./preferences";
import { importPgn } from "./importPgn";
import { gamePositions } from "./review/model";

for (const human of ["w", "b"] as const) {
  for (const handicap of HANDICAPS.filter((entry) => entry.value !== "none")) {
    it(`${handicap.value} : enlève seulement la pièce du moteur quand le joueur est ${human}`, () => {
      const initial = new Chess();
      const chess = new Chess(handicapPosition(handicap.value, human));
      const removed = initial
        .board()
        .flat()
        .filter((piece) => piece && !chess.get(piece.square));
      expect(removed).toHaveLength(1);
      expect(removed[0]?.color).not.toBe(human);
      expect(removed[0]?.square[0]).toBe(handicap.file);
      expect(chess.board().flat().filter(Boolean)).toHaveLength(31);
      expect(chess.turn()).toBe("w");
      if (handicap.value === "rook") {
        expect(chess.getCastlingRights(human === "w" ? "b" : "w")).toEqual({
          k: true,
          q: false,
        });
        expect(chess.getCastlingRights(human)).toEqual({ k: true, q: true });
      }
    });
  }
}
it("garde la position habituelle sans handicap", () => {
  expect(handicapPosition("none", "w")).toBe(DEFAULT_POSITION);
  expect(handicapPosition("none", "b")).toBe(DEFAULT_POSITION);
});
it("restaure seulement les handicaps connus et préserve les anciennes préférences", () => {
  try {
    for (const value of [undefined, "king", "rook"]) {
      vi.stubGlobal("localStorage", {
        getItem: () => JSON.stringify({ ...DEFAULT_SETUP, handicap: value }),
      });
      expect(readSetup().handicap).toBe(value === "rook" ? "rook" : "none");
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

it("conserve le handicap en recherche, ponder, export, analyse et remise à zéro", async () => {
  const initialFen = handicapPosition("rook", "w");
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
