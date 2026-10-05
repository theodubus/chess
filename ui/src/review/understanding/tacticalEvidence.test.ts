import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import type { ReviewResult } from "../model";
import { decisionContext, uci, type PositionFrame } from "./context";
import { tacticalConstraints } from "./constraints";
import { tacticalInput } from "./tacticalCases";
import { groupEvidence, targetExchange } from "./tacticalEvidence";
import { observeTactic } from "./tacticalObservation";
import { framePosition } from "./evidence";
import { defenderContrast, observeDefenderContrast, observeTacticalContrast, tacticalContrast } from "./tacticalContrast";

export function scriptedResult(frame: PositionFrame, moves: readonly string[], score = 0): ReviewResult {
  const board = boardFromCommand(frame.command);
  const played = moves.map((m) => board.move(m));
  return { score: { kind: "cp", value: score }, depth: 15, bestMove: played[0] ? uci(played[0]) : null, bestSan: played[0]?.san ?? null,
    variation: played.map((m) => ({ from: m.from, to: m.to, fen: m.after, label: m.san })) };
}
function observation(id = "byrne-22", line?: string[]) {
  const input = tacticalInput(id), { context, constraints } = input.understanding;
  const h = constraints.hypotheses[input.hypothesisIndex];
  const result = scriptedResult(context.after, line ?? input.example.test.line);
  return { input, context, h, result, actual: observeTactic(context, h, result) };
}

