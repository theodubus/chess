import { Chess, type Color, type Move } from "chess.js";
import { materialBalance } from "../material";
import { advantage, type Annotation } from "./annotations";
import { boardFromCommand } from "./StudyTree";
import { defensiveIdea, tacticalIdeas, type TacticalIdea } from "./tactics";
import { frenchSan, type ReviewPosition, type ReviewResult } from "./model";
import type {
  ExplanationLine,
  ExplanationStep,
  MoveExplanation,
} from "./explanations";

/** Une hypothèse locale : ses positions de contrôle portent sur sa conséquence,
 * et sur l'autre décision, jamais sur la fin arbitraire de la PV. */
export type CauseCandidate = {
  positions: ReviewPosition[];
  line: ExplanationLine;
  comparison?: ExplanationLine;
  summary: string;
  primary?: "alternative";
  actor: Color;
  mode: "loss" | "miss" | "gain";
  reference: ReviewResult;
};
const horizon = 6;
const badCategories = ["inaccuracy", "mistake", "blunder", "miss"];
const enemy = (side: Color): Color => (side === "w" ? "b" : "w");
const uci = (move: Move) => move.from + move.to + (move.promotion ?? "");
const names = {
  p: "pion",
  n: "cavalier",
  b: "fou",
  r: "tour",
  q: "dame",
  k: "roi",
};
const exact = (result: ReviewResult | null, side: Color) =>
  !!result?.score &&
  !result.score.bound &&
  Number.isFinite(result.score.value) &&
  advantage(result.score, side) !== null;
function position(step: ExplanationStep): ReviewPosition {
  const board = boardFromCommand(step.command);
  return {
    fen: step.fen,
    command: step.command,
    turn: board.turn(),
    label: step.label,
    played: null,
    playedSan: null,
    terminal: board.isCheckmate()
      ? { kind: "mate", value: 0, winner: enemy(board.turn()) }
      : board.isDraw()
        ? { kind: "cp", value: 0 }
        : null,
  };
}
function append(step: ExplanationStep, move: Move): ExplanationStep {
  return {
    fen: move.after,
    command:
      step.command +
      (step.command.includes(" moves ") ? " " : " moves ") +
      uci(move),
    label: `${move.before.split(" ")[5]}${move.color === "w" ? "." : "…"} ${frenchSan(move.san)}`,
    text: `${move.color === "w" ? "Les Blancs" : "Les Noirs"} ${move.captured ? `capturent ${["q", "r"].includes(move.captured) ? "la" : "le"} ${names[move.captured]} en ${move.to}` : `jouent ${frenchSan(move.san)}`}.`,
    move,
  };
}
/** Achever seulement les reprises de cet échange, sans avancer vers une autre prise. */
function localEnd(
  line: ExplanationLine,
  idea: TacticalIdea,
  actor: Color,
): number | null {
  const steps = line.steps;
  let end = idea.consequence;
  if (end > horizon || !steps[end]) return null;
  while (end < horizon) {
    const current = steps[end],
      board = new Chess(current.fen);
    if (board.isCheckmate()) return board.turn() !== actor ? end : null;
    const taken = current.move;
    if (!taken?.captured && !taken?.promotion) break;
    const replies = board
      .moves({ verbose: true })
      .filter((reply) => reply.captured && reply.to === taken.to);
    if (!replies.length) break;
    const next = steps[end + 1]?.move;
    if (!next || !replies.some((reply) => uci(reply) === uci(next)))
      return null;
    end++;
  }
  const last = steps[end],
    board = new Chess(last.fen);
  if (
    (last.move?.captured || last.move?.promotion) &&
    board
      .moves({ verbose: true })
      .some((reply) => reply.captured && reply.to === last.move!.to)
  )
    return null;
  const gain =
    (materialBalance(board) - materialBalance(new Chess(steps[0].fen))) *
    (actor === "w" ? 1 : -1);
  return gain > 0 ? end : null;
}
function fragment(
  line: ExplanationLine,
  idea: TacticalIdea,
  end: number,
): ExplanationLine {
  // La décision reste l’ancre. Le début avant le coup n’est utile que si le motif
  // porte sur une défense qui vient de disparaître ; aucun replay sinon.
  const start = idea.step === 0 ? 0 : 1;
  const steps = line.steps.slice(start, end + 1).map((step) => ({ ...step }));
  const marked = steps[idea.step - start];
  if (marked) {
    marked.motif = idea.title;
    marked.text = idea.text[0].toLocaleUpperCase("fr") + idea.text.slice(1);
    marked.marks = idea.marks;
  }
  return { kind: "cause", title: idea.title, steps, truncated: false };
}
function alternativesSnapshot(
  line: ExplanationLine | null,
  missed = false,
): ExplanationLine | undefined {
  const step = line?.steps[1];
  if (!step) return;
  return {
    kind: "cause",
    title: "L’autre décision",
    truncated: false,
    steps: [
      {
        ...step,
        text: missed
          ? `Le coup joué ${frenchSan(step.move!.san)} ne réalise pas le gain montré. Voici la position obtenue avec cette décision.`
          : `Après ${frenchSan(step.move!.san)}, le moteur conserve une meilleure évaluation. Voici la position obtenue avec cette autre décision.`,
      },
    ],
  };
}
/** Expliquer concrètement ce que change l’alternative lorsque la même prise
 * immédiate peut être comparée légalement dans les deux positions. */
