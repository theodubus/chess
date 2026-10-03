import type { PieceSymbol } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import { frenchSan } from "../model";
import type { TacticalMark } from "../tactics";
import {
  decisionContext,
  uci,
  type PositionFrame,
  type TrackedPiece,
} from "./context";
import type { Understanding } from "./prototype";
import { framePosition, type DefenceEvidence } from "./evidence";
import { captureIllustration, type CaptureIllustration } from "./illustration";
import type { RelationReport } from "./RelationVerification";
import type { DefenceChange, OpenedLine } from "./relations";

export type DraftStep = {
  command: string;
  fen: string;
  label: string;
  marks: TacticalMark[];
};
export type RelationDraft = {
  status: "draft";
  scope: "conditional-mechanism";
  title: string;
  summary: string;
  comparisonText: string;
  played: DraftStep[];
  alternative: DraftStep[];
  illustration: {
    played: CaptureIllustration;
    alternative: CaptureIllustration | null;
  };
  limitation: string;
};
const names: Record<PieceSymbol, string> = {
  p: "le pion",
  n: "le cavalier",
  b: "le fou",
  r: "la tour",
  q: "la dame",
  k: "le roi",
};
const describe = (piece: TrackedPiece) => {
  const feminine = "qr".includes(piece.type);
  const color =
    piece.color === "w"
      ? feminine
        ? "blanche"
        : "blanc"
      : feminine
        ? "noire"
        : "noir";
  return `${names[piece.type]} ${color} en ${piece.square}`;
};
function steps(
  frame: Pick<PositionFrame, "fen" | "command">,
  moves: string[],
  label: string,
  marks: TacticalMark[],
): DraftStep[] {
  const board = boardFromCommand(frame.command);
  let command = frame.command;
  const result: DraftStep[] = [{ command, fen: board.fen(), label, marks }];
  for (const input of moves) {
    const move = board.move(input);
    command += (command.includes(" moves ") ? " " : " moves ") + uci(move);
    result.push({
      command,
      fen: board.fen(),
      label: frenchSan(move.san),
      marks: [{ from: move.from, to: move.to, tone: "threat" }],
    });
  }
  return result;
}
/** Brouillon pour validation pédagogique. Texte et images utilisent le même
 * témoin minimal ; le premier écran est déjà après le coup, sans le rejouer. */
