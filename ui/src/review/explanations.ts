import { Chess, type Move } from "chess.js";
import { materialBalance } from "../material";
import { boardFromCommand } from "./StudyTree";
import {
  frenchSan,
  type ReviewPosition,
  type ReviewResult,
  type VariationMove,
} from "./model";
import type { Annotation } from "./annotations";

export type ExplanationStep = {
  fen: string;
  command: string;
  label: string;
  text: string;
  move: Move | null;
};
export type ExplanationLine = {
  title: string;
  steps: ExplanationStep[];
  truncated: boolean;
};
export type MoveExplanation = {
  summary: string;
  concrete: boolean;
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
const camp = (color: string) => (color === "w" ? "les Blancs" : "les Noirs");
const limit = 8;
function stepText(board: Chess, move: Move) {
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
    };
  } catch {
    return null;
  }
}
function settled(line: ExplanationLine) {
  if (line.truncated) return false;
  const last = line.steps.at(-1)!;
  if (!last.move?.captured) return true;
  // Ne pas présenter une prise comme un gain si une reprise légale existe.
  return !new Chess(last.fen)
    .moves({ verbose: true })
    .some((move) => move.captured && move.to === last.move!.to);
}
export function explainMove(
  position: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  annotation: Annotation | null,
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
  if (!played) return fallback;
  const end = new Chess(played.steps.at(-1)!.fen);
  if (end.isCheckmate())
    return {
      ...fallback,
      concrete: true,
      summary:
        played.steps.length === 2
          ? "Ce coup donne échec et mat."
          : `La suite trouvée se termine par un mat pour ${camp(end.turn() === "w" ? "b" : "w")}.`,
    };
  const first = played.steps[1].move!;
  if (first.promotion) {
    const values = { q: 9, r: 5, b: 3, n: 3 };
    const gain = values[first.promotion as keyof typeof values] - 1;
    return {
      ...fallback,
      concrete: true,
      summary: `Ce coup transforme le pion en ${names[first.promotion]} : ${gain} points de matériel supplémentaires${first.captured ? ", en plus de la capture" : ""}.${played.steps.length > 2 ? " La suite montre la réponse adverse." : ""}`,
    };
  }
  const bad =
    annotation &&
    ["inaccuracy", "mistake", "blunder", "miss"].includes(annotation.category);
  if (
    annotation &&
    before?.score &&
    after?.score &&
    !before.score.bound &&
    !after.score.bound &&
    settled(played) &&
    played.steps.length > 2
  ) {
    const sign = position.turn === "w" ? 1 : -1;
    const delta =
      (materialBalance(end) - materialBalance(new Chess(position.fen))) * sign;
    const alternativeDelta =
      alternative && settled(alternative)
        ? (materialBalance(new Chess(alternative.steps.at(-1)!.fen)) -
            materialBalance(new Chess(position.fen))) *
          sign
        : null;
    if (
      bad &&
      delta < 0 &&
      alternativeDelta !== null &&
      alternativeDelta > delta
    )
      return {
        ...fallback,
        concrete: true,
        summary: `Dans la suite analysée, ${camp(position.turn === "w" ? "b" : "w")} gagnent ${-delta} point${delta < -1 ? "s" : ""} de matériel. La suite proposée en conserve davantage.`,
      };
    if (!bad && delta > 0)
      return {
        ...fallback,
        concrete: true,
        summary: `Dans la suite analysée, ${camp(position.turn)} gagnent ${delta} point${delta > 1 ? "s" : ""} de matériel.`,
      };
  }
  return fallback;
}