function compareCapture(
  comparison: ExplanationLine,
  played: ExplanationLine,
  proof: ExplanationLine,
) {
  const threat = proof.steps.find(
    (step) => step.move?.before === played.steps[1].fen && step.move.captured,
  )?.move;
  const other = comparison.steps[0],
    decision = other.move!;
  if (!threat) return;
  const board = boardFromCommand(other.command);
  if (decision.captured && decision.to === threat.from) {
    other.text = `${frenchSan(decision.san)} élimine ${["q", "r"].includes(decision.captured) ? "la" : "le"} ${names[decision.captured]} en ${threat.from}, qui pouvait capturer ${["q", "r"].includes(threat.captured!) ? "la" : "le"} ${names[threat.captured!]} en ${threat.to} après le coup joué.`;
  } else if (
    !board.moves({ verbose: true }).some((move) => uci(move) === uci(threat))
  ) {
    other.text = `Après ${frenchSan(decision.san)}, la prise ${frenchSan(threat.san)} montrée après le coup joué n’est plus légale. Le moteur préfère cette décision.`;
  } else return;
  other.marks = [{ from: decision.to, tone: "idea" }];
}
function localIdeas(line: ExplanationLine, actor: Color, first: number) {
  const ideas = tacticalIdeas(line, actor, first);
  // Un échange défavorable n’est pas nécessairement une pièce sans défense.
  // Le bilan doit inclure les reprises sur cette case pour être explicable.
  const capture = line.steps[first]?.move;
  if (capture?.promotion) {
    const gain =
      { q: 9, r: 5, b: 3, n: 3 }[capture.promotion as "q" | "r" | "b" | "n"] -
      1;
    ideas.unshift({
      kind: "promotion",
      title: "Promotion",
      step: first,
      consequence: first,
      text: `Ce coup transforme le pion en ${names[capture.promotion]} : ${gain} points de matériel supplémentaires${capture.captured ? ", en plus de la capture" : ""}.`,
      marks: [{ from: capture.to, tone: "idea" }],
    });
  }
  if (capture?.captured && !ideas.some((idea) => idea.consequence === first))
    ideas.push({
      kind: "hanging",
      title: "Échange défavorable",
      step: Math.max(1, first - 1),
      consequence: first,
      text: `La prise ${frenchSan(capture.san)} commence un échange sur ${capture.to}. Les reprises de cette séquence laissent un gain matériel aux ${actor === "w" ? "Blancs" : "Noirs"}.`,
      marks: [{ from: capture.from, to: capture.to, tone: "threat" }],
    });
  return ideas
    .map((idea) => ({ idea, end: localEnd(line, idea, actor) }))
    .filter(
      (item): item is { idea: TacticalIdea; end: number } => item.end !== null,
    );
}
function shortCause(
  line: ExplanationLine,
  actor: Color,
  first: number,
): { line: ExplanationLine; end: ExplanationStep; text: string } | null {
  const found = localIdeas(line, actor, first)[0];
  if (!found) return null;
  return {
    line: fragment(line, found.idea, found.end),
    end: line.steps[found.end],
    text: found.idea.text[0].toLocaleUpperCase("fr") + found.idea.text.slice(1),
  };
}
/** Une prise immédiate peut expliquer la faute même si la PV choisit un autre gain.
 * Elle reste une hypothèse jusqu’à la recherche de la position après la prise. */
