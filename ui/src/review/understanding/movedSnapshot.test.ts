import { expect, it } from "vitest";
import first from "../../../dev/moved-piece-first-data.json";
import data from "../../../dev/moved-piece-data.json";
import { usableResult } from "../FocusedAnalysis";
import { boardFromCommand } from "../StudyTree";
import { movedPieceInput } from "./movedPieceTestEngine";
import { captureLossDraft } from "./captureLossDraft";
import type { CaptureLossReport } from "./CaptureLossVerification";
import type { MovedPieceExposure } from "./movedPieceExposure";
import type { PreviewDocument, PreviewExample } from "./previewModel";

type Snapshot = PreviewDocument & { examples: (PreviewExample & { verification: CaptureLossReport<MovedPieceExposure> | null })[] };
it("conserve les essais d'exposition, leurs bilans et abstentions sans vérité pédagogique générée", () => {
  for (const [snapshot, count] of [[first, 16], [data, 18]] as const) {
    const document = snapshot as unknown as Snapshot;
    expect(document).toMatchObject({ publishable: false, independentSample: false });
    expect(document.examples).toHaveLength(count);
    expect(new Set(document.examples.map(e => e.engine))).toEqual(new Set(["ShallowRed", "Stockfish"]));
    for (const record of document.examples) {
      expect(record.origin).toBe("constructed"); expect(record.engineHash).toMatch(/^[a-f0-9]{64}$/);
      const report = record.verification;
      if (!report) { expect(record.draft).toBeNull(); continue; }
      expect(report.passes).toHaveLength(2); expect(report.searches).toBeLessThanOrEqual(6);
      for (const pass of report.passes) for (const question of pass.questions) {
        expect(boardFromCommand(question.position.command).fen()).toBe(question.position.fen);
        expect(usableResult(question.position, question.result)).toBe(true);
      }
      const input = movedPieceInput(record.id.slice("moved-".length));
      const draft = captureLossDraft(input.source.position, report);
      if (!draft) expect(record.draft).toBeNull();
      else {
        expect(record.draft!.evidence).toEqual(draft.evidence);
        expect(record.draft!.played.map(s => [s.command, s.fen, s.marks])).toEqual(draft.played.map(s => [s.command, s.fen, s.marks]));
        expect(report.passes.every(p => p.episode!.complete && p.episode!.balanceSinceDecision < 0)).toBe(true);
        for (const step of draft.played) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
      }
      if (record.id === "moved-non-local-loss") expect(report).toMatchObject({ status: "indeterminate", reason: "episode-not-loss" });
    }
  }
}, 20000);
