import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { decisionContext } from "./context";
import { gamePositions } from "../model";
import { captureRelations, relationChanges } from "./relations";
import cases from "./relationCases.json";

function contextFor(test: (typeof cases)[number]) {
  const board = new Chess(test.fen);
  board.move(test.played);
  return decisionContext(gamePositions(board.pgn())[0]);
}
for (const test of cases) {
  it(`relations : ${test.id}`, () => {
    const context = contextFor(test),
      original = JSON.stringify(context);
    const relations = relationChanges(context);
    if (test.defence) {
      const change = relations.defences.find(
        (d) => d.before.move === test.defence!.capture,
      )!;
      expect(change).toBeDefined();
      expect(change.removed).toEqual(
        test.defence.removed.map((defenderId) => ({
          defenderId,
          reason: test.defence!.reason,
        })),
      );
      expect(change.after.recaptures).toHaveLength(test.defence.remaining);
      expect(change.after.balanceAfterBestRecapture).toBeGreaterThanOrEqual(
        change.before.balanceAfterBestRecapture,
      );
    }
    if (test.absentDefence)
      expect(
        relations.defences.some((d) => d.before.move === test.absentDefence),
      ).toBe(false);
    if (test.line) {
      const line = relations.openedLines.find(
        (l) => l.from === test.line!.from && l.to === test.line!.to,
      )!;
      expect(line, JSON.stringify(relations.openedLines)).toBeDefined();
      expect(line.role).toBe(test.line.role);
      expect(line.capture?.status ?? null).toBe(test.line.capture);
      expect(line.vacated.map((v) => v.square).sort()).toEqual(
        [...test.line.vacated].sort(),
      );
      for (const entry of line.vacated) {
        expect(line.path).toContain(entry.square);
        expect(
          context.before.pieces.find((p) => p.id === entry.pieceId)?.square,
        ).toBe(entry.square);
        expect(
          context.after.pieces.find((p) => p.id === entry.pieceId)?.square ??
            null,
        ).toBe(entry.destination);
      }
    }
    if (test.absentLine)
      expect(
        relations.openedLines.some((l) => l.from + l.to === test.absentLine),
      ).toBe(false);
    // Chaque reprise annoncée se joue réellement après la capture, même dans
    // la sonde conditionnelle. Une relation géométrique seule n'est pas comptée.
    for (const [frame, bySide] of [
      [context.before, relations.before],
      [context.after, relations.after],
    ] as const) {
      for (const side of ["w", "b"] as const)
        for (const capture of bySide[side].captures) {
          const fields = frame.fen.split(" ");
          if (frame.turn !== side) {
            fields[1] = side;
            fields[3] = "-";
          }
          for (const reply of capture.recaptures) {
            const board = new Chess(fields.join(" "));
            board.move(capture.move);
            expect(board.move(reply.move).captured).toBeTruthy();
          }
        }
    }
    expect(JSON.stringify(context)).toBe(original);
  });
}
it("ne compte pas le cavalier cloué comme défense légale malgré son attaque géométrique", () => {
  const context = contextFor(
    cases.find((c) => c.id === "already-pinned-defender")!,
  );
  expect(new Chess(context.before.fen).attackers("f6", "b")).toContain("d5");
  expect(
    captureRelations(context.before, "w").captures.find(
      (c) => c.move === "c3f6",
    )?.recaptures,
  ).toEqual([]);
});
it("garde une absence de données distincte d'une absence de reprise", () => {
  const context = contextFor(
    cases.find((c) => c.id === "opened-while-opponent-in-check")!,
  );
  expect(captureRelations(context.after, "w")).toMatchObject({
    status: "unavailable",
    scope: "geometric-turn-probe",
  });
  expect(relationChanges(context).defences).toEqual([]);
});
