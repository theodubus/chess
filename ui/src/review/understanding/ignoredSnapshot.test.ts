import { expect, it } from "vitest";
import data from "../../../dev/ignored-threat-data.json";
import first from "../../../dev/ignored-threat-first-data.json";
import { usableResult } from "../FocusedAnalysis";
import { boardFromCommand } from "../StudyTree";
import { ignoredThreatInput } from "./ignoredThreatTestEngine";
import { ignoredThreatDraft } from "./ignoredThreatDraft";
import type { IgnoredThreatReport } from "./IgnoredThreatVerification";
import type { PreviewDocument, PreviewExample } from "./previewModel";

type Snapshot = PreviewDocument & { examples: (PreviewExample & { verification: IgnoredThreatReport | null })[] };
it("conserve les deux essais réels et leurs abstentions sans les traiter comme vérité pédagogique", () => {
  for (const snapshot of [data, first] as unknown as Snapshot[]) {
    expect(snapshot).toMatchObject({ publishable: false, independentSample: false });
    expect(snapshot.examples).toHaveLength(8);
    expect(new Set(snapshot.examples.map(e => e.engine))).toEqual(new Set(["ShallowRed", "Stockfish"]));
    for (const record of snapshot.examples) {
      expect(record.origin).toBe("constructed"); expect(record.engineHash).toMatch(/^[a-f0-9]{64}$/);
      const report = record.verification;
      if (!report) { expect(record.draft).toBeNull(); continue; }
      expect(report.passes).toHaveLength(2); expect(report.searches).toBeLessThanOrEqual(6);
      for (const pass of report.passes) for (const question of pass.questions) {
        expect(boardFromCommand(question.position.command).fen()).toBe(question.position.fen);
        expect(usableResult(question.position, question.result)).toBe(true);
      }
    }
  }
  for (const record of (data as unknown as Snapshot).examples) {
    const input = ignoredThreatInput(record.id.slice("ignored-".length));
    const draft = record.verification ? ignoredThreatDraft(input.source.position, record.verification) : null;
    if (!draft) expect(record.draft).toBeNull();
    else {
      expect(record.draft!.evidence).toEqual(draft.evidence);
      expect(record.draft!.played.map(s => [s.command, s.fen, s.marks])).toEqual(draft.played.map(s => [s.command, s.fen, s.marks]));
    }
  }
}, 15000);
