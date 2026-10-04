import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { tacticalConstraints } from "./constraints";
import { delayedTacticInput, delayedTacticCases } from "./delayedTacticCases";
import { tacticalTimeline, delayedTacticEffect, delayedTacticContrast } from "./delayedTactics";

it.each(delayedTacticCases)("la contre-épreuve $id conserve positions et rois légaux", test => {
  const { context } = delayedTacticInput(test.id);
  for (const frame of context.frames) {
    const board = boardFromCommand(frame.command);
    expect(board.fen()).toBe(frame.fen);
    const otherKing = frame.pieces.find(p => p.type === "k" && p.color !== frame.turn)!;
    expect(board.isAttacked(otherKing.square, frame.turn)).toBe(false);
  }
});

it.each(["delayed-fork", "delayed-fork-black"])("repère la même double attaque deux réponses plus tard : %s", id => {
  const { context } = delayedTacticInput(id), source = JSON.stringify(context);
  // La limite actuelle est observable indépendamment du nouveau prototype.
  expect(tacticalConstraints(context).hypotheses.some(h => h.kind === "double-threat")).toBe(false);
  const timeline = tacticalTimeline(context), fork = timeline.events.find(e => e.kind === "double-threat")!;
  expect(timeline.scope).toBe("observations-only");
  expect(fork).toMatchObject({ ply: 3, role: "allows-loss", preexisting: false, rootPath: [0, 3] });
  const board = new Chess(fork.frame.fen), attacker = fork.frame.pieces.find(p => p.id === fork.attackerId)!;
  expect(attacker.type).toBe("n");
  expect(fork.targetIds.map(id => fork.frame.pieces.find(p => p.id === id)!.type).sort()).toEqual(["k", "r"]);
  for (const id of fork.targetIds) expect(board.attackers(fork.frame.pieces.find(p => p.id === id)!.square, attacker.color)).toContain(attacker.square);
  const effect = delayedTacticEffect(context, fork);
  expect(effect).toMatchObject({ status: "loss-observed", evidence: { materialDelta: -5 }, exchange: { complete: true, balance: -5 } });
  expect(JSON.stringify(context)).toBe(source);
});

it("suit le déplacement du roi imposé par un échec préparatoire", () => {
  const { context } = delayedTacticInput("checking-preparation"), timeline = tacticalTimeline(context);
  expect(timeline.moves[1].reads).toContainEqual(expect.objectContaining({ kind: "checking-piece", pieceId: "b:r:g8", sourcePly: 0 }));
  expect(timeline.events.find(e => e.kind === "double-threat")).toMatchObject({ ply: 2, role: "creates-opportunity", rootPath: [0, 1, 2] });
});

it.each(["intermediate-error", "unrelated-decision"])("n'impute pas la menace au coup sans lien : %s", id => {
  const { context, test } = delayedTacticInput(id), timeline = tacticalTimeline(context), event = timeline.events.find(e => e.kind === "double-threat")!;
  expect(event.rootPath).toBeNull();
  expect(delayedTacticEffect(context, event).status).toBe("loss-observed");
  expect(delayedTacticContrast(context, event, test.alternative!)).toMatchObject({ status: "unconfirmed", reason: "root-not-linked" });
});

it("conserve la reprise du cavalier et le bilan équilibré", () => {
  const { context } = delayedTacticInput("compensated-fork"), event = tacticalTimeline(context).events.find(e => e.kind === "double-threat")!;
  expect(event.rootPath).not.toBeNull();
  expect(delayedTacticEffect(context, event)).toMatchObject({ status: "compensated", evidence: { materialDelta: 0 }, exchange: { complete: true, balance: 0 } });
});

it("réutilise le clouage absolu dans une position ultérieure", () => {
  const { context, test } = delayedTacticInput("delayed-pin"), pin = tacticalTimeline(context).events.find(e => e.kind === "pin")!;
  expect(pin).toMatchObject({ ply: 3, role: "allows-loss", fact: { kind: "absolute", shield: { square: "c3" }, rear: { square: "e1" } } });
  expect(pin.rootPath).toEqual([0, 3]);
  expect(delayedTacticContrast(context, pin, test.alternative!)).toMatchObject({ scope: "legal-prefix-only", status: "conditional-contribution", reason: "motif-removed" });
});

it("ne présente pas un clouage déjà établi comme une nouvelle création", () => {
  const { context } = delayedTacticInput("existing-pin");
  expect(tacticalConstraints(context).before.pins).toHaveLength(1);
  expect(tacticalTimeline(context).events).toHaveLength(0);
});

it("compare un choix légal sans prétendre démontrer la meilleure défense", () => {
  const { context, test } = delayedTacticInput("delayed-fork"), event = tacticalTimeline(context).events.find(e => e.kind === "double-threat")!;
  expect(delayedTacticContrast(context, event, test.alternative!)).toMatchObject({ scope: "legal-prefix-only", status: "conditional-contribution", reason: "motif-removed",
    prefix: ["g8g1", "c1d2", "e5c4"] });
  expect(delayedTacticContrast(context, event, "a1a5")).toMatchObject({ status: "unconfirmed", reason: "still-present" });
  expect(delayedTacticContrast(context, event, "a1a8")).toMatchObject({ status: "unconfirmed", reason: "prefix-changed" });
  expect(() => delayedTacticContrast(context, { ...event, ply: 4 }, test.alternative!)).toThrow("Motif absent");
});
