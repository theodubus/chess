import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { Chess } from "chess.js";
import { gamePositions, legalVariation } from "../model";
import { categories } from "../annotations";
import { corpus, corpusInput } from "./corpus";
import { decisionContext } from "./context";
import { draftExchange, draftPlacement, type PedagogicalDraft } from "./draftModel";
import { TacticalEffectVerification, TacticalVerification } from "./TacticalVerification";
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
it("la menace adverse reste expliquée quand la branche libre ne valide pas l'alternative", async () => {
  const { understanding, report, draft } = await example("byrne-allows-fork");
  expect(draft!.role).toBe("allows-loss");
  expect(draft!.played[0].fen).toBe(understanding.context.after.fen);
  expect(draft!.played[1].label).toBe("Ca4");
  expect(report.passes[0].contrast.prefix).toEqual(["b6a4"]);
  expect(draft!.alternative).toEqual([]);
  expect(draft!.evidence.scope).toBe("observed-consequence");
  legal(draft!);
});
it.each(["allows-fork", "allows-fork-other-defence", "allows-fork-white"])("explique d'abord la menace et la perte du mauvais coup, indépendamment de l'alternative : %s", async (id) => {
  const { draft } = await example(id);
  expect(draft!.role).toBe("allows-loss");
  expect(draft!.title).toBe("Une fourchette permise à l'adversaire");
  expect(draft!.summary).toContain("Ce coup permet cette menace");
  expect(draft!.summary).toContain("−5 points");
  expect(draft!.summary).not.toContain("Avec ");
  expect(draft!.played).toHaveLength(4);
  expect(draft!.played[1].label).toBe(id === "allows-fork-white" ? "Cc2+" : "Cc7+");
  expect(draft!.played.at(-1)!.label).toBe(id === "allows-fork-white" ? "Cxa1" : "Cxa8");
  expect(draft!.alternative[1].origin).toBe("conditional-move");
  legal(draft!);
});
it("deux défenses comparées donnent la même explication du mauvais coup sans inventer un choix unique", async () => {
  const first = await example("allows-fork"), second = await example("allows-fork-other-defence");
  expect(first.draft!.summary).toBe(second.draft!.summary);
  expect(first.draft!.played).toEqual(second.draft!.played);
  expect(first.draft!.comparisonText).not.toBe(second.draft!.comparisonText);
  expect(`${first.draft!.summary} ${second.draft!.comparisonText}`).not.toMatch(/seul bon coup|unique défense|meilleur coup/);
});
it.each(["allows-fork", "allows-fork-white", "byrne-allows-fork"])("explique la perte directement, sans rechercher ni proposer un coup de remplacement : %s", async (id) => {
  const { understanding, hypothesisIndex, alternative } = tacticalInput(id);
  const request = { understanding, hypothesisIndex, review: {}, revision: 0, engineId: "script" };
  const check = new TacticalEffectVerification([10, 20]);
  const report = await check.verify(request, async () => new ScriptEngine({ ...request, alternative }, id));
  expect(report, check.error).not.toBeNull();
  expect(report!.passes.every((p) => p.questions.map((q) => q.purpose).join() === "decision,played")).toBe(true);
  const draft = tacticalDraft(understanding, report!)!;
  expect(draft).toMatchObject({ role: "allows-loss", evidence: { scope: "observed-consequence", alternativeMoves: [] }, alternative: [], comparisonText: "" });
  expect(draft.summary).toContain("permet cette menace");
  expect(draft.summary).not.toMatch(/Avec |meilleur|seul bon/);
  expect(draft.played[0].fen).toBe(understanding.context.after.fen);
  if (id === "byrne-allows-fork") {
    expect(draft.family).toBe("exchanged-defender");
    expect(draft.summary).toContain("vaut 0 points");
    expect(draft.summary).toContain("défendait e4");
    expect(draft.summary).toContain("−1 point");
  } else expect(draft.played).toHaveLength(4);
  legal(draft);
});
it("une alternative qui permet une autre fourchette est écartée, sans perdre l'explication du coup joué", async () => {
  const { report, draft } = await example("allows-fork-false-defence");
  expect(report.status).toBe("supported");
  expect(report.attribution.status).toBe("not-established");
  expect(report.passes.every((p) => p.contrast.evidence?.outcome === "preserved" && p.freeAlternative?.outcome === "loss-in-line")).toBe(true);
  expect(draft).toMatchObject({ family: "double-targets", alternative: [], comparisonText: "", evidence: { scope: "observed-consequence" } });
  expect(draft!.summary).toContain("−5 points");
  expect(draft!.summary).not.toContain("Rc8");
  legal(draft!);
});
it("une observation favorable seule n'est ni une justification du meilleur coup, ni une preuve de mauvais choix ailleurs", async () => {
  const id = "fork-direct", { understanding, hypothesisIndex, alternative } = tacticalInput(id);
  const request = { understanding, hypothesisIndex, review: {}, revision: 0, engineId: "script" };
  const check = new TacticalEffectVerification([10, 20]);
  const report = await check.verify(request, async () => new ScriptEngine({ ...request, alternative }, id));
  expect(report?.status).toBe("supported");
  expect(tacticalDraft(understanding, report!)).toBeNull();
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
