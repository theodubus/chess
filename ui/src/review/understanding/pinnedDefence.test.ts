import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { decisionContext } from "./context";
import { tacticalFrame } from "./constraints";
import { divertedDefence } from "./divertedDefence";
import { divertedDefenceInput, DivertedDefenceTestEngine } from "./divertedDefenceTestEngine";
import { DivertedDefenceVerification } from "./DivertedDefenceVerification";
import { divertedDefenceDraft } from "./divertedDefenceDraft";
import { confirmedConsequence } from "../directExplanation";
import { PedagogicalAnalysis } from "./PedagogicalAnalysis";
import { Chess } from "chess.js";
import { divertedDefenceCases } from "./divertedDefenceTestEngine";

it("les positions construites n'ont pas déjà mis en échec le roi hors trait", () => {
  for (const test of divertedDefenceCases) {
    const board = new Chess(test.fen); test.prefix.forEach((s) => board.move(s));
    const king = board.board().flat().find((p) => p?.type === "k" && p.color !== board.turn())!;
    expect(board.isAttacked(king.square, board.turn()), test.id).toBe(false);
  }
});

it.each(["pin-white", "pin-black", "pin-queen-white", "pin-queen-black"])("le défenseur reste aligné mais sa reprise découvrirait son roi : %s", (id) => {
  const { source } = divertedDefenceInput(id), c = decisionContext(source.position, source.result), h = divertedDefence(c)!;
  expect(h.pin?.kind).toBe("absolute"); expect(h.pin!.shield.id).toBe(h.defenderId);
  expect(h.pin!.rear.type).toBe("k"); expect(h.pin!.scope).toBe("actual-turn");
  const board = boardFromCommand(c.frames[c.decision + 4].command), victim = c.after.pieces.find((p) => p.id === h.victimId)!;
  expect(board.attackers(victim.square, c.before.turn)).toContain(h.defenderTo);
  expect(h.pin!.legalMoves).not.toContain(h.defenderTo + victim.square);
  expect(h.pin!.legalMoves).toContain(id.endsWith("white") ? "d5d8" : "d4d1");
  expect(h.before.recaptures.some((r) => r.defenderId === h.defenderId)).toBe(true);
  expect(h.after.recaptures.some((r) => r.defenderId === h.defenderId)).toBe(false);
});
it.each(["unconstrained", "relative"])("un alignement conservé et une reprise légale ne deviennent pas une défense supprimée : %s", (id) => {
  const { source } = divertedDefenceInput(id), c = decisionContext(source.position, source.result);
  expect(divertedDefence(c)).toBeNull();
  if (id === "relative") expect(tacticalFrame(c.frames[c.decision + 4]).pins.some((p) => p.kind === "relative-alignment" && p.shield.square === "d5")).toBe(true);
});
it.each(["pin-white", "pin-black", "pin-queen-white", "pin-queen-black"])("explique la reprise devenue illégale et conserve l'échange avec le cloueur : %s", async (id) => {
  const { source, request } = divertedDefenceInput(id), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source));
  expect(report, check.error).toMatchObject({ status: "supported", reason: "stable-loss", searches: 8 });
  const delta = id.includes("queen") ? -9 : -5;
  expect(report!.passes.every((p) => p.hypothesis?.pin?.kind === "absolute" && p.evidence?.materialDelta === delta)).toBe(true);
  const draft = divertedDefenceDraft(source.position, report!)!;
  expect(draft.title).toContain("cloué après la reprise"); expect(draft.summary).toContain("exposerait son roi");
  expect(draft.summary).not.toContain("immobilisé"); expect(draft.played).toHaveLength(6);
  expect(draft.evidence.playedMoves.at(-1)).toBe(id.includes("queen") ? id.endsWith("white") ? "e7d8" : "e2d1" : id.endsWith("white") ? "e8d8" : "e1d1");
  expect(draft.played[2].marks).toContainEqual({ from: id.endsWith("white") ? "d8" : "d1", to: id.endsWith("white") ? "d1" : "d8", tone: "observation" });
  const view = confirmedConsequence(draft, source.position);
  for (const step of view.steps) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
  expect(view.steps.at(-1)!.text).toContain(`−${-delta} points`);
  const forged = structuredClone(report!); forged.passes[0].hypothesis!.pin!.attacker.id = "other";
  expect(() => divertedDefenceDraft(source.position, forged)).toThrow("périmé");
});
it.each(["unconstrained", "relative"])("la recherche ne publie pas une perte dont la reprise demeure légale : %s", async (id) => {
  const { source, request } = divertedDefenceInput(id), check = new DivertedDefenceVerification([10, 20]);
  const report = await check.verify(request, async () => new DivertedDefenceTestEngine(source));
  expect(report, check.error).toMatchObject({ status: "indeterminate", reason: "unconfirmed-relation" });
  expect(divertedDefenceDraft(source.position, report!)).toBeNull();
});
it("le contrôleur retrouve le défenseur cloué dans l'analyse du coup joué", async () => {
  const { source, request } = divertedDefenceInput("pin-white"), check = new PedagogicalAnalysis([10, 20]);
  const result = await check.analyse({ ...request, result: { ...source.result!, score: { kind: "cp", value: 200 } }, category: "blunder" },
    async () => new DivertedDefenceTestEngine(source));
  expect(result, check.error).toMatchObject({ status: "supported", attempts: 1, searches: 8 });
  expect(result!.consequence!.title).toContain("cloué après la reprise");
});
