import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { Chess } from "chess.js";
import { gamePositions, legalVariation } from "../model";
import { categories } from "../annotations";
import { corpus, corpusInput } from "./corpus";
import { decisionContext } from "./context";
import { draftExchange, draftPlacement, type PedagogicalDraft } from "./draftModel";
import { TacticalVerification } from "./TacticalVerification";
import { tacticalInput } from "./tacticalCases";
import { ScriptEngine } from "./tacticalTestEngine";
import { tacticalDraft } from "./tacticalDraft";
import { MateVerification } from "./MateVerification";
import { mateDraft } from "./mateDraft";
import { MateScriptEngine, mateTestRequest } from "./mateTestEngine";

async function example(id: string) {
  const { understanding, hypothesisIndex, alternative } = tacticalInput(id);
  const request = { understanding, hypothesisIndex, alternative, review: {}, revision: 0, engineId: "script" };
  const check = new TacticalVerification([10, 20]);
  const report = await check.verify(request, async () => new ScriptEngine(request, id));
  expect(report, check.error).not.toBeNull();
  return { understanding, report: report!, draft: tacticalDraft(understanding, report!) };
}
function legal(draft: PedagogicalDraft) {
  for (const branch of [draft.played, draft.alternative]) {
    expect(branch.length).toBeLessThanOrEqual(9);
    for (const step of branch) {
      expect(boardFromCommand(step.command).fen()).toBe(step.fen);
      expect(step.marks.every((m) => /^[a-h][1-8]$/.test(m.from) && (!m.to || /^[a-h][1-8]$/.test(m.to)))).toBe(true);
    }
  }
  expect(`${draft.summary} ${draft.comparisonText}`).not.toMatch(/commence un échange gagnant|contre toutes les défenses|coup parfait|est le meilleur coup/);
}
it.each(["fork-direct", "fork-black"])("explique le roi et la tour sans rejouer la décision ni poursuivre une PV longue : %s", async (id) => {
  const { understanding, draft } = await example(id);
  expect(draft).toMatchObject({ status: "draft", family: "double-targets", evidence: { materialDelta: -5 } });
  expect(draft!.summary).toContain("en échec");
  expect(draft!.summary).toContain("prend l'autre");
  expect(draft!.played).toHaveLength(3);
  expect(draft!.alternative).toHaveLength(2);
  expect(draft!.played[0].fen).toBe(understanding.context.after.fen);
  expect(draft!.played[0].marks).toHaveLength(2);
  legal(draft!);
});
it("explique la perte de la défense e4 après un échange égal, avec la reprise conditionnelle réellement comparée", async () => {
  const { draft } = await example("byrne-22");
  expect(draft).toMatchObject({ family: "exchanged-defender", evidence: { materialDelta: -1 }, played: expect.any(Array) });
  expect(draft!.summary).toContain("vaut 0 points");
  expect(draft!.summary).toContain("défendait e4");
  expect(draft!.summary).toContain("−1 point");
  expect(draft!.comparisonText).toContain("Si la même prise");
  expect(draft!.alternative.filter((s) => s.origin === "conditional-move").map((s) => s.label)).toEqual(["Cxe4"]);
  expect(draft!.played).toHaveLength(5);
  legal(draft!);
});
it("la comparaison adverse conserve son préfixe hypothétique, sans le confondre avec la PV libre", async () => {
  const { understanding, draft } = await example("byrne-allows-fork");
  expect(draft!.role).toBe("allows-loss");
  expect(draft!.played[0].fen).toBe(understanding.context.after.fen);
  expect(draft!.played[1].label).toBe("Ca4");
  expect(draft!.alternative.filter((s) => s.origin === "conditional-move").map((s) => s.label)).toEqual(["Ca4", "Cxe4"]);
  legal(draft!);
});
it("le clouage explique une retraite interdite, pas seulement un alignement ou un développement", async () => {
  const { draft } = await example("pin-retreat");
  expect(draft!.summary).toContain("sans exposer son roi");
  expect(draft!.comparisonText).toContain("Cb4, désormais légal");
  expect(draft!.comparisonText).toContain("sans enlever cette pression");
  expect(draft!.played.at(-1)!.note).toContain("alors qu'une reprise reste légale");
  expect(draft!.played).toHaveLength(4);
  expect(draft!.played.at(-1)!.label).toBe("bxc6");
  expect(draft!.evidence.playedMoves.at(-1)).toBe("b5e2");
  expect(draft!.summary).not.toMatch(/développement|centre|immobile|aucun déplacement/);
  legal(draft!);
});
it("aucun texte causal si la pression change ou si l'attribution est indéterminée", async () => {
  const { understanding, report, draft } = await example("pin-defence-changed");
  expect(draft).toBeNull();
  const supported = await example("pin-retreat");
  expect(tacticalDraft(supported.understanding, { ...supported.report, status: "indeterminate" })).toBeNull();
  expect(tacticalDraft(understanding, report)).toBeNull();
});
it("refuse de réutiliser un brouillon soutenu pour une autre position ou alternative", async () => {
  const source = await example("fork-direct"), other = tacticalInput("fork-black");
  expect(() => tacticalDraft(other.understanding, source.report)).toThrow();
  expect(() => tacticalDraft(source.understanding, { ...source.report, alternative: "d5b4" })).toThrow();
  expect(() => tacticalDraft(source.understanding, { ...source.report,
    hypothesis: { ...source.report.hypothesis, targetIds: ["foreign-rook"] } })).toThrow();
});
it("un motif favorable ne sert pas d'explication principale à une erreur", async () => {
  const { draft } = await example("pin-retreat");
  for (const category of Object.keys(categories) as (keyof typeof categories)[]) {
    const placed = draftPlacement(draft!, category);
    if (["mistake", "blunder", "inaccuracy", "miss", "forced", "book"].includes(category)) expect(placed).toBe("secondary");
    else expect(placed).toBe("candidate-primary");
  }
  expect(draftPlacement({ role: "allows-loss" }, "mistake")).toBe("candidate-primary");
  expect(draftPlacement({ role: "allows-loss" }, "good")).toBe("secondary");
});
it.each(["normal", "short"] as const)("le mat montre la déviation puis le mat, avec origine conservée : %s", async (mode) => {
  const request = mateTestRequest(), check = new MateVerification([10, 20]);
  const report = await check.verify(request, async () => new MateScriptEngine(request, mode));
  expect(report, check.error).not.toBeNull();
  const draft = mateDraft(request.understanding, report!)!;
  expect(draft).toMatchObject({ family: "deflection-mate", evidence: { playedMoves: ["d7b8", "d1d8"], materialDelta: null } });
  expect(draft.played).toHaveLength(3);
  expect(draft.alternative).toHaveLength(1);
  expect(draft.played[2].origin).toBe(mode === "short" ? "rules" : "engine-line");
  expect(draft.summary).toContain("la seule réponse légale");
  expect(draft.played[1].note).toContain("Td8#");
  expect(draft.limitation).toContain("mat plus long");
  legal(draft);
});
it("ne transforme pas un autre choix moteur ou un contraste absent en jugement du meilleur coup", async () => {
  const request = mateTestRequest(), check = new MateVerification([10, 20]);
  const report = await check.verify(request, async () => new MateScriptEngine(request, "other-choice"));
  expect(report!.quality).toBe("not-established");
  expect(mateDraft(request.understanding, report!)!.summary).not.toContain("meilleur");
  expect(mateDraft(request.understanding, { ...report!, contrast: { ...report!.contrast, status: "not-established" } })).toBeNull();
});
it("une reprise utile reste située dans l'échange antérieur perdant", () => {
  const test = corpus.find((c) => c.id === "losing-exchange-recapture")!;
  const { position, result } = corpusInput(test);
  const context = decisionContext(position, result);
  const note = draftExchange(context, context.moves.slice(context.decision + 1).map((m) => m.lan));
  expect(note.exchange).toMatchObject({ role: "recapture", totalBalance: -1 });
  expect(note.contextText).toContain("échange déjà commencé");
  expect(note.contextText).not.toContain("commence");
});
it("un historique complet distingue le gain de la reprise du bilan négatif de l'échange", () => {
  const board = new Chess();
  for (const move of ["e4", "e5", "d3", "Nc6", "Be3", "Nf6", "Nf3", "d5", "exd5", "Qxd5", "Nc3", "Qd4", "a3", "Ng4", "b3", "Nxe3", "fxe3", "Qxe3+"]) board.move(move);
  const position = gamePositions(board.pgn())[16];
  const after = boardFromCommand(position.command); after.move(position.played!);
  const context = decisionContext(position, { score: null, depth: null, bestMove: "d4e3", bestSan: null, variation: legalVariation(after.fen(), ["d4e3"]) });
  const note = draftExchange(context, ["d4e3"]);
  expect(note.exchange).toMatchObject({ role: "recapture", beginning: "known", totalBalance: -1, balanceFromDecision: 2 });
  expect(note.contextText).toContain("échange entier vaut −1 point");
  expect(note.contextText).toContain("+2 points à partir de cette reprise");
});
