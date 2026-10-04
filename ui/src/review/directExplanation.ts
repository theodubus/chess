import { boardFromCommand } from "./StudyTree";
import { stepText, type ExplanationLine, type MoveExplanation } from "./explanations";
import type { ReviewPosition } from "./model";
import type { TacticalMark } from "./tactics";
import type { PedagogicalDraft } from "./understanding/draftModel";
import type { RelationDraft } from "./understanding/relationDraft";

export type ConfirmedConsequence = {
  title: string;
  summary: string;
  context: string | null;
  limitation: string;
  steps: { command: string; fen: string; label: string; text: string; marks: TacticalMark[] }[];
};
const append = (command: string, move: string) => command + (command.includes(" moves ") ? " " : " moves ") + move;

/** La revue n'active pour l'instant que les conséquences adverses directes.
 * Rejouer toutes les étapes empêche un repère périmé ou raccourci illégal de
 * devenir une explication ; le premier écran est déjà après le coup examiné. */
export function confirmedConsequence(draft: PedagogicalDraft | RelationDraft, position: ReviewPosition): ConfirmedConsequence {
  const scope = "evidence" in draft ? draft.evidence.scope : draft.scope;
  const forcedMate = "family" in draft && draft.family === "forced-mate" && scope === "short-forcing-route";
  if (draft.role !== "allows-loss" || (scope !== "observed-consequence" && !forcedMate) || draft.alternative.length || !position.played)
    throw new Error("Conséquence adverse directe requise.");
  const board = boardFromCommand(position.command);
  if (board.fen() !== position.fen) throw new Error("Explication d'une autre position.");
  board.move(position.played);
  const root = append(position.command, position.played);
  if (draft.played.length < 2 || draft.played.length > 9 || draft.played[0].command !== root || draft.played[0].fen !== board.fen())
    throw new Error("Le repère doit commencer après le coup joué.");
  let command = root;
  const steps = draft.played.map((step, index) => {
    let text = draft.summary;
    if (index) {
      const suffix = step.command.slice(command.length + 1);
      if (!step.command.startsWith(command + " ") || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(suffix))
        throw new Error("Le repère ne suit pas l'historique du coup.");
      const move = board.move(suffix);
      text = stepText(board, move);
    }
    if (board.fen() !== step.fen) throw new Error("Position du repère incohérente.");
    command = step.command;
    const note = "note" in step ? step.note : "";
    if (note) text = note;
    if (index === draft.played.length - 1)
      text += ` ${"story" in draft ? draft.story.consequence : draft.summary}`;
    return { command, fen: step.fen, label: step.label, text, marks: structuredClone(step.marks) };
  });
  if (forcedMate && (!board.isCheckmate() || board.turn() !== position.turn))
    throw new Error("Le repère doit montrer le mat du camp qui a joué.");
  return {
    title: draft.title, summary: draft.summary, steps, limitation: draft.limitation,
    context: "evidence" in draft ? draft.evidence.contextText : null,
  };
}

/** Les variantes libres restent explorables, mais une ancienne heuristique ne
 * prend pas la place d'une conséquence que les nouvelles vérifications refusent. */
export function directExplanation(base: MoveExplanation, consequence: ConfirmedConsequence | null): MoveExplanation {
  const fallback: MoveExplanation = {
    summary: "Aucune conséquence courte suffisamment confirmée pour expliquer ce verdict. Vous pouvez examiner les variantes du moteur.",
    concrete: false, played: base.played, alternative: base.alternative, observations: base.observations,
  };
  if (!consequence) return fallback;
  const proof: ExplanationLine = {
    kind: "cause", title: consequence.title, truncated: false,
    steps: consequence.steps.map((step, index) => ({
      ...step, motif: index === 0 ? consequence.title : undefined,
      move: index === 0 ? null : boardFromCommand(consequence.steps[index - 1].command).move(step.command.split(" ").at(-1)!),
    })),
  };
  return { ...fallback, summary: consequence.summary, concrete: true, proof,
    context: consequence.context ?? undefined, limitation: consequence.limitation };
}