it("ne confond pas l'échange égal du cavalier avec le gain du pion rendu possible ensuite", () => {
  const { context, h, actual } = observation();
  expect(actual).toMatchObject({ matched: true, capture: { targetId: "w:n:b1", attackerId: "b:n:b8", ply: 1 },
    exchange: { complete: true, balance: 0, from: 1, to: 2 }, handledTargets: ["w:q:d1"],
    followUp: { targetId: "w:p:e2", attackerId: "b:n:g8", defenderId: "w:n:b1", capture: "f6e4", ply: 3 },
    evidence: { outcome: "loss-in-line", materialDelta: -1, moves: ["c5a3", "a4c3", "b2c3", "f6e4"] } });
  expect(actual.evidence.captured.map((c) => c.targetId)).toEqual(["w:n:b1"]);
  expect(context.priorHistory).toBe("complete");
  expect(h.role).toBe("creates-opportunity");
});
it("compte la compensation immédiate ailleurs au lieu de vendre un gain de pion", () => {
  const { actual } = observation("byrne-22", ["Qa3", "Nxc3", "bxc3", "Nxe4", "Bxe7", "Qe8"]);
  expect(actual).toMatchObject({ matched: true, exchange: { balance: 0 }, evidence: { outcome: "compensated", materialDelta: 0 } });
  expect(actual.evidence.moves).toHaveLength(6);
});
it("une PV arrêtée avant la reprise garde l'échange non résolu", () => {
  const { actual } = observation("byrne-22", ["Qa3", "Nxc3"]);
  expect(actual).toMatchObject({ matched: true, exchange: { complete: false, balance: null },
    evidence: { outcome: "unresolved", ending: "pending-recapture" }, followUp: null });
  expect(actual.evidence.replies[0]).toMatchObject({ state: "pending", resolvedAt: null, choice: null });
});
it("une attaque non exploitée ne devient pas une raison par sa seule géométrie", () => {
  const { actual } = observation("byrne-22", ["Qa3", "a5"]);
  expect(actual).toMatchObject({ matched: false, reason: "capture-not-used", followUp: null });
});
it("la prise d'une pièce extérieure à la fourchette n'en prouve pas l'effet", () => {
  const { actual } = observation("byrne-22", ["Qa3", "Nxe4"]);
  expect(actual).toMatchObject({ matched: false, reason: "capture-not-used", followUp: null });
});
it("suit le roi et la tour ensemble : répondre à l'échec ne sauve pas la tour", () => {
  const { actual } = observation("fork-direct");
  expect(actual).toMatchObject({ matched: true, handledTargets: ["b:k:e8"], exchange: { balance: -5 },
    evidence: { outcome: "loss-in-line", materialDelta: -5, surviving: ["b:k:e8"] } });
});
it("compte pareil la fourchette des Noirs", () => {
  const { actual } = observation("fork-black");
  expect(actual).toMatchObject({ matched: true, exchange: { balance: -5 }, evidence: { outcome: "loss-in-line", materialDelta: -5 } });
});
it("conserve le refus de reprendre un pion pendant un échange sous clouage", () => {
  const { actual } = observation("pin-retreat");
  expect(actual).toMatchObject({ matched: true, exchange: { complete: true, balance: -2 }, evidence: { outcome: "loss-in-line", materialDelta: -2 } });
  expect(actual.evidence.replies).toContainEqual(expect.objectContaining({ state: "not-chosen", choice: expect.objectContaining({ move: "b5e2" }), available: expect.arrayContaining(["b5c6"]) }));
});
it("refuse le contraste de clouage quand la reprise du roi change aussi", () => {
  const { input, context, h, actual } = observation("pin-defence-changed");
  const alternate = decisionContext({ ...framePosition(context.before), played: input.alternative });
  expect(tacticalContrast(context, h, actual, alternate).reason).toBe("pressure-changed");
});
it("une retraite nouvellement légale doit être réellement choisie par le moteur", () => {
  const { input, context, h, actual } = observation("pin-retreat");
  const alternate = decisionContext({ ...framePosition(context.before), played: input.alternative });
  const plan = tacticalContrast(context, h, actual, alternate);
  expect(plan).toMatchObject({ reason: "ready", restoredMoves: expect.arrayContaining(["c6b4"]) });
  expect(observeTacticalContrast(context.before, h, plan, scriptedResult(plan.frame, ["Nb4"])))
    .toMatchObject({ usedRetreat: "c6b4", evidence: { outcome: "preserved", materialDelta: 0 } });
  expect(observeTacticalContrast(context.before, h, plan, scriptedResult(plan.frame, ["Kd7", "dxc6+", "bxc6", "Be2"])).usedRetreat).toBeNull();
});
it("contrôle le défenseur conservé sur la même prise, dès la première réponse", () => {
  const { input, context, h, actual } = observation();
  const alternate = decisionContext({ ...framePosition(context.before), played: input.alternative });
  const plan = tacticalContrast(context, h, actual, alternate);
  const answer = scriptedResult(plan.frame, ["Qa3"]);
  const defence = defenderContrast(plan, actual, answer)!;
  expect(defence).toMatchObject({ prefix: ["c5a3", "f6e4"], defenderId: "w:n:b1" });
  expect(observeDefenderContrast(context.before, plan, actual, defence, scriptedResult(defence.frame, ["Nxe4"])))
    .toMatchObject({ usedDefender: "w:n:b1", evidence: { outcome: "compensated", materialDelta: 2 } });
  expect(observeDefenderContrast(context.before, plan, actual, defence, scriptedResult(defence.frame, ["Bxe7"])).usedDefender).toBeNull();
});
it("garde la menace conditionnelle adverse séparée de la variante libre de l'alternative", () => {
  const { input, context, h, actual } = observation("byrne-allows-fork");
  expect(h.role).toBe("allows-loss");
  const alternate = decisionContext({ ...framePosition(context.before), played: input.alternative });
  const plan = tacticalContrast(context, h, actual, alternate);
  expect(plan).toMatchObject({ reason: "ready", prefix: ["b6a4"], scope: "conditional-same-threat" });
  expect(observeTacticalContrast(context.before, h, plan, scriptedResult(plan.frame, ["Qxa4"])))
    .toMatchObject({ evidence: { outcome: "preserved", materialDelta: 3 } });
  expect(observation("byrne-allows-fork", ["a5"]).actual).toMatchObject({ matched: false, reason: "different-threat" });
});
it("les cibles incohérentes et variantes illégales sont refusées", () => {
  const { context, result } = observation();
  expect(() => groupEvidence(context.before, context.after, [], result)).toThrow();
  expect(() => groupEvidence(context.before, context.after, ["absent"], result)).toThrow();
  expect(() => groupEvidence(context.before, context.after, ["w:n:b1", "b:n:b8"], result)).toThrow();
});
it("isole le bilan du premier échange même si la suite ajoute une autre prise", () => {
  const { context, result, actual } = observation();
  expect(targetExchange(context.after, result, actual.capture!, 4)).toMatchObject({ complete: true, balance: 0 });
});
it("un gain sans défense retirée par l'échange ne prouve pas la contribution de la fourchette", () => {
  const fen = "7r/8/1n6/2Q5/6k1/2N3b1/1P5P/7K b - - 0 1";
  const context = decisionContext({ fen, command: `position fen ${fen}`, turn: "b", label: "Contre-exemple", played: "b6a4", playedSan: "Ca4", terminal: null });
  const result = scriptedResult(context.after, ["Qa3", "Nxc3", "bxc3", "Rxh2+", "Kg1"]);
  const h = tacticalConstraints(context).hypotheses.find((h) => h.kind === "double-threat")!;
  expect(observeTactic(context, h, result)).toMatchObject({ matched: true, exchange: { balance: 0 }, followUp: null,
    evidence: { outcome: "loss-in-line", materialDelta: -1 } });
});
it("une autre pièce prenant la tour ne prouve pas l'exploitation par le cavalier", () => {
  const fen = "r3k3/8/8/3N4/8/8/7P/R6K w - - 0 1";
  const context = decisionContext({ fen, command: `position fen ${fen}`, turn: "w", label: "Contre-exemple", played: "d5c7", playedSan: "Cc7+", terminal: null });
  const result = scriptedResult(context.after, ["Kd7", "Rxa8"]);
  const h = tacticalConstraints(context).hypotheses.find((h) => h.kind === "double-threat")!;
  expect(observeTactic(context, h, result)).toMatchObject({ matched: false, reason: "different-attacker", followUp: null });
});