function captureCandidates(line: ExplanationLine): ExplanationLine[] {
  const first = line.steps[1];
  if (!first) return [];
  const board = boardFromCommand(first.command);
  return board
    .moves({ verbose: true })
    .filter((move) => move.captured)
    .sort(
      (a, b) =>
        ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 })[b.captured!] -
        { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[a.captured!],
    )
    .slice(0, 4)
    .map((move) => ({
      ...line,
      steps: [line.steps[0], first, append(first, move)],
      truncated: false,
    }));
}
export function decisionCause(
  source: ReviewPosition,
  before: ReviewResult | null,
  after: ReviewResult | null,
  annotation: Annotation | null,
  base: MoveExplanation,
): MoveExplanation {
  const played = base.played!;
  const first = played.steps[1].move!;
  const afterBoard = new Chess(first.after);
  if (afterBoard.isCheckmate())
    return {
      ...base,
      concrete: true,
      summary: "Ce coup donne échec et mat.",
      proof: {
        kind: "cause",
        title: "Échec et mat",
        truncated: false,
        steps: [{ ...played.steps[1], text: "Ce coup donne échec et mat." }],
      },
    };
  if (
    first.promotion &&
    annotation &&
    !badCategories.includes(annotation.category) &&
    !after
  ) {
    const gain =
      { q: 9, r: 5, b: 3, n: 3 }[first.promotion as "q" | "r" | "b" | "n"] - 1;
    return {
      ...base,
      concrete: true,
      summary: `Ce coup transforme le pion en ${names[first.promotion]} : ${gain} points de matériel supplémentaires${first.captured ? ", en plus de la capture" : ""}.`,
      proof: {
        kind: "cause",
        title: "Promotion",
        truncated: false,
        steps: [played.steps[1]],
      },
    };
  }
  if (!annotation || !exact(before, source.turn) || !exact(after, source.turn))
    return base;
  const bad = badCategories.includes(annotation.category);
  // Le moteur doit effectivement distinguer les décisions avant de justifier
  // une erreur par une hypothèse. Aucun lien n’est tiré du bilan final de la PV.
  if (
    bad &&
    advantage(before!.score!, source.turn)! <=
      advantage(after!.score!, source.turn)!
  )
    return base;
  const alternative = base.alternative;
  let cause = shortCause(
    played,
    bad ? enemy(source.turn) : source.turn,
    bad ? 2 : 1,
  );
  let mode: CauseCandidate["mode"] = bad ? "loss" : "gain";
  let primary: "alternative" | undefined;
  if (!cause && bad)
    for (const candidate of captureCandidates(played)) {
      cause = shortCause(candidate, enemy(source.turn), 2);
      if (cause) break;
    }
  if (!cause && bad && alternative) {
    cause = shortCause(alternative, source.turn, 1);
    mode = "miss";
    primary = "alternative";
  }
  if (!cause && !bad) {
    const defence = defensiveIdea(played);
    if (defence)
      return {
        ...base,
        concrete: true,
        summary:
          defence.text[0].toLocaleUpperCase("fr") + defence.text.slice(1),
        proof: fragment(played, defence, 1),
      };
  }
  if (!cause) return base;
  const comparison = bad
    ? alternativesSnapshot(
        mode === "loss" ? alternative : played,
        mode === "miss",
      )
    : undefined;
  if (bad && !comparison) return base;
  if (comparison && mode === "loss")
    compareCapture(comparison, played, cause.line);
  const other = comparison?.steps[0];
  const candidate: CauseCandidate = {
    positions: [position(cause.end), ...(other ? [position(other)] : [])],
    line: cause.line,
    comparison,
    summary: (primary ? "Occasion manquée : " : "") + cause.text,
    primary,
    actor: source.turn,
    mode,
    reference: after!,
  };
  // Une position déjà mate constitue une preuve locale ; sinon le résultat
  // après la conséquence doit encore être vérifié pour exclure une compensation.
  if (new Chess(cause.end.fen).isCheckmate())
    return {
      ...base,
      concrete: true,
      summary: candidate.summary,
      primary,
      proof: candidate.line,
      comparison,
    };
  return { ...base, candidate };
}
/** La confirmation reste attachée aux commandes exactes par le cache de recherche.
 * Les scores sont normalisés du point de vue blanc par l’adaptateur UCI. */
export function confirmCause(
  base: MoveExplanation,
  results: (ReviewResult | null)[],
): MoveExplanation {
  const candidate = base.candidate;
  if (
    !candidate ||
    results.length !== candidate.positions.length ||
    results.some((result) => !exact(result, candidate.actor))
  )
    return base;
  const value = (result: ReviewResult) =>
    advantage(result.score!, candidate.actor)!;
  const ending = results[0]!;
  const confirmed =
    candidate.mode === "gain"
      ? value(ending) >= value(candidate.reference) - 0.025
      : candidate.mode === "loss"
        ? value(results[1]!) - value(ending) >= 0.035
        : value(ending) - value(results[1]!) >= 0.035;
  // Une suite compensée peut encore avoir une mauvaise évaluation positionnelle.
  // Si le moteur rend immédiatement le matériel montré, la cause est rejetée.
  const final = new Chess(candidate.positions[0].fen);
  const balance = materialBalance(final);
  const firstReply = ending.variation[0];
  if (firstReply) {
    const reply = final
      .moves({ verbose: true })
      .find(
        (move) =>
          move.from === firstReply.from &&
          move.to === firstReply.to &&
          move.after === firstReply.fen,
      );
    if (!reply || reply.captured || reply.promotion) {
      if (!reply) return base;
      const sign =
        (candidate.mode === "loss"
          ? enemy(candidate.actor)
          : candidate.actor) === "w"
          ? 1
          : -1;
      const root = new Chess(
        candidate.line.steps[0].move?.before ?? candidate.line.steps[0].fen,
      );
      if (
        (materialBalance(new Chess(reply.after)) - materialBalance(root)) *
          sign <=
          0 &&
        (materialBalance(new Chess(reply.after)) - balance) * sign < 0
      )
        return base;
    }
  }
  if (!confirmed) return base;
  return {
    ...base,
    concrete: true,
    summary: candidate.summary,
    primary: candidate.primary,
    proof: candidate.line,
    comparison: candidate.comparison,
  };
}
