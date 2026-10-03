import type { Understanding } from "./prototype";
import type { TacticalReport } from "./TacticalVerification";
import { boardFromCommand } from "../StudyTree";
import { decisionContext, uci } from "./context";
import { framePosition } from "./evidence";
import { captureIllustration } from "./illustration";
import { assertDraftHypothesis, assertDraftQuestions, campName, capitalize, describePiece, draftExchange, explanationSteps, moveLabel, points, type PedagogicalDraft } from "./draftModel";

/** Ce brouillon raconte le contraste physique confirmé, pas une raison inventée
 * à partir du seul badge. Les images et le texte lisent le même témoin. */
export function tacticalDraft(understanding: Pick<Understanding, "context" | "constraints">, report: TacticalReport): PedagogicalDraft | null {
  if (report.status !== "supported" || report.attribution.status !== "supported") return null;
  const { context } = understanding, h = report.hypothesis, pass = report.passes.at(-1)!;
  assertDraftHypothesis(understanding.constraints, h);
  if (report.passes.length !== 2 || report.passes.some((p) =>
    p.questions.find((q) => q.purpose === "played")?.position.command !== context.after.command ||
    !p.actual.matched || p.actual.evidence.outcome !== "loss-in-line" || !p.contrast.evidence))
    throw new Error("Contraste tactique d'une autre décision.");
  const alternative = decisionContext({ ...framePosition(context.before), played: report.alternative });
  assertDraftQuestions(context, alternative.after, report.passes);
  if (report.passes.some((p) => p.questions.find((q) => q.purpose === "alternative")?.position.command !== alternative.after.command))
    throw new Error("Alternative tactique incohérente.");
  const victim = pass.actual.root.pieces.find((p) => p.id === pass.actual.capture!.targetId)!;
  const attacker = pass.actual.root.pieces.find((p) => p.id === h.attackerId)!;
  const plan = captureIllustration(context, victim.id, { ...pass.actual.evidence, outcome: "loss-in-line" });
  const altMoves = [...pass.contrast.prefix, ...(report.attribution.reason === "exchanged-defender"
    ? pass.contrast.followUp!.evidence.moves : pass.contrast.evidence!.moves)];
  const playedMove = context.moves[context.decision], playedLabel = moveLabel(context.before, uci(playedMove));
  const altLabel = moveLabel(context.before, report.alternative);
  const played = explanationSteps(context.after, plan.moves, `Après ${playedLabel}`);
  const altSteps = explanationSteps(alternative.after, altMoves, `Avec ${altLabel}`);
  const rootIndex = pass.actual.prefix.length;
  if (rootIndex && played[1]) {
    played[0].note = `Ce coup permet ${played[1].label}, qui crée la menace.`;
    played[0].marks = played[1].marks;
  }
  if (pass.contrast.prefix.length) {
    altSteps[1].origin = "conditional-move";
    altSteps[1].note = `Pour comparer, si la même menace ${altSteps[1].label} est tentée…`;
  }
  const root = played[rootIndex];
  let title: string, change: string, consequence: string, comparison: string;
  const exchange = draftExchange(context, pass.actual.evidence.moves);
  const subject = exchange.exchange?.role === "recapture" ? "Cette reprise" : "Ce coup";
  const captureStep = played[pass.actual.capture!.ply + 1];
  const material = `${points(pass.actual.evidence.materialDelta)} pour les ${campName(victim.color)}`;
  if (report.attribution.reason === "blocked-retreat" && "shield" in h.fact) {
    const pin = h.fact;
    title = "Clouer une pièce pour l'attaquer";
    change = `${capitalize(describePiece(pin.shield))} ne peut pas quitter le rayon ${pin.attacker.square}–${pin.rear.square} sans exposer son roi.`;
    consequence = `${captureStep.label} exploite cette contrainte. Après les reprises de la variante, le bilan est de ${material}.`;
    comparison = `Avec ${altLabel}, le clouage disparaît sans enlever cette pression. Le moteur choisit ${pass.contrast.usedRetreat && moveLabel(pass.contrast.frame, pass.contrast.usedRetreat)}, désormais légal, et préserve la pièce.`;
    root.marks = [{ from: pin.attacker.square, to: pin.rear.square, tone: "observation" }, { from: pin.shield.square, tone: "threat" }];
    root.note = change;
    captureStep.note = `La pièce clouée est prise par ${captureStep.label}.`;
  } else {
    const targets = h.targetIds.map((id) => pass.actual.root.pieces.find((p) => p.id === id)!);
    const king = targets.find((p) => p.type === "k");
    title = report.attribution.reason === "exchanged-defender" ? "Échanger une pièce qui défend ailleurs" : "Menacer deux cibles à la fois";
    change = `${capitalize(describePiece(attacker))} ${king ? `met ${describePiece(king)} en échec et attaque ${targets.filter((p) => p.type !== "k").map(describePiece).join(" et ")}`
      : `attaque ${targets.map(describePiece).join(" et ")}`}.`;
    root.marks = targets.map((p) => ({ from: attacker.square, to: p.square, tone: "threat" }));
    root.note = change;
    if (report.attribution.reason === "exchanged-defender") {
      const follow = pass.actual.followUp!, defender = pass.actual.root.pieces.find((p) => p.id === follow.defenderId)!;
      const target = pass.actual.root.pieces.find((p) => p.id === follow.targetId)!;
      const followStep = played[follow.ply + 1];
      consequence = `L'échange qui retire ${describePiece(defender)} vaut ${points(pass.actual.exchange!.balance!)} pour les ${campName(victim.color)}. Mais cette pièce défendait ${target.square} : une fois échangée, ${followStep.label} prend ${describePiece(target)} sans cette reprise. La suite vaut ${material}.`;
      root.marks.push({ from: defender.square, to: target.square, tone: "idea" });
      followStep.note = `${capitalize(describePiece(defender))} a disparu : sa reprise sur ${target.square} n'est plus disponible.`;
      const query = pass.questions.find((q) => q.purpose === "restored-defender")!;
      const recapture = moveLabel(query.position, query.result.bestMove!);
      comparison = `Avec ${altLabel}, ce défenseur reste en place. Si la même prise ${followStep.label} est tentée après la réponse à la menace, le moteur reprend par ${recapture} ; le bilan matériel est moins défavorable.`;
      const forcedCapture = pass.contrast.followUp!.prefix.length;
      altSteps[forcedCapture].origin = "conditional-move";
      altSteps[forcedCapture].note = `Si la même prise ${altSteps[forcedCapture].label} est tentée, le défenseur peut encore reprendre.`;
    } else {
      const response = played[rootIndex + 1].label;
      consequence = `La réponse ${response} règle une cible, puis ${captureStep.label} prend l'autre. Le bilan de cette suite est de ${material}.`;
      comparison = `Avec ${altLabel}, les deux cibles ne sont plus menacées ensemble. La réponse ${altSteps.at(-1)!.label} les préserve dans la variante calculée.`;
      captureStep.note = `${captureStep.label} prend la cible restée attaquée.`;
    }
  }
  const resolved = played[pass.actual.exchange!.to + 1];
  if (resolved && !resolved.note) resolved.note = `Cet échange vaut ${points(pass.actual.exchange!.balance!)} pour les ${campName(victim.color)}.`;
  for (const reply of pass.actual.evidence.replies.filter((r) => r.state === "not-chosen" && r.choice)) {
    const step = played[reply.choice!.ply + 1];
    if (step) step.note = `Le moteur choisit ${step.label}, alors qu'une reprise reste légale. Le bilan est celui de cette variante.`;
  }
  // Le choix calme qui atteste la fin de la série de reprises reste dans
  // la preuve, mais sa position ne raconte pas la cause. L'indiquer sur
  // le dernier échange suffit ; ne jamais retirer capture, échec ou promotion.
  const finalChoice = pass.actual.evidence.replies.find((r) => r.state === "not-chosen" && r.choice?.ply === played.length - 2);
  if (finalChoice && played.length > 1) {
    const tail = played.at(-1)!, previous = played.at(-2)!;
    const move = boardFromCommand(previous.command).move(plan.moves.at(-1)!);
    if (!move.captured && !move.promotion && !/[+#]/.test(move.san)) {
      played.pop();
      previous.note += `${previous.note ? " " : ""}Le moteur choisit ensuite ${tail.label}, alors qu'une reprise reste légale. Le bilan est celui de cette variante.`;
    }
  }
  altSteps[0].note = `L'alternative ${altLabel} sert à comparer cette contrainte ; ce n'est pas forcément le meilleur coup.`;
  // Les repères du départ alternatif concernent ses pièces présentes, pas les
  // anciennes cases d'une cible que l'alternative a déplacée.
  altSteps[0].marks = [{ from: alternative.moves[alternative.decision].to, tone: "idea" }];
  altSteps.at(-1)!.note = comparison;
  return { status: "draft", family: report.attribution.reason as PedagogicalDraft["family"], role: h.role, title,
    summary: `${h.role === "allows-loss" ? `${subject} permet cette menace. ` : ""}${change} ${consequence}`,
    comparisonText: comparison, story: { decision: uci(playedMove), change, consequence, alternative: comparison }, played, alternative: altSteps,
    evidence: { playedMoves: [...pass.actual.evidence.moves], alternativeMoves: altMoves, materialDelta: pass.actual.evidence.materialDelta,
      ...exchange, origin: "engine-lines", scope: "conditional-contribution" },
    limitation: `Cette comparaison soutient une contribution dans les variantes calculées ; elle ne prouve ni une perte contre toutes les défenses ni le meilleur coup. ` +
      (plan.omittedMoves.length ? `Le repère montre ${points(plan.materialDelta)} ; le témoin complet atteint ${points(plan.proofMaterialDelta)} pour les ${campName(victim.color)}.` : "") };
}
