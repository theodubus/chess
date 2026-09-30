import { Chess, type Move } from "chess.js";
import { materialBalance } from "../material";
import { boardFromCommand } from "./StudyTree";
import {
  frenchSan,
  type ReviewPosition,
  type ReviewResult,
  type VariationMove,
} from "./model";
import { advantage, type Annotation } from "./annotations";
import {
  defensiveIdea,
  tacticalIdeas,
  type TacticalIdea,
  type TacticalMark,
} from "./tactics";

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
  title: string;
  steps: ExplanationStep[];
  truncated: boolean;
  verifiedEnding?: { fen: string; capture: string | null };
};
export type MoveExplanation = {
  summary: string;
  concrete: boolean;
  primary?: "alternative";
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
      verifiedEnding: {
        fen: board.fen(),
        capture: steps.at(-1)!.move?.captured ? steps.at(-1)!.move!.to : null,
      },
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
function outcome(line: ExplanationLine, position: ReviewPosition) {
  const ending = line.verifiedEnding;
  if (!ending) return null;
  const board = new Chess(ending.fen);
  if (
    ending.capture &&
    board
      .moves({ verbose: true })
      .some((move) => move.captured && move.to === ending.capture)
  )
    return null;
  return {
    delta:
      (materialBalance(board) - materialBalance(new Chess(position.fen))) *
      (position.turn === "w" ? 1 : -1),
    winner: board.isCheckmate() ? (board.turn() === "w" ? "b" : "w") : null,
  };
}
function illustrate(line: ExplanationLine, idea: TacticalIdea) {
  const step = line.steps[idea.step];
  step.motif = idea.title;
  step.text = idea.text[0].toLocaleUpperCase("fr") + idea.text.slice(1);
  step.marks = idea.marks;
  if (idea.step !== 0)
    line.steps[0].text = `À repérer : ${idea.title.toLocaleLowerCase("fr")}. Avancez pour voir les pièces concernées, puis la conséquence dans la suite.`;
}
function tacticalExplanation(
  position: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  annotation: Annotation | null,
  played: ExplanationLine,
  alternative: ExplanationLine | null,
): { summary: string; primary?: "alternative" } | null {
  if (
    !annotation ||
    !before?.score ||
    !after?.score ||
    before.score.bound ||
    after.score.bound
  )
    return null;
  const prior = advantage(before.score, position.turn),
    next = advantage(after.score, position.turn);
  if (prior === null || next === null) return null;
  const bad = ["inaccuracy", "mistake", "blunder", "miss"].includes(
    annotation.category,
  );
  const result = outcome(played, position);
  const better = alternative ? outcome(alternative, position) : null;
  const enemy = position.turn === "w" ? "b" : "w";
  const lost =
    !!result &&
    (result.winner === enemy || (!result.winner && result.delta < 0));
  const safer =
    !!better &&
    better.winner !== enemy &&
    (result?.winner === enemy || better.delta > (result?.delta ?? 0));
  const opportunity =
    !!better &&
    !!result &&
    (better.winner === position.turn ||
      (better.delta > 0 && better.delta > result.delta)) &&
    result.winner !== position.turn;
  let idea: TacticalIdea | undefined;
  let line = played;
  let primary: "alternative" | undefined;
  if (
    bad &&
    opportunity &&
    alternative &&
    (annotation.category === "miss" || !lost)
  ) {
    idea = tacticalIdeas(alternative, position.turn, 1)[0];
    if (idea) {
      line = alternative;
      primary = "alternative";
    }
  }
  if (!idea && bad && lost && safer) idea = tacticalIdeas(played, enemy, 2)[0];
  if (!idea && bad && opportunity && alternative) {
    idea = tacticalIdeas(alternative, position.turn, 1)[0];
    if (idea) {
      line = alternative;
      primary = "alternative";
    }
  }
  if (!bad && prior - next < 0.05) {
    if (
      result &&
      (result.winner === position.turn || (!result.winner && result.delta > 0))
    )
      idea = tacticalIdeas(played, position.turn, 1)[0];
    idea ??= defensiveIdea(played) ?? undefined;
  }
  if (!idea) return null;
  illustrate(line, idea);
  const text = idea.text[0].toLocaleUpperCase("fr") + idea.text.slice(1);
  return {
    summary: primary
      ? `Occasion manquée dans la meilleure suite trouvée : ${text}`
      : text,
    primary,
  };
}
function baseExplanation(
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

export function explainMove(
  position: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  annotation: Annotation | null,
): MoveExplanation {
  const base = baseExplanation(position, before, after, annotation);
  if (!base.played) return base;
  const tactic = tacticalExplanation(
    position,
    before,
    after,
    annotation,
    base.played,
    base.alternative,
  );
  if (!tactic) return base;
  return {
    ...base,
    ...tactic,
    concrete: true,
    summary:
      tactic.summary +
      (base.concrete && !tactic.primary ? ` ${base.summary}` : ""),
  };
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
