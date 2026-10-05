import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { ReviewPosition, ReviewResult } from "../model";
import { boardFromCommand } from "../StudyTree";
import { usableResult } from "../FocusedAnalysis";
import initial from "../../../dev/delayed-tactics-prototype-data.json";
import fresh from "../../../dev/delayed-tactics-fresh-data.json";
import type { DelayedTactic } from "./delayedTactics";
import type { DelayedTacticReport } from "./DelayedTacticVerification";

type Snapshot = {
  source: string; sourceHash: string; manifest: string; manifestHash: string;
  publishable: boolean; independentSemanticValidation: boolean;
  summary: { decisions: number; corroboratedCandidates: number; newConfirmedExplanations: number };
  rows: { engine: string; game: string; index: number; category: string; previousStatus: string; semanticAssessment: string; events: DelayedTactic[] }[];
  constructed: { id: string; engine: string; semanticAssessment: string; report: DelayedTacticReport | null }[];
};
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
it.each([["conservé", initial, 126], ["neuf", fresh, 91]] as const)("conserve le dénominateur et les faits légaux de l'échantillon %s sans vérité pédagogique générée", (_, data, expected) => {
  const snapshot = data as unknown as Snapshot;
  expect(snapshot.publishable).toBe(false); expect(snapshot.independentSemanticValidation).toBe(false);
  expect(hash(read(snapshot.source))).toBe(snapshot.sourceHash);
  expect(hash(read(snapshot.manifest))).toBe(snapshot.manifestHash);
  const audit = JSON.parse(read(snapshot.source).toString()) as { games: { engine: string; id: string; complete: boolean; decisions: { index: number; category: string; status: string }[] }[] };
  const decisions = audit.games.flatMap(g => {
    expect(g.complete).toBe(true);
    return g.decisions.map(d => [g.engine, g.id, d.index, d.category, d.status]);
  });
  expect(snapshot.rows.map(r => [r.engine, r.game, r.index, r.category, r.previousStatus])).toEqual(decisions);
  expect(snapshot.summary.decisions).toBe(expected); expect(snapshot.rows).toHaveLength(expected);
  expect(snapshot.summary.corroboratedCandidates).toBe(0); expect(snapshot.summary.newConfirmedExplanations).toBe(0);
  for (const row of snapshot.rows) {
    expect(row.semanticAssessment).toBe("pending");
    for (const event of row.events) {
      expect(event.ply).toBeGreaterThan(1); expect(event.ply).toBeLessThanOrEqual(6);
      const board = boardFromCommand(event.frame.command);
      expect(board.fen()).toBe(event.frame.fen);
      const attacker = event.frame.pieces.find(p => p.id === event.attackerId)!;
      for (const id of event.targetIds) {
        const piece = event.frame.pieces.find(p => p.id === id)!;
        expect(board.get(piece.square)).toMatchObject({ color: piece.color, type: piece.type });
        if (event.kind === "double-threat") expect(board.attackers(piece.square, attacker.color)).toContain(attacker.square);
      }
      if (event.rootPath) { expect(event.rootPath[0]).toBe(0); expect(event.rootPath.at(-1)).toBe(event.ply); }
    }
  }
  for (const example of snapshot.constructed) {
    expect(example.semanticAssessment).toBe("pending"); expect(example.report?.publishable).toBe(false);
    for (const pass of example.report?.passes ?? []) for (const question of pass.questions) {
      expect(boardFromCommand(question.position.command).fen()).toBe(question.position.fen);
      expect(usableResult(question.position as ReviewPosition, question.result as ReviewResult)).toBe(true);
    }
  }
}, 10000);
