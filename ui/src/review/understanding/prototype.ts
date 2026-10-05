import type { Color } from "chess.js";
import type { ReviewPosition, ReviewResult } from "../model";
import {
  decisionContext,
  opposite,
  type DecisionContext,
  type PositionFrame,
} from "./context";
import { relationHypotheses, type RelationHypothesis } from "./mechanisms";
import { relationChangesWork, type RelationChanges } from "./relations";
import { exchangeContext } from "./exchanges";
import { tacticalConstraintsWork, type TacticalConstraints } from "./constraints";
import { finishWork, type Work } from "./work";
import {
  changedPossibilities,
  possibilitiesWork,
  type ClosedRoute,
  type PieceOptions,
  type Possibilities,
  type PossibilityChange,
} from "./possibilities";

export type RestrictionHypothesis = {
  kind: "allows-restriction" | "creates-restriction";
  status: "hypothesis";
  victimId: string;
  victimSquare: string;
  threatPly: number;
  attack: PieceOptions["legalCapturers"];
  exits: PieceOptions["moves"];
  closedRoutes: ClosedRoute[];
  unverified: readonly [
    "other-defences",
    "intermediate-moves",
    "compensation",
    "better-decision",
  ];
};
export type Understanding = {
  context: DecisionContext;
  changes: Record<Color, PossibilityChange[]>;
  relations: RelationChanges;
  exchange: ReturnType<typeof exchangeContext>;
  hypotheses: RestrictionHypothesis[];
  mechanisms: RelationHypothesis[];
  constraints: TacticalConstraints;
  explanation: null;
};
/** Prototype de faits et d'hypothèses. Il ne produit volontairement aucune
 * explication publiable : cette frontière impose une vérification comparative. */
export function understandDecision(
  source: ReviewPosition,
  result: ReviewResult | null = null,
): Understanding {
  return finishWork(understandingWork(source, result));
}
export function* understandingWork(source: ReviewPosition, result: ReviewResult | null = null): Work<Understanding> {
  yield "context";
  const context = decisionContext(source, result),
    cache = new Map<PositionFrame, Map<Color, Possibilities>>();
  function* read(frame: PositionFrame, side: Color): Work<Possibilities> {
    let sides = cache.get(frame);
    if (!sides) {
      sides = new Map();
      cache.set(frame, sides);
    }
    let value = sides.get(side);
    if (!value) {
      value = yield* possibilitiesWork(frame, side);
      sides.set(side, value);
    }
    return value;
  }
  function* changes(before: PositionFrame, after: PositionFrame, side: Color): Work<PossibilityChange[]> {
    return changedPossibilities(yield* read(before, side), yield* read(after, side), after);
  }
  const actor = context.moves[context.decision].color;
  const hypotheses: RestrictionHypothesis[] = [];
  // Les deux rôles réutilisent le même changement de relations : créer la menace
  // maintenant, ou avoir fermé une issue juste avant la réponse adverse.
  for (const threatPly of [context.decision, context.decision + 1]) {
    if (!context.moves[threatPly]) continue;
    const before = context.frames[threatPly],
      after = context.frames[threatPly + 1];
    const victimSide = opposite(context.moves[threatPly].color);
    const beforeOptions = yield* read(before, victimSide),
      afterOptions = yield* read(after, victimSide);
    if (
      beforeOptions.status !== "available" ||
      afterOptions.status !== "available"
    )
      continue;
    const delta = yield* changes(before, after, victimSide);
    const prior = context.frames[threatPly - 1];
    const setup = prior ? yield* changes(prior, before, victimSide) : [];
    for (const victim of afterOptions.pieces) {
      if (!"bnrq".includes(victim.piece.type) || !victim.legalCapturers?.length)
        continue;
      const change = delta.find((change) => change.pieceId === victim.piece.id);
      if (!change?.newAttackers.length) continue;
      // Une sortie simplement capturable peut être un échange avantageux.
      // Garder l'hypothèse seulement si chaque sortie a une réponse de capture
      // matériellement coûteuse, même après la meilleure reprise immédiate.
      if (
        victim.moves.some(
          (option) =>
            !option.captures.some(
              (capture) => capture.balanceAfterImmediateRecapture < 0,
            ),
        )
      )
        continue;
      const closedRoutes =
        setup.find((change) => change.pieceId === victim.piece.id)
          ?.closedRoutes ?? [];
      if (victimSide === actor && !closedRoutes.length) continue;
      hypotheses.push({
        kind:
          victimSide === actor ? "allows-restriction" : "creates-restriction",
        status: "hypothesis",
        victimId: victim.piece.id,
        victimSquare: victim.piece.square,
        threatPly,
        attack: victim.legalCapturers,
        exits: victim.moves,
        closedRoutes,
        unverified: [
          "other-defences",
          "intermediate-moves",
          "compensation",
          "better-decision",
        ],
      });
    }
  }
  const relations = yield* relationChangesWork(context);
  return {
    context,
    changes: {
      w: yield* changes(context.before, context.after, "w"),
      b: yield* changes(context.before, context.after, "b"),
    },
    relations,
    mechanisms: relationHypotheses(context, relations),
    constraints: yield* tacticalConstraintsWork(context),
    exchange: exchangeContext(context),
    hypotheses,
    explanation: null,
  };
}
