import { Chess, type Color, type Square } from "chess.js";
import type { Score } from "../../engine/analysis";
import { boardFromCommand } from "../StudyTree";
import { frenchSan, type ReviewPosition, type ReviewResult } from "../model";
import {
  capturedSquare,
  decisionContext,
  uci,
  type DecisionContext,
} from "./context";
import {
  defenceEvidence,
  framePosition,
  type DefenceEvidence,
} from "./evidence";
import { possibilities, type ClosedRoute } from "./possibilities";
import type { RestrictionHypothesis, Understanding } from "./prototype";

export type RestoredRoute = ClosedRoute & {
  move: string;
  blockerAlternativeSquare: Square;
};
export type ContrastReason =
  | "different-role"
  | "no-alternative"
  | "illegal-threat"
  | "different-victim"
  | "different-attacker"
  | "different-threat"
  | "unavailable-options"
  | "same-restriction"
  | "restored-route";
export type ContrastPlan = {
  reason: ContrastReason;
  routes: RestoredRoute[];
  /** Branche légale conditionnelle, pas une affirmation du meilleur choix adverse. */
  branch?: DecisionContext;
  position?: ReviewPosition;
  target?: Pick<RestrictionHypothesis, "victimId" | "threatPly">;
};
export type ContrastObservation = {
  reason: ContrastReason;
  routes: RestoredRoute[];
  command: string | null;
  usedRoute: RestoredRoute | null;
  evidence: DefenceEvidence | null;
  score: Score | null;
};
export type Attribution = {
  status: "supported" | "not-established";
  reason:
    | "closed-retreat"
    | "no-comparable-branch"
    | "unstable-alternative"
    | "loss-not-verified"
    | "advantage-not-verified"
    | "defence-not-observed"
    | "unstable-defence"
    | "defence-not-improved";
  /** Une contribution au verdict, jamais sa cause unique ni une preuve exhaustive. */
  scope: "conditional-mechanism";
  victimId: string | null;
  blockerId: string | null;
};

/** Rejouer légalement la même menace après une autre décision. Changer le trait
 * ou déplacer fictivement une pièce ferait disparaître d'autres contraintes. */
export function planContrast(
  understanding: Understanding,
  hypothesis: RestrictionHypothesis,
  alternative: string | null,
): ContrastPlan {
  const unavailable = (reason: ContrastReason): ContrastPlan => ({
    reason,
    routes: [],
  });
  if (hypothesis.kind !== "allows-restriction")
    return unavailable("different-role");
  if (!alternative) return unavailable("no-alternative");
  const { context } = understanding;
  const source = { ...framePosition(context.before), played: alternative };
  const originalMove = context.moves[context.decision];
  if (alternative === uci(originalMove))
    throw new Error("La comparaison exige une autre décision.");
  const setup = decisionContext(source);
  const threat = context.moves[hypothesis.threatPly],
    board = boardFromCommand(setup.after.command);
  const reply =
    !board.isGameOver() &&
    board.moves({ verbose: true }).find((m) => uci(m) === uci(threat));
  if (!reply) return unavailable("illegal-threat");
  const originalAttacker = context.frames[hypothesis.threatPly].pieces.find(
      (p) => p.square === threat.from,
    ),
    attacker = setup.after.pieces.find((p) => p.square === reply.from);
  if (
    !originalAttacker ||
    attacker?.id !== originalAttacker.id ||
    attacker.type !== originalAttacker.type
  )
    return unavailable("different-attacker");
  const originalCapture =
    context.frames[hypothesis.threatPly].pieces.find(
      (p) => p.square === capturedSquare(threat),
    )?.id ?? null;
  const alternativeCapture =
    setup.after.pieces.find((p) => p.square === capturedSquare(reply))?.id ??
    null;
  if (
    originalCapture !== alternativeCapture ||
    new Chess(threat.after).isCheck() !== new Chess(reply.after).isCheck()
  )
    return unavailable("different-threat");
  const branch = decisionContext(source, {
    score: null,
    depth: null,
    bestMove: uci(reply),
    bestSan: frenchSan(reply.san),
    variation: [
      {
        from: reply.from,
        to: reply.to,
        fen: reply.after,
        label: frenchSan(reply.san),
      },
    ],
  });
  const frame = branch.frames[branch.decision + 2],
    actual = context.frames[hypothesis.threatPly + 1],
    victim = frame.pieces.find((p) => p.id === hypothesis.victimId),
    originalVictim = actual.pieces.find((p) => p.id === hypothesis.victimId);
  if (
    !victim ||
    !originalVictim ||
    victim.square !== originalVictim.square ||
    victim.type !== originalVictim.type
  )
    return unavailable("different-victim");
  if (frame.turn !== victim.color) return unavailable("unavailable-options");
  const options = possibilities(frame, victim.color, victim.id);
  if (options.status !== "available") return unavailable("unavailable-options");
  const piece = options.pieces[0];
  const routes = hypothesis.closedRoutes.flatMap((route) => {
    const originalBlocker = actual.pieces.find((p) => p.id === route.blockerId),
      beforeBlocker = context.before.pieces.find(
        (p) => p.id === route.blockerId,
      ),
      alternativeBlocker = frame.pieces.find((p) => p.id === route.blockerId);
    // Le coup doit réellement avoir déplacé ce bloqueur sur le chemin. Une
    // autre identité, une capture ou un simple changement de score ne suffit pas.
    if (
      !originalBlocker ||
      !beforeBlocker ||
      !alternativeBlocker ||
      beforeBlocker.square === originalBlocker.square ||
      originalBlocker.square !== route.blocker ||
      alternativeBlocker.square === originalBlocker.square
    )
      return [];
    const exit = piece.moves.find(
      (option) =>
        option.move.from === route.from && option.move.to === route.to,
    );
    if (
      !exit ||
      exit.captures.some((c) => c.balanceAfterImmediateRecapture < 0)
    )
      return [];
    return [
      {
        ...route,
        move: uci(exit.move),
        blockerAlternativeSquare: alternativeBlocker.square,
      },
    ];
  });
  if (!routes.length) return unavailable("same-restriction");
  return {
    reason: "restored-route",
    routes,
    branch,
    position: framePosition(frame),
    target: { victimId: victim.id, threatPly: branch.decision + 1 },
  };
}

