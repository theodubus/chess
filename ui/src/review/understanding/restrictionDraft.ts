import { boardFromCommand } from "../StudyTree";
import type { Understanding } from "./prototype";
import { captureIllustration } from "./illustration";
import { assertDraftQuestions, campName, capitalize, describePiece, draftExchange, explanationSteps, moveLabel, points, type PedagogicalDraft } from "./draftModel";
import { closedRetreats, restrictionCapture, type RestrictionEffectReport } from "./RestrictionEffectVerification";
import { uci } from "./context";

/** Raconter le déplacement du bloqueur, la menace puis la prise liée à cette
 * pièce. La fermeture d'une sortie ne suffit jamais à déclarer une perte forcée. */
export function restrictionDraft(understanding: Understanding, report: RestrictionEffectReport): PedagogicalDraft | null {
  if (report.status !== "supported") return null;
  const { context } = understanding, h = report.hypothesis;
  if (!understanding.hypotheses.some((candidate) => JSON.stringify(candidate) === JSON.stringify(h)))
    throw new Error("Restriction d'une autre décision.");
  const routes = closedRetreats(understanding, h);
  if (!routes.length || JSON.stringify(routes) !== JSON.stringify(report.routes)) throw new Error("Sortie fermée non confirmée.");
  assertDraftQuestions(context, null, report.passes);
  const defence = context.frames[h.threatPly + 1], threat = uci(context.moves[h.threatPly]);
  for (const pass of report.passes) {
    const query = pass.questions.find((q) => q.purpose === "defence");
    if (!pass.threatMatches || !pass.capture || pass.capture.victimId !== h.victimId ||
      pass.evidence?.outcome !== "loss-in-line" || pass.evidence.materialDelta >= 0 ||
      !query || query.position.command !== defence.command || query.position.fen !== defence.fen ||
      pass.evidence.moves[0] !== threat || !h.attack?.some((a) => a.attackerId === pass.capture!.threatAttackerId) ||
      JSON.stringify(restrictionCapture(understanding, h, pass.evidence)) !== JSON.stringify(pass.capture))
      throw new Error("Témoin de restriction incomplet ou périmé.");
  }
  const pass = report.passes.at(-1)!, evidence = pass.evidence!;
  if (report.passes[0].evidence!.materialDelta !== evidence.materialDelta)
    throw new Error("Conséquences divergentes.");
  const victim = context.after.pieces.find((p) => p.id === h.victimId)!,
    attacker = defence.pieces.find((p) => p.id === pass.capture!.threatAttackerId)!,
    route = routes.find((r) => r.to === r.blocker) ?? routes[0],
    blocker = context.after.pieces.find((p) => p.id === route.blockerId)!,
    decision = context.moves[context.decision], label = moveLabel(context.before, uci(decision)),
    plan = captureIllustration(context, victim.id, evidence),
    played = explanationSteps(context.after, plan.moves, `Après ${label}`);
  const change = `${capitalize(describePiece(blocker))} ferme la sortie ${route.from}–${route.to} ${describePiece(victim).replace(/^le /, "du ").replace(/^la /, "de la ")}.`;
  // Les noms de pièces évitent une phrase générique et toute ambiguïté quand
  // plusieurs pièces sont attaquées dans la même position.
  const attackText = `Après ${played[1].label}, ${describePiece(attacker)} attaque ${describePiece(victim)}.`;
  const captureStep = played[pass.capture!.ply + 1];
  if (!captureStep) throw new Error("Prise de la victime absente du repère court.");
  const response = pass.capture!.handledThreat
    ? `${played[2].label} prend l'attaquant, mais ${captureStep.label} reprend cette pièce.`
    : pass.capture!.escape
      ? `${played[pass.capture!.ply].label} tente de dégager ${describePiece(victim).replace(/ en [a-h][1-8]$/, "")}, mais ${captureStep.label} prend cette pièce.`
      : `${captureStep.label} prend cette pièce.`;
  const consequence = `Dans la suite trouvée, ${response} Après les reprises, le bilan depuis ${label} est de ${points(evidence.materialDelta)} pour les ${campName(victim.color)}.`;
  played[0].note = change;
  played[0].marks = [{ from: route.from, to: route.blocker, tone: "observation" }, { from: route.blocker, tone: "observation" }];
  played[1].note = attackText;
  played[1].marks = [{ from: attacker.square, to: victim.square, tone: "threat" }, { from: route.blocker, tone: "observation" }];
  if (pass.capture!.escape) {
    const step = played[pass.capture!.ply], beforeCapture = boardFromCommand(step.command),
      move = beforeCapture.move(pass.capture!.move);
    step.note = `${step.label} tente de dégager la pièce, mais sa nouvelle case reste exposée à une prise depuis ${move.from}.`;
  } else if (pass.capture!.handledThreat) {
    played[2].note = `${played[2].label} prend l'attaquant. Il faut encore tenir compte de la reprise adverse.`;
  }
  captureStep.note = `${captureStep.label} prend la pièce attaquée.`;
  for (const reply of evidence.replies.filter((r) => r.state === "not-chosen" && r.choice)) {
    const step = played[reply.choice!.ply + 1];
    if (step) step.note = `Le moteur choisit ${step.label}, alors qu'une reprise reste légale. Le bilan concerne cette variante.`;
  }
  const finalChoice = evidence.replies.find((r) => r.state === "not-chosen" && r.choice?.ply === played.length - 2);
  if (finalChoice && played.length > 2) {
    const tail = played.at(-1)!, previous = played.at(-2)!, board = boardFromCommand(previous.command);
    const answeringCheck = board.isCheck(), move = board.move(plan.moves.at(-1)!);
    if (!answeringCheck && !move.captured && !move.promotion && !/[+#]/.test(move.san)) {
      played.pop();
      previous.note += `${previous.note ? " " : ""}Le moteur choisit ensuite ${tail.label}, alors qu'une reprise reste légale. Le bilan concerne cette variante.`;
    }
  }
  const exchange = draftExchange(context, evidence.moves);
  return { status: "draft", family: "closed-retreat", role: "allows-loss", title: "Une retraite fermée avant l'attaque",
    summary: `${change} ${attackText} ${consequence}`, comparisonText: "", story: { decision: uci(decision), change, consequence, alternative: "" },
    played, alternative: [], evidence: { playedMoves: [...evidence.moves], alternativeMoves: [], materialDelta: evidence.materialDelta,
      ...exchange, origin: "engine-lines", scope: "observed-consequence" },
    limitation: "La sortie fermée est un fait du plateau. La prise et le bilan apparaissent dans deux recherches après la menace ; cela ne prouve pas que toutes les défenses perdent ni que cette sortie était la seule bonne défense." +
      (plan.omittedMoves.length ? ` Le repère montre ${points(plan.materialDelta)} ; le témoin complet atteint ${points(plan.proofMaterialDelta)} pour les ${campName(victim.color)}.` : "") };
}
