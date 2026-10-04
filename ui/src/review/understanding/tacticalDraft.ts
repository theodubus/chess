import type { Understanding } from "./prototype";
import { tacticalEffectConclusion, type TacticalEffectReport, type TacticalReport } from "./TacticalVerification";
import { boardFromCommand } from "../StudyTree";
import { decisionContext, uci } from "./context";
import { framePosition } from "./evidence";
import { captureIllustration } from "./illustration";
import { observeTactic } from "./tacticalObservation";
import { sameCapturePressure } from "./tacticalContrast";
import { finishWork, type Work } from "./work";
import { assertDraftHypothesis, assertDraftQuestions, campName, capitalize, describePiece, draftExchange, explanationSteps, moveLabel, points, type PedagogicalDraft } from "./draftModel";

/** Ce brouillon raconte le contraste physique confirmé, pas une raison inventée
 * à partir du seul badge. Les images et le texte lisent le même témoin. */
export function tacticalDraft(understanding: Pick<Understanding, "context" | "constraints">, report: TacticalEffectReport | TacticalReport): PedagogicalDraft | null {
  return finishWork(tacticalDraftWork(understanding, report));
}
/** La revalidation cède entre les deux témoins afin qu'une navigation puisse
 * annuler la rédaction, pas seulement les recherches UCI qui la précèdent. */
