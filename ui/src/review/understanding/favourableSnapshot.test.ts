import { expect, it } from "vitest";
import first from "../../../dev/favourable-consequence-first-data.json";
import data from "../../../dev/favourable-consequence-data.json";
import { usableResult } from "../FocusedAnalysis";
import { boardFromCommand } from "../StudyTree";
import { confirmedOpportunity } from "../directExplanation";
import { tacticalInput } from "./tacticalCases";
import { tacticalDraft } from "./tacticalDraft";
import type { TacticalEffectReport } from "./TacticalVerification";
import type { PreviewDocument, PreviewExample } from "./previewModel";

type Snapshot = PreviewDocument & { examples: (PreviewExample & { verification: TacticalEffectReport | null })[] };
it("conserve les premières mesures et les conséquences revalidées, sans verdict humain généré", () => {
  for (const [snapshot, drafts] of [[first, 2], [data, 6]] as const) {
    const document = snapshot as unknown as Snapshot;
    expect(document).toMatchObject({ publishable: false, independentSample: false });
    expect(document.examples).toHaveLength(10);
    expect(new Set(document.examples.map(e => e.engine))).toEqual(new Set(["ShallowRed", "Stockfish"]));
    expect(document.examples.filter(e => e.draft)).toHaveLength(drafts);
    for (const record of document.examples) {
      expect(record.engineHash).toMatch(/^[a-f0-9]{64}$/);
      const report = record.verification!;
      expect(report.passes).toHaveLength(2); expect(report.searches).toBe(4);
      for (const pass of report.passes) {
        expect(pass.questions.map(q => q.purpose)).toEqual(["decision", "played"]);
        for (const question of pass.questions) {
          expect(boardFromCommand(question.position.command).fen()).toBe(question.position.fen);
          expect(usableResult(question.position, question.result)).toBe(true);
        }
      }
      const input = tacticalInput(record.id), draft = tacticalDraft(input.understanding, report);
      if (!record.draft) expect(draft).toBeNull();
      else {
        expect(draft).toEqual(record.draft);
        expect(draft!.alternative).toEqual([]);
        expect(confirmedOpportunity(draft!, { command: input.understanding.context.before.command,
          fen: record.beforeFen, turn: input.understanding.context.before.turn, terminal: null,
          label: record.label, played: input.understanding.context.moves[input.understanding.context.decision].lan, playedSan: record.label }).steps.length)
          .toBeLessThanOrEqual(4);
        expect(draft!.summary).toMatch(/\+\d+ points? pour les (Blancs|Noirs)/);
        expect(draft!.summary).not.toMatch(/meilleur|unique|seul bon/);
      }
      if (record.id === "pin-defence-changed" || record.id === "byrne-22") expect(record.draft).toBeNull();
    }
  }
}, 20000);