export function relationDraft(
  understanding: Understanding,
  report: RelationReport,
): RelationDraft | null {
  if (
    report.status !== "supported" ||
    report.attribution.status !== "supported"
  )
    return null;
  const pass = report.passes.at(-1)!,
    h = report.hypothesis,
    context = understanding.context;
  if (!pass.alternative || !pass.contrast.evidence) return null;
  const playedMove = context.moves[context.decision],
    before = boardFromCommand(context.before.command);
  const alternativeMove = before.move(pass.alternative),
    alternativeQuestion = pass.questions.find(
      (q) => q.purpose === "alternative",
    )!;
  const victim = context.before.pieces.find((p) => p.id === h.victimId)!,
    attacker = context.before.pieces.find((p) => p.id === h.attackerId)!;
  const actualBoard = boardFromCommand(context.after.command);
  for (const move of pass.prefix.slice(0, -1)) actualBoard.move(move);
  const capture = frenchSan(actualBoard.move(h.capture).san),
    altLabel = frenchSan(alternativeMove.san);
  const playedPlan = captureIllustration(context, h.victimId, pass.evidence);
  const alternativeFrame = decisionContext({
    ...framePosition(context.before),
    played: pass.alternative,
  }).after;
  const alternativePlan =
    h.kind === "opened-line"
      ? null
      : captureIllustration(
          { before: context.before, after: alternativeFrame },
          h.victimId,
          pass.contrast.evidence,
        );
  const played = steps(
    context.after,
    playedPlan.moves,
    `Après ${frenchSan(playedMove.san)}`,
    [{ from: attacker.square, to: victim.square, tone: "threat" }],
  );
  const alternative = steps(
    alternativeQuestion.position,
    alternativePlan?.moves ?? [],
    `Avec ${altLabel}`,
    [{ from: victim.square, tone: "idea" }],
  );
  let title: string, summary: string, comparisonText: string;
  if (h.kind === "defender-removal") {
    const id = pass.contrast.usedDefender!,
      defender = context.before.pieces.find((p) => p.id === id)!;
    const query = pass.questions.find((q) => q.purpose === "recapture")!;
    const reply = frenchSan(
      boardFromCommand(query.position.command).move(query.result.bestMove!).san,
    );
    title =
      h.role === "allows-loss"
        ? "Une défense abandonnée"
        : "Une reprise supprimée";
    const remaining = context.after.pieces.find((p) => p.id === id);
    const reason = (h.fact as DefenceChange).removed.find(
      (d) => d.defenderId === id,
    )!.reason;
    const description = describe(defender)
      .replace(/^le /, "Le ")
      .replace(/^la /, "La ");
    const changed =
      reason === "captured"
        ? `${description} a été capturé${"qr".includes(defender.type) ? "e" : ""}.`
        : reason === "moved"
          ? `${description} a quitté cette case pour ${remaining!.square}.`
          : `${description} ne peut plus reprendre légalement.`;
    summary = `${changed} Après ${capture}, la reprise par ce défenseur n'est plus disponible et la perte matérielle des ${victim.color === "w" ? "Blancs" : "Noirs"} augmente dans la variante vérifiée.`;
    comparisonText = `Avec ${altLabel}, la reprise ${reply} restait possible : le moteur l'utilise et le bilan matériel est moins défavorable.`;
    played[0].marks.push({ from: defender.square, tone: "observation" });
  } else {
    const line = h.fact as OpenedLine;
    title =
      h.role === "allows-loss"
        ? "Une ligne laissée ouverte"
        : "Une attaque découverte";
    summary = `Ce coup dégage la ligne ${line.from}–${line.to}${h.role === "allows-loss" ? " pour l'adversaire" : " pour son camp"}. Le moteur l'exploite par ${capture}, qui prend ${describe(victim)}.`;
    comparisonText = `Avec ${altLabel}, un obstacle restait sur cette ligne et la capture directe n'était pas disponible. La variante calculée conserve la pièce.`;
    // La preuve conserve la réponse moteur ; l'illustration du blocage n'a pas
    // besoin de rejouer ces coups, qui ne décrivent pas le mécanisme principal.
    const setup = decisionContext({
      ...framePosition(context.before),
      played: pass.alternative,
    });
    for (const id of pass.contrast.retained) {
      const blocker = setup.after.pieces.find((p) => p.id === id)!;
      alternative[0].marks.push(
        { from: blocker.square, tone: "idea" },
        { from: line.from, to: blocker.square, tone: "idea" },
      );
    }
    played[0].marks.push(
      ...line.vacated.map((v) => ({
        from: v.square,
        tone: "observation" as const,
      })),
    );
  }
  return {
    status: "draft",
    scope: "conditional-mechanism",
    title,
    summary,
    comparisonText,
    played,
    alternative,
    illustration: { played: playedPlan, alternative: alternativePlan },
    limitation: [
      "Cette comparaison soutient une contribution au verdict dans des variantes bornées ; elle ne prouve pas une perte contre toutes les défenses.",
      planNote(playedPlan, victim, "played"),
      alternativePlan ? planNote(alternativePlan, victim, "alternative") : "",
      replyNote(pass.evidence),
      replyNote(pass.contrast.evidence),
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function planNote(
  plan: CaptureIllustration,
  victim: TrackedPiece,
  branch: "played" | "alternative",
): string {
  if (!plan.omittedMoves.length) return "";
  const value = (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
  return `Pour le ${branch === "alternative" ? "repère de l'alternative" : "repère du coup joué"}, le bilan illustré est de ${value(plan.materialDelta)} points pour les ${victim.color === "w" ? "Blancs" : "Noirs"}. Le témoin complet conserve ${plan.omittedMoves.length} ${plan.omittedMoves.length === 1 ? "demi-coup supplémentaire" : "demi-coups supplémentaires"} et atteint ${value(plan.proofMaterialDelta)} points.`;
}
function replyNote(evidence: DefenceEvidence): string {
  return evidence.replies
    .filter((r) => r.state === "not-chosen" && r.choice)
    .map((r) => {
      const board = boardFromCommand(r.choice!.command);
      const chosen = frenchSan(board.move(r.choice!.move).san);
      const replies = r.choice!.available.map((move) =>
        frenchSan(boardFromCommand(r.choice!.command).move(move).san),
      );
      const options =
        replies.length === 1
          ? `la reprise ${replies[0]} reste légale`
          : `les reprises ${replies.join(" et ")} restent légales`;
      return `Dans cette variante, le moteur choisit ${chosen} alors que ${options}. Ce choix ne prouve pas que la reprise est mauvaise.`;
    })
    .join(" ");
}