export function* tacticalDraftWork(understanding: Pick<Understanding, "context" | "constraints">, report: TacticalEffectReport | TacticalReport): Work<PedagogicalDraft | null> {
  yield "context";
  if (report.status !== "supported") return null;
  const compared = "attribution" in report && report.attribution.status === "supported" ? report : null;
  const { context } = understanding, h = report.hypothesis, pass = report.passes.at(-1)!;
  assertDraftHypothesis(understanding.constraints, h);
  if (report.passes.length !== 2 || report.passes.some((p) =>
    p.questions.find((q) => q.purpose === "played")?.position.command !== context.after.command ||
    !p.actual.matched || p.actual.evidence.outcome !== "loss-in-line" || !p.actual.exchange?.complete))
    throw new Error("Conséquence tactique d'une autre décision.");
  const alternative = "alternative" in report
    ? decisionContext({ ...framePosition(context.before), played: report.alternative }) : null;
  assertDraftQuestions(context, alternative?.after ?? null, report.passes);
  // Un rapport sérialisé ne fait pas autorité sur son résultat physique.
  // Les PV légales doivent reconstruire le même motif, capture et bilan.
  for (const p of report.passes) {
    yield "tactics";
    const result = p.questions.find(q => q.purpose === "played")!.result;
    if (JSON.stringify(observeTactic(context, h, result)) !== JSON.stringify(p.actual))
      throw new Error("Conséquence tactique altérée.");
  }
  if (tacticalEffectConclusion(h, report.passes).status !== "supported")
    throw new Error("Conséquence tactique non confirmée.");
  const favourable = h.role === "creates-opportunity";
  if (favourable && (h.threatPly !== context.decision ||
      context.after.pieces.find(p => p.id === h.attackerId)?.color !== context.before.turn ||
      pass.actual.root.pieces.find(p => p.id === pass.actual.capture!.targetId)?.color === context.before.turn))
    throw new Error("Bénéficiaire tactique incohérent.");
  // Sans alternative, expliquer uniquement la contrainte effectivement créée.
  // Une pression changée en même temps ne permet pas d'isoler le clouage.
  if (favourable && !compared && h.kind === "pin") for (const p of report.passes) {
    yield "relations";
    if (p.actual.capture!.attackerId === h.attackerId || !sameCapturePressure(p.actual.root, context.before, p.actual.capture!)) return null;
  }
  yield "tactics";
  // Une perte observée doit encore être reliée au mécanisme : pas de récit de
  // fourchette si la capture vient d'une autre menace ou d'une suite éloignée.
  const direct = report.passes.every((p) => p.actual.exchange!.balance! < 0 && p.actual.handledTargets.length === 1 &&
    !p.actual.handledTargets.includes(p.actual.capture!.targetId));
  const compound = report.passes.every((p) => p.actual.exchange!.balance! >= 0 && p.actual.followUp) &&
    (["targetId", "attackerId", "defenderId", "capture"] as const).every((key) =>
      report.passes[0].actual.followUp![key] === report.passes[1].actual.followUp![key]);
  const family = h.kind === "pin" ? "blocked-retreat" : direct ? "double-targets" : compound ? "exchanged-defender" : null;
  if (!family) return null;
  const contrast = compared?.passes.at(-1)!.contrast;
  const victim = pass.actual.root.pieces.find((p) => p.id === pass.actual.capture!.targetId)!;
  const attacker = pass.actual.root.pieces.find((p) => p.id === h.attackerId)!;
  const plan = captureIllustration(context, victim.id, { ...pass.actual.evidence, outcome: "loss-in-line" });
  const altMoves = contrast ? [...contrast.prefix, ...(family === "exchanged-defender"
    ? contrast.followUp!.evidence.moves : contrast.evidence!.moves)] : [];
  const playedMove = context.moves[context.decision], playedLabel = moveLabel(context.before, uci(playedMove));
  const altLabel = compared ? moveLabel(context.before, compared.alternative) : "";
  const played = explanationSteps(context.after, plan.moves, `Après ${playedLabel}`);
  const altSteps = compared && alternative ? explanationSteps(alternative.after, altMoves, `Avec ${altLabel}`) : [];
  const rootIndex = pass.actual.prefix.length;
  if (rootIndex && played[1]) {
    played[0].note = `Ce coup permet ${played[1].label}, qui crée la menace.`;
    played[0].marks = played[1].marks;
  }
  if (contrast?.prefix.length) {
    altSteps[1].origin = "conditional-move";
    altSteps[1].note = `Pour comparer, si la même menace ${altSteps[1].label} est tentée…`;
  }
  const root = played[rootIndex];
  let title: string, change: string, consequence: string, comparison = "";
  const exchange = draftExchange(context, pass.actual.evidence.moves);
  const subject = exchange.exchange?.role === "recapture" ? "Cette reprise" : "Ce coup";
  const captureStep = played[pass.actual.capture!.ply + 1];
  const material = `${points(pass.actual.evidence.materialDelta * (favourable ? -1 : 1))} pour les ${campName(favourable ? context.before.turn : victim.color)}`;
  if (family === "blocked-retreat" && "shield" in h.fact) {
    const pin = h.fact;
    title = h.role === "allows-loss" ? "Une pièce clouée exposée à une prise" : "Clouer une pièce pour l'attaquer";
    change = `${capitalize(describePiece(pin.shield))} ne peut pas quitter le rayon ${pin.attacker.square}–${pin.rear.square} sans exposer son roi.`;
    consequence = `${captureStep.label} exploite cette contrainte. Après les reprises de la variante, le bilan est de ${material}.`;
    if (contrast) comparison = `Avec ${altLabel}, le clouage disparaît sans enlever cette pression. Le moteur choisit ${contrast.usedRetreat && moveLabel(contrast.frame, contrast.usedRetreat)}, désormais légal, et préserve la pièce.`;
    root.marks = [{ from: pin.attacker.square, to: pin.rear.square, tone: "observation" }, { from: pin.shield.square, tone: "threat" }];
    root.note = change;
    captureStep.note = `La pièce clouée est prise par ${captureStep.label}.`;
  } else {
    const targets = h.targetIds.map((id) => pass.actual.root.pieces.find((p) => p.id === id)!);
    const king = targets.find((p) => p.type === "k");
    title = family === "exchanged-defender"
      ? h.role === "allows-loss" ? "Un échange adverse retire une défense" : "Échanger une pièce qui défend ailleurs"
      : h.role === "allows-loss" ? "Une fourchette permise à l'adversaire" : "Menacer deux cibles à la fois";
    change = `${capitalize(describePiece(attacker))} ${king ? `met ${describePiece(king)} en échec et attaque ${targets.filter((p) => p.type !== "k").map(describePiece).join(" et ")}`
      : `attaque ${targets.map(describePiece).join(" et ")}`}.`;
    root.marks = targets.map((p) => ({ from: attacker.square, to: p.square, tone: "threat" }));
    root.note = change;
    if (family === "exchanged-defender") {
      const follow = pass.actual.followUp!, defender = pass.actual.root.pieces.find((p) => p.id === follow.defenderId)!;
      const target = pass.actual.root.pieces.find((p) => p.id === follow.targetId)!;
      const followStep = played[follow.ply + 1];
      consequence = `L'échange qui retire ${describePiece(defender)} vaut ${points(pass.actual.exchange!.balance!)} pour les ${campName(victim.color)}. Mais cette pièce défendait ${target.square} : une fois échangée, ${followStep.label} prend ${describePiece(target)} sans cette reprise. La suite vaut ${material}.`;
      root.marks.push({ from: defender.square, to: target.square, tone: "idea" });
      followStep.note = `${capitalize(describePiece(defender))} a disparu : sa reprise sur ${target.square} n'est plus disponible.`;
      if (contrast) {
        const query = pass.questions.find((q) => q.purpose === "restored-defender")!;
        const recapture = moveLabel(query.position, query.result.bestMove!);
        comparison = `Avec ${altLabel}, ce défenseur reste en place. Si la même prise ${followStep.label} est tentée après la réponse à la menace, le moteur reprend par ${recapture} ; le bilan matériel est moins défavorable.`;
        const forcedCapture = contrast.followUp!.prefix.length;
        altSteps[forcedCapture].origin = "conditional-move";
        altSteps[forcedCapture].note = `Si la même prise ${altSteps[forcedCapture].label} est tentée, le défenseur peut encore reprendre.`;
      }
    } else {
      const response = played[rootIndex + 1].label;
      consequence = `La réponse ${response} règle une cible, puis ${captureStep.label} prend l'autre. Le bilan de cette suite est de ${material}.`;
      if (contrast) comparison = `Avec ${altLabel}, les deux cibles ne sont plus menacées ensemble. La réponse ${altSteps.at(-1)!.label} les préserve dans la variante calculée.`;
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
  if (compared && alternative) {
    altSteps[0].note = `L'alternative ${altLabel} sert à comparer cette contrainte ; ce n'est pas forcément le meilleur coup.`;
    // Les repères du départ alternatif concernent ses pièces présentes, pas les
    // anciennes cases d'une cible que l'alternative a déplacée.
    altSteps[0].marks = [{ from: alternative.moves[alternative.decision].to, tone: "idea" }];
    altSteps.at(-1)!.note = comparison;
  }
  return { status: "draft", family, role: h.role, title,
    summary: `${h.role === "allows-loss" ? `${subject} permet cette menace. ` : ""}${change} ${consequence}`,
    comparisonText: comparison, story: { decision: uci(playedMove), change, consequence, alternative: comparison }, played, alternative: altSteps,
    evidence: { playedMoves: [...pass.actual.evidence.moves], alternativeMoves: altMoves, materialDelta: pass.actual.evidence.materialDelta,
      ...exchange, origin: "engine-lines", scope: compared ? "conditional-contribution" : "observed-consequence" },
    limitation: (compared ? `Cette comparaison soutient une contribution dans les variantes calculées ; elle ne prouve ni une perte contre toutes les défenses ni le meilleur coup. `
      : favourable
        ? `Cette occasion est exploitée dans les deux recherches après le coup joué. Elle ne prouve ni le gain contre toutes les défenses, ni que ce choix est unique ou le meilleur. `
        : `Cette conséquence apparaît dans les deux recherches après le coup joué. Elle n'établit ni une perte contre toutes les défenses, ni le meilleur coup de remplacement. `) +
      (plan.omittedMoves.length ? `Le repère montre ${points(plan.materialDelta)} ; le témoin complet atteint ${points(plan.proofMaterialDelta)} pour les ${campName(victim.color)}.` : "") };
}
