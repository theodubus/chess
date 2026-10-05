import { expect, it } from "vitest";
import data from "../../../dev/diverted-defence-data.json";
import pinnedData from "../../../dev/pinned-defence-data.json";
import { boardFromCommand } from "../StudyTree";
import { usableResult } from "../FocusedAnalysis";
import { corpusInput } from "./corpus";
import { divertedDefenceCases } from "./divertedDefenceTestEngine";
import { divertedDefenceDraft } from "./divertedDefenceDraft";
import type { DivertedDefenceReport } from "./DivertedDefenceVerification";
import type { PreviewDocument, PreviewExample } from "./previewModel";

type VerifiedPreview = PreviewDocument & { examples: (PreviewExample & { verification: DivertedDefenceReport | null })[] };
function checkSnapshot(snapshot: VerifiedPreview, count: number) {
  expect(snapshot).toMatchObject({ schema: 1, publishable: false, independentSample: false });
  expect(snapshot.examples).toHaveLength(count);
  expect(new Set(snapshot.examples.map((e) => e.engine))).toEqual(new Set(["ShallowRed", "Stockfish"]));
  for (const record of snapshot.examples) {
    expect(record.engineHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.origin).toBe("constructed");
    const source = corpusInput(divertedDefenceCases.find((c) => "diverted-" + c.id === record.id)!);
    const report = record.verification;
    if (!report) { expect(record.draft).toBeNull(); expect(record.error).not.toBeNull(); continue; }
    expect(report.passes).toHaveLength(2); expect(report.searches).toBeLessThanOrEqual(8);
    for (const pass of report.passes) for (const q of pass.questions) {
      expect(boardFromCommand(q.position.command).fen()).toBe(q.position.fen);
      expect(usableResult(q.position, q.result)).toBe(true);
    }
    const current = divertedDefenceDraft(source.position, report);
    if (!current) expect(record.draft).toBeNull();
    else {
      expect(record.draft).not.toBeNull();
      expect(record.draft!.evidence).toEqual(current.evidence);
      expect(record.draft!.played.map((s) => [s.command, s.fen, s.marks])).toEqual(current.played.map((s) => [s.command, s.fen, s.marks]));
      for (const step of record.draft!.played) expect(boardFromCommand(step.command).fen()).toBe(step.fen);
    }
  }
}
it("l'instantané réel conserve provenance, questions et abstentions sans vérité pédagogique", () => {
  checkSnapshot(data as unknown as VerifiedPreview, 6);
}, 15000);
it("le modèle de clouage garde les cas réels non confirmés visibles dans l'aperçu", () => {
  checkSnapshot(pinnedData as unknown as VerifiedPreview, 12);
}, 15000);