export function observeContrast(
  plan: ContrastPlan,
  result: ReviewResult | null,
): ContrastObservation {
  const evidence =
    plan.branch && plan.target && result
      ? defenceEvidence({ context: plan.branch }, plan.target, result)
      : null;
  return {
    reason: plan.reason,
    routes: plan.routes,
    command: plan.position?.command ?? null,
    usedRoute:
      plan.routes.find((route) => route.move === result?.bestMove) ?? null,
    evidence,
    score: result?.score ?? null,
  };
}

/** La comparaison des évaluations est nécessaire mais insuffisante : le moteur
 * doit aussi emprunter une retraite précisément fermée par le coup examiné. */
export function attributeRestriction(
  passes: { alternative: string | null; contrast: ContrastObservation }[],
  conditions: {
    lossSupported: boolean;
    alternativeBetter: boolean;
    originalScores: (Score | null)[];
    victimSide: Color;
  },
): Attribution {
  const no = (reason: Attribution["reason"]): Attribution => ({
    status: "not-established",
    reason,
    scope: "conditional-mechanism",
    victimId: null,
    blockerId: null,
  });
  if (
    passes.length !== 2 ||
    passes.some((p) => p.contrast.reason !== "restored-route")
  )
    return no("no-comparable-branch");
  if (passes[0].alternative !== passes[1].alternative)
    return no("unstable-alternative");
  if (!conditions.lossSupported) return no("loss-not-verified");
  if (!conditions.alternativeBetter) return no("advantage-not-verified");
  const [a, b] = passes.map((p) => p.contrast);
  if (
    !a.usedRoute ||
    !b.usedRoute ||
    a.evidence?.outcome !== "preserved" ||
    b.evidence?.outcome !== "preserved"
  )
    return no("defence-not-observed");
  // Un mat (favorable ou adverse) ou une forte dérive peut dominer le sauvetage.
  // Ne pas l'aplatir en centipions pour fabriquer une cause matérielle.
  if (
    a.score?.kind !== "cp" ||
    b.score?.kind !== "cp" ||
    a.score.bound ||
    b.score.bound ||
    !Number.isFinite(a.score.value) ||
    !Number.isFinite(b.score.value) ||
    Math.abs(a.score.value - b.score.value) > 100 ||
    a.usedRoute.pieceId !== b.usedRoute.pieceId ||
    a.usedRoute.blockerId !== b.usedRoute.blockerId
  )
    return no("unstable-defence");
  const sign = conditions.victimSide === "w" ? 1 : -1;
  if (
    conditions.originalScores.length !== 2 ||
    conditions.originalScores.some(
      (score, index) =>
        score?.kind !== "cp" ||
        score.bound ||
        !Number.isFinite(score.value) ||
        ((index === 0 ? a.score!.value : b.score!.value) - score.value) * sign <
          100,
    )
  )
    return no("defence-not-improved");
  return {
    status: "supported",
    reason: "closed-retreat",
    scope: "conditional-mechanism",
    victimId: a.usedRoute.pieceId,
    blockerId: a.usedRoute.blockerId,
  };
}
