import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { explainMove } from "../explanations";
import { directExplanation } from "../directExplanation";
import { gamePositions, type ReviewPosition, type ReviewResult } from "../model";
import { boardFromCommand } from "../StudyTree";
import { recaptureObservation } from "./recaptureObservation";

const best = { category: "best", reason: "", loss: 0 } as const;
const history = ["e4", "e5", "d3", "Nc6", "Be3", "Nf6", "Nf3", "d5", "exd5", "Qxd5", "Nc3", "Qd4", "a3", "Ng4", "b3", "Nxe3"];
function position(prefix: string[], played: string, fen?: string) {
  const board = new Chess(fen);
  prefix.forEach(move => board.move(move));
  const index = board.history().length;
  board.move(played);
  return gamePositions(board.pgn())[index];
}
function result(position: ReviewPosition, variation: string[]): ReviewResult {
  const board = boardFromCommand(position.command);
  board.move(position.played!);
  const moves = variation.map(move => board.move(move));
  return { score: { kind: "cp", value: 0 }, depth: 10, bestMove: moves[0] ? moves[0].from + moves[0].to + (moves[0].promotion ?? "") : null,
    bestSan: moves[0]?.san ?? null, variation: moves.map(move => ({ from: move.from, to: move.to, fen: move.after, label: move.san })) };
}

it("sépare le bilan d'une bonne reprise de l'échange perdant commencé avant elle", () => {
  const p = position(history, "fxe3"), r = result(p, ["Qxe3+", "Qe2", "Qxe2+", "Kxe2"]);
  const observation = recaptureObservation(p, r)!;
  expect(observation.exchange).toMatchObject({ beginning: "known", role: "recapture", totalBalance: -1, balanceFromDecision: 2, from: 15, to: 17, recaptureStillPossible: false });
  expect(observation.text).toContain("−1 point");
  expect(observation.text).toContain("+2 points");
  const explanation = explainMove(p, null, r, best);
  expect(explanation.context).toBe(observation.text);
  expect(explanation.concrete).toBe(false);
  expect(explanation.candidate).toBeUndefined();
  expect(explanation.proof).toBeUndefined();
  expect(explanation.played).not.toBeNull();
  expect(explanation.summary).not.toMatch(/commence un échange|gain matériel/);
  expect(directExplanation(explanation, null).context).toBe(observation.text);
});

for (const side of ["w", "b"] as const) {
  it(`ne reconstruit pas le début manquant d'une reprise pour ${side}`, () => {
    const p = side === "w"
      ? position(["Nxd4"], "exd4", "3q3k/8/2n5/8/3B4/4P3/8/7K b - - 0 1")
      : position(["Nxd5"], "exd5", "7k/8/4p3/3b4/8/2N5/8/3Q3K w - - 0 1");
    const observation = recaptureObservation(p, result(p, [side === "w" ? "Qxd4" : "Qxd5"]))!;
    expect(observation.exchange).toMatchObject({ beginning: "unknown", totalBalance: -1, balanceFromDecision: 2, recaptureStillPossible: false });
    expect(observation.text).toContain("bilan total n'est pas connu");
    expect(observation.text).toContain(side === "w" ? "+2 points pour les Blancs" : "+2 points pour les Noirs");
    expect(observation.text).not.toContain("−1 point");
  });
}

it("laisse ouvert l'échange tronqué après la reprise", () => {
  const p = position(history, "fxe3");
  const observation = recaptureObservation(p, null)!;
  expect(observation.exchange.recaptureStillPossible).toBe(true);
  expect(observation.text).toContain("bilan de cet échange n'est pas encore établi");
  expect(observation.text).not.toContain("points");
});

for (const defect of ["bestMove", "fen", "from"] as const) {
  it(`ignore une suite incohérente (${defect}) sans perdre le fait de la reprise`, () => {
    const p = position(history, "fxe3"), r = result(p, ["Qxe3+"]);
    if (defect === "bestMove") r.bestMove = "a7a6";
    else r.variation[0] = { ...r.variation[0], [defect]: defect === "fen" ? p.fen : "a8" };
    const observation = recaptureObservation(p, r)!;
    expect(observation.exchange.includesAnalysedContinuation).toBe(false);
    expect(observation.exchange.recaptureStillPossible).toBe(true);
    const explanation = explainMove(p, null, r, best);
    expect(explanation.candidate).toBeUndefined();
    expect(explanation.context).toBe(observation.text);
  });
}

it("compte la promotion dans le matériel de l'épisode et de la reprise", () => {
  const p = position(["Kg1", "Rxh8"], "gxh8=Q+", "r6N/6Pk/8/8/8/8/7P/7K w - - 0 1");
  const observation = recaptureObservation(p, result(p, ["Kxh8"]))!;
  expect(observation.exchange).toMatchObject({ beginning: "known", totalBalance: 1, balanceFromDecision: 4, recaptureStillPossible: false });
  expect(observation.text).toContain("+1 point pour les Blancs depuis le début");
  expect(observation.text).toContain("+4 points pour les Blancs depuis cette reprise");
});

it("rattache la reprise à une prise en passant de la partie", () => {
  const p = position(["e4", "a6", "e5", "d5", "exd6"], "exd6");
  const observation = recaptureObservation(p, result(p, ["d4"]))!;
  expect(observation.exchange).toMatchObject({ beginning: "known", totalBalance: 0, balanceFromDecision: 1, recaptureStillPossible: false });
  expect(observation.text).toContain("0 points pour les Noirs depuis le début");
});

it("préserve la preuve légale d'une reprise qui donne immédiatement mat", () => {
  const p = position(["Rxg8"], "Rxg8#", "r5Nk/5Q2/5K2/8/8/8/8/6R1 b - - 0 1");
  expect(recaptureObservation(p, null)).toBeNull();
  const explanation = explainMove(p, null, null, best);
  expect(explanation.concrete).toBe(true);
  expect(explanation.summary).toBe("Ce coup donne échec et mat.");
});

it("refuse un historique d'une autre position", () => {
  const p = position(history, "fxe3");
  expect(recaptureObservation({ ...p, fen: new Chess().fen() }, null)).toBeNull();
  expect(recaptureObservation({ ...p, turn: "b" }, null)).toBeNull();
});

it("ne rattache pas une prise initiale à une reprise inexistante", () => {
  const p = position(["e4", "d5"], "exd5");
  expect(recaptureObservation(p, result(p, ["Qxd5", "Nc3"]))).toBeNull();
});
