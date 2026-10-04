import { materialBalance } from "../../material";
import type { ReviewPosition } from "../model";
import { boardFromCommand } from "../StudyTree";
import { decisionContext, uci } from "./context";
import { divertedDefenceConclusion, inspectDivertedDefence, type DivertedDefenceReport } from "./DivertedDefenceVerification";
import { assertDraftQuestions, campName, capitalize, describePiece, draftExchange, explanationSteps, moveLabel, points, type PedagogicalDraft } from "./draftModel";
import { captureIllustration } from "./illustration";
import { finishWork, type Work } from "./work";

/** Recalculer la chaîne depuis les réponses enregistrées avant toute phrase.
 * La reprise ne reçoit jamais son gain local comme bilan de l'échange entier. */
export function* divertedDefenceDraftWork(position: ReviewPosition, report: DivertedDefenceReport): Work<PedagogicalDraft | null> {
  if (report.status !== "supported") return null;
  const context = decisionContext(position);
  assertDraftQuestions(context, null, report.passes);
  const verified = [];
  for (const pass of report.passes) verified.push({ ...pass, ...yield* inspectDivertedDefence(context, pass.questions) });
  if (divertedDefenceConclusion(verified).status !== "supported" || report.scope !== "observed-consequence" ||
    verified.some((p, i) => JSON.stringify([p.hypothesis, p.evidence, p.sourceEvidence, p.mismatch]) !==
      JSON.stringify([report.passes[i].hypothesis, report.passes[i].evidence, report.passes[i].sourceEvidence, report.passes[i].mismatch])))
    throw new Error("Diversion ou bilan incomplet ou périmé.");
  const pass = verified.at(-1)!, h = pass.hypothesis!, evidence = pass.evidence!,
    exposed = context.after.pieces.find((p) => p.id === h.exposedId)!,
    defender = context.after.pieces.find((p) => p.id === h.defenderId)!,
    victim = context.after.pieces.find((p) => p.id === h.victimId)!,
    attacker = context.after.pieces.find((p) => p.id === h.firstAttackerId)!,
    second = context.after.pieces.find((p) => p.id === h.secondAttackerId)!,
    decision = uci(context.moves[context.decision]), label = moveLabel(context.before, decision),
    plan = captureIllustration(context, victim.id, evidence), played = explanationSteps(context.after, plan.moves, `Après ${label}`);
  if (played.length < 4) throw new Error("Seconde prise absente de l'illustration.");
  const sign = context.before.turn === "w" ? 1 : -1,
    firstDelta = (materialBalance(boardFromCommand(played[2].command)) - materialBalance(boardFromCommand(context.before.command))) * sign;
  const change = `${label} expose ${describePiece(exposed)} à ${played[1].label}.`;
  const diversion = `${played[2].label} poursuit cet échange et déplace ${describePiece(defender)} vers ${h.defenderTo}. ` +
    `Depuis ${h.defenderFrom}, cette pièce pouvait reprendre après ${played[3].label} ; depuis ${h.defenderTo}, elle ne le peut plus.`;
  const consequence = `Dans la suite trouvée, ${played[3].label} prend ${describePiece(victim)}. Le bilan depuis ${label}, reprises comprises, est de ${points(evidence.materialDelta)} pour les ${campName(context.before.turn)}.`;
  played[0].note = change;
  played[0].marks = [{ from: attacker.square, to: exposed.square, tone: "threat" }, { from: defender.square, to: victim.square, tone: "observation" }];
  played[1].note = `${played[1].label} prend la pièce exposée ; le moteur choisit ensuite ${played[2].label} pour reprendre.`;
  played[1].marks.push({ from: defender.square, to: victim.square, tone: "observation" });
  played[2].note = `${diversion} Avant la seconde prise, le bilan depuis ${label} est de ${points(firstDelta)} pour les ${campName(context.before.turn)}.`;
  played[2].marks = [{ from: defender.square, to: h.defenderTo as typeof defender.square, tone: "observation" },
    { from: victim.square, tone: "threat" }, { from: second.square, to: victim.square, tone: "threat" }];
  played[3].note = `${capitalize(describePiece(second))} prend la seconde pièce, sans reprise possible par ce défenseur.`;
  for (const reply of evidence.replies.filter((r) => r.state === "not-chosen" && r.choice)) {
    const step = played[reply.choice!.ply + 1];
    if (step) step.note += `${step.note ? " " : ""}Le moteur choisit ${step.label} alors qu'une reprise reste légale ; le bilan concerne cette suite.`;
  }
  return { status: "draft", family: "diverted-defender", role: "allows-loss", title: "Une reprise détourne un défenseur",
    summary: `${change} ${diversion} ${consequence}`, comparisonText: "", story: { decision, change: `${change} ${diversion}`, consequence, alternative: "" },
    played, alternative: [], evidence: { playedMoves: [...evidence.moves], alternativeMoves: [], materialDelta: evidence.materialDelta,
      ...draftExchange(context, evidence.moves), origin: "engine-and-rules", scope: "observed-consequence" },
    limitation: "Le déplacement du défenseur et la disparition de sa reprise sont vérifiés sur le plateau. La suite assemble les réponses libres du moteur après le coup, après la première prise et après la reprise, confirmées à deux budgets. Elle ne prouve pas que la reprise était forcée ni que toutes les défenses perdent." +
      (plan.omittedMoves.length ? ` Le repère montre ${points(plan.materialDelta)} ; le témoin complet atteint ${points(plan.proofMaterialDelta)} pour les ${campName(context.before.turn)}.` : "") };
}
export const divertedDefenceDraft = (position: ReviewPosition, report: DivertedDefenceReport) => finishWork(divertedDefenceDraftWork(position, report));
