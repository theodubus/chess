import { positionObservation, type PositionalNotes } from "./positional";
import { Chess, type Move } from "chess.js";
import { boardFromCommand } from "./StudyTree";
import {
  frenchSan,
  type ReviewPosition,
  type ReviewResult,
  type VariationMove,
} from "./model";
import { advantage, type Annotation } from "./annotations";
import type { TacticalMark } from "./tactics";
import { decisionCause, type CauseCandidate } from "./decisionCause";
import { recaptureObservation } from "./understanding/recaptureObservation";

export type ExplanationStep = {
  fen: string;
  command: string;
  label: string;
  text: string;
  move: Move | null;
  motif?: string;
  marks?: TacticalMark[];
};
export type ExplanationLine = {
  kind?: "observation" | "cause";
  title: string;
  steps: ExplanationStep[];
  truncated: boolean;
  verifiedEnding?: { fen: string; capture: string | null };
  verifiedSteps?: ExplanationStep[];
};
export type MoveExplanation = {
  summary: string;
  concrete: boolean;
  primary?: "alternative";
  observations?: PositionalNotes;
  proof?: ExplanationLine;
  comparison?: ExplanationLine;
  candidate?: CauseCandidate;
  context?: string;
  limitation?: string;
  played: ExplanationLine | null;
  alternative: ExplanationLine | null;
};
const names = {
  p: "pion",
  n: "cavalier",
  b: "fou",
  r: "tour",
  q: "dame",
  k: "roi",
};
const limit = 8;
export function stepText(board: Chess, move: Move) {
  const subject = move.color === "w" ? "Les Blancs" : "Les Noirs";
  if (board.isCheckmate()) return `${subject} font échec et mat.`;
  let text = move.promotion
    ? `${subject} promeuvent leur pion en ${names[move.promotion]}.`
    : move.captured
      ? `${subject} capturent ${["q", "r"].includes(move.captured) ? "la" : "le"} ${names[move.captured]}${move.isEnPassant() ? " en passant" : ` en ${move.to}`}.`
      : move.isKingsideCastle() || move.isQueensideCastle()
        ? `${subject} roquent.`
        : `${subject} jouent ${frenchSan(move.san)}.`;
  if (move.promotion && move.captured)
    text += ` La promotion capture aussi ${["q", "r"].includes(move.captured) ? "la" : "le"} ${names[move.captured]}.`;
  if (board.isCheck()) text += " Le roi adverse est en échec.";
  return text;
}
function buildLine(
  position: ReviewPosition,
  variation: VariationMove[],
  includePlayed: boolean,
): ExplanationLine | null {
  try {
    const board = boardFromCommand(position.command);
    if (board.fen() !== position.fen) return null;
    const steps: ExplanationStep[] = [
      {
        fen: board.fen(),
        command: position.command,
        label: "Avant le coup",
        text: "Position avant la décision à examiner.",
        move: null,
      },
    ];
    let command = position.command;
    const push = (move: Move) => {
      command += `${command.includes(" moves ") ? " " : " moves "}${move.from}${move.to}${move.promotion ?? ""}`;
      steps.push({
        fen: board.fen(),
        command,
        label: `${move.before.split(" ")[5]}${move.color === "w" ? "." : "…"} ${frenchSan(move.san)}`,
        text: stepText(board, move),
        move,
      });
    };
    if (includePlayed) {
      if (!position.played) return null;
      const uci = position.played;
      push(
        board.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci[4],
        }),
      );
    }
    // Valider la PV entière avant d’en proposer une courte lecture. Une réponse
    // d’une autre position ou une fin illégale ne doit pas servir d’explication.
    for (const item of variation) {
      const move = board
        .moves({ verbose: true })
        .find(
          (candidate) =>
            candidate.from === item.from &&
            candidate.to === item.to &&
            candidate.after === item.fen,
        );
      if (!move) return null;
      board.move(move);
      push(move);
    }
    if (steps.length < 2) return null;
    return {
      title: includePlayed ? "Après le coup joué" : "La meilleure idée trouvée",
      steps: steps.slice(0, limit + 1),
      truncated: steps.length > limit + 1,
      verifiedSteps: steps,
      verifiedEnding: {
        fen: board.fen(),
        capture: steps.at(-1)!.move?.captured ? steps.at(-1)!.move!.to : null,
      },
    };
  } catch {
    return null;
  }
}
function exactComparison(
  before: ReviewResult | null,
  after: ReviewResult | null,
  turn: ReviewPosition["turn"],
) {
  return (
    !!before?.score &&
    !!after?.score &&
    !before.score.bound &&
    !after.score.bound &&
    Number.isFinite(before.score.value) &&
    Number.isFinite(after.score.value) &&
    advantage(before.score, turn) !== null &&
    advantage(after.score, turn) !== null
  );
}
function baseExplanation(
  position: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  annotation: Annotation | null,
  checkCause = true,
): MoveExplanation {
  let played = buildLine(position, after?.variation ?? [], true);
  const reply = played?.steps[2]?.move;
  if (
    reply &&
    `${reply.from}${reply.to}${reply.promotion ?? ""}` !== after?.bestMove
  )
    played = null;
  const candidate =
    before?.bestMove !== position.played
      ? buildLine(position, before?.variation ?? [], false)
      : null;
  const firstAlternative = candidate?.steps[1]?.move;
  const alternative =
    firstAlternative &&
    `${firstAlternative.from}${firstAlternative.to}${firstAlternative.promotion ?? ""}` ===
      before?.bestMove
      ? candidate
      : null;
  const fallback: MoveExplanation = {
    summary:
      "La cause précise de ce verdict n’est pas encore identifiée. Vous pouvez examiner les suites trouvées.",
    concrete: false,
    played,
    alternative,
  };
  if (!played || !checkCause) return fallback;
  return decisionCause(position, before, after, annotation, fallback);
}

export function explainMove(
  position: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  annotation: Annotation | null,
  checkCause = true,
): MoveExplanation {
  const recapture = recaptureObservation(position, after);
  // Le gain depuis une reprise ne prouve pas un échange globalement gagnant,
  // ni que cette décision est la meilleure. Le mat joué garde sa preuve légale.
  const base = baseExplanation(position, before, after, annotation, checkCause && !recapture);
  if (recapture) base.context = recapture.text;
  if (!base.played) return base;
  const compare = !!annotation && exactComparison(before, after, position.turn);
  const observations = {
    played: positionObservation(base.played),
    alternative: compare ? positionObservation(base.alternative, true) : null,
  };
  if (observations.played || observations.alternative)
    base.observations = observations;
  return base;
}

/** Variante candidate complète validée, commune aux explications et aux indices. */
export function candidateLine(
  position: ReviewPosition,
  result: ReviewResult,
): ExplanationLine | null {
  const line = buildLine(position, result.variation, false);
  const first = line?.steps[1]?.move;
  return first &&
    `${first.from}${first.to}${first.promotion ?? ""}` === result.bestMove
    ? line
    : null;
}
