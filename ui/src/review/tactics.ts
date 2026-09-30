import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";
import type { ExplanationLine } from "./explanations";

export type TacticalMark = {
  from: Square;
  to?: Square;
  tone: "threat" | "idea";
};
export type TacticalIdea = {
  kind:
    | "fork"
    | "pin"
    | "discovery"
    | "defender"
    | "hanging"
    | "mate"
    | "promotion"
    | "defence";
  title: string;
  text: string;
  step: number;
  consequence: number;
  marks: TacticalMark[];
};
const values: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};
const names = {
  p: "le pion",
  n: "le cavalier",
  b: "le fou",
  r: "la tour",
  q: "la dame",
  k: "le roi",
};
const opposite = (side: Color): Color => (side === "w" ? "b" : "w");
const arrow = (
  from: Square,
  to: Square,
  tone: TacticalMark["tone"] = "threat",
): TacticalMark => ({ from, to, tone });
const pieceAt = (board: Chess, square: Square) =>
  `${names[board.get(square)!.type]} en ${square}`;
const pieces = (board: Chess) =>
  board
    .board()
    .flat()
    .filter((piece) => piece !== null);

function withTurn(board: Chess, side: Color) {
  const fields = board.fen().split(" ");
  if (fields[1] !== side) fields[3] = "-";
  fields[1] = side;
  return new Chess(fields.join(" "));
}
// Ces essais locaux vérifient une menace immédiate, sans rechercher une variante
// ni ignorer un échec : ils ne prétendent pas prouver un gain à plusieurs coups.
function movesFor(board: Chess, side: Color): Move[] {
  return withTurn(board, side).moves({ verbose: true });
}
function matesFor(board: Chess, side: Color) {
  if (side !== board.turn() && board.isCheck()) return [];
  return movesFor(board, side).filter((move) => move.san.endsWith("#"));
}
function defenders(board: Chess, target: Square): Square[] {
  const victim = board.get(target);
  if (!victim || victim.type === "k") return [];
  const candidates = board.attackers(target, victim.color);
  if (!candidates.length) return [];
  const probe = withTurn(board, victim.color);
  // Une pièce amie ne peut pas être capturée. La remplacer pour cet essai permet
  // de filtrer les défenseurs cloués et les reprises illégales du roi.
  probe.put({ color: opposite(victim.color), type: "p" }, target);
  return probe
    .moves({ verbose: true })
    .filter((move) => move.to === target && candidates.includes(move.from))
    .map((move) => move.from);
}
function rayBetween(from: Square, to: Square): Square[] {
  const x = from.charCodeAt(0),
    y = Number(from[1]);
  const dx = to.charCodeAt(0) - x,
    dy = Number(to[1]) - y;
  if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) return [];
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  return Array.from(
    { length: Math.max(0, length - 1) },
    (_, index) =>
      `${String.fromCharCode(x + Math.sign(dx) * (index + 1))}${y + Math.sign(dy) * (index + 1)}` as Square,
  );
}
function sliderAlong(type: PieceSymbol, from: Square, to: Square) {
  const straight = from[0] === to[0] || from[1] === to[1];
  const diagonal =
    Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) ===
    Math.abs(Number(from[1]) - Number(to[1]));
  return (
    (straight && (type === "r" || type === "q")) ||
    (diagonal && (type === "b" || type === "q"))
  );
}
function hasRecapture(move: Move) {
  return new Chess(move.after)
    .moves({ verbose: true })
    .some((reply) => reply.captured && reply.to === move.to);
}
function sameVictim(
  line: ExplanationLine,
  fromStep: number,
  captureStep: number,
  square: Square,
) {
  return !line.steps
    .slice(fromStep + 1, captureStep)
    .some((step) => step.move?.from === square || step.move?.to === square);
}

/** Motifs reliés à une capture, un mat ou une promotion réellement présents dans la PV. */
export function tacticalIdeas(
  line: ExplanationLine,
  actor: Color,
  firstStep: number,
): TacticalIdea[] {
  const steps = line.steps;
  const move = steps[firstStep]?.move;
  if (!move || move.color !== actor) return [];
  const before = new Chess(steps[firstStep - 1].fen);
  const board = new Chess(steps[firstStep].fen);
  const ideas: TacticalIdea[] = [];
  const capture = steps[firstStep + 2]?.move;
  const legalAttacks = movesFor(board, actor).filter(
    (candidate) => candidate.from === move.to && candidate.captured,
  );
  const targets = pieces(board).filter(
    (piece) =>
      piece.color !== actor &&
      values[piece.type] >= 3 &&
      (piece.type === "k"
        ? board.attackers(piece.square, actor).includes(move.to)
        : legalAttacks.some((attack) => attack.to === piece.square)),
  );
  // Le déplacement de l'une des cibles suivi de la prise de l'autre relie
  // la double attaque à sa conséquence, au lieu de compter seulement les attaques.
  const reply = steps[firstStep + 1]?.move;
  if (
    targets.length >= 2 &&
    capture?.captured &&
    capture.from === move.to &&
    targets.some((target) => target.square === capture.to) &&
    targets.some(
      (target) => target.square !== capture.to && target.square === reply?.from,
    )
  ) {
    const chosen = [
      targets.find((target) => target.square === capture.to)!,
      targets.find((target) => target.square === reply?.from)!,
    ];
    ideas.push({
      kind: "fork",
      title: "Fourchette",
      step: firstStep,
      consequence: firstStep + 2,
      text: `${pieceAt(board, move.to)} attaque à la fois ${chosen.map((target) => pieceAt(board, target.square)).join(" et ")}. Dans la suite, l’une des cibles se déplace et l’autre est capturée.`,
      marks: chosen.map((target) => arrow(move.to, target.square)),
    });
  }

  // Une seule pièce interposée entre un fou/tour/dame et le roi (ou une pièce
  // plus précieuse) définit le clouage. La suite doit en montrer l'exploitation.
  for (const attacker of pieces(board).filter(
    (piece) => piece.color === actor && "brq".includes(piece.type),
  )) {
    for (const rear of pieces(board).filter(
      (piece) => piece.color !== actor && values[piece.type] >= 5,
    )) {
      if (!sliderAlong(attacker.type, attacker.square, rear.square)) continue;
      const between = rayBetween(attacker.square, rear.square);
      const occupied = between.filter((square) => board.get(square));
      if (occupied.length !== 1) continue;
      const pinnedSquare = occupied[0],
        pinned = board.get(pinnedSquare)!;
      if (
        pinned.color === actor ||
        pinned.type === "k" ||
        values[pinned.type] >= values[rear.type]
      )
        continue;
      const absolute = rear.type === "k";
      const exploited = steps.findIndex(
        (step, index) =>
          index > firstStep &&
          step.move?.color === actor &&
          step.move.captured &&
          (absolute
            ? step.move.to === pinnedSquare &&
              sameVictim(line, firstStep, index, pinnedSquare) &&
              sameVictim(line, firstStep, index, rear.square)
            : step.move.from === attacker.square &&
              step.move.to === rear.square &&
              sameVictim(line, firstStep, index, rear.square) &&
              steps
                .slice(firstStep + 1, index)
                .some((item) => item.move?.from === pinnedSquare)),
      );
      if (exploited < 0) continue;
      // Un clouage ancien et sans rapport avec le coup examiné ne suffit pas.
      if (
        attacker.square !== move.to &&
        !between.includes(move.from) &&
        move.to !== pinnedSquare
      )
        continue;
      ideas.push({
        kind: "pin",
        title: absolute ? "Clouage au roi" : "Clouage relatif",
        step: firstStep,
        consequence: exploited,
        text: absolute
          ? `${pieceAt(board, pinnedSquare)} est cloué par ${pieceAt(board, attacker.square)} : quitter cette ligne exposerait son roi en ${rear.square}. Cette pièce est capturée dans la suite.`
          : `${pieceAt(board, pinnedSquare)} se trouve entre ${pieceAt(board, attacker.square)} et ${pieceAt(board, rear.square)}. Dans la suite, son déplacement permet la capture de la pièce située derrière.`,
        marks: [
          arrow(attacker.square, pinnedSquare),
          arrow(pinnedSquare, rear.square),
          { from: pinnedSquare, tone: "threat" },
        ],
      });
    }
  }

  for (const attacker of pieces(board).filter(
    (piece) =>
      piece.color === actor &&
      piece.square !== move.to &&
      "brq".includes(piece.type),
  )) {
    for (const target of pieces(board).filter(
      (piece) => piece.color !== actor && values[piece.type] >= 3,
    )) {
      if (
        !board.attackers(target.square, actor).includes(attacker.square) ||
        before.attackers(target.square, actor).includes(attacker.square) ||
        !rayBetween(attacker.square, target.square).includes(move.from)
      )
        continue;
      const consequence =
        target.type === "k"
          ? steps.findIndex(
              (step, index) =>
                index > firstStep &&
                step.move?.color === actor &&
                step.move.san.endsWith("#"),
            )
          : steps.findIndex(
              (step, index) =>
                index > firstStep &&
                step.move?.from === attacker.square &&
                step.move.to === target.square &&
                step.move.captured &&
                sameVictim(line, firstStep, index, target.square),
            );
      if (consequence < 0) continue;
      ideas.push({
        kind: "discovery",
        title:
          target.type === "k"
            ? "Échec à la découverte"
            : "Attaque à la découverte",
        step: firstStep,
        consequence,
        text: `Le déplacement de ${move.from} à ${move.to} ouvre la ligne de ${pieceAt(board, attacker.square)} vers ${pieceAt(board, target.square)}. ${target.type === "k" ? "La suite se termine par un mat." : "La pièce visée est ensuite capturée dans la suite."}`,
        marks: [
          arrow(move.from, move.to, "idea"),
          arrow(attacker.square, target.square),
        ],
      });
    }
  }

  // Le défenseur peut avoir été supprimé par le bon coup, ou déplacé par le
  // mauvais coup juste avant la réponse adverse. On exige la même cible intacte.
  const decision = steps[1].move!;
  const origin = new Chess(steps[0].fen);
  const afterDecision = new Chess(steps[1].fen);
  for (
    let index = firstStep;
    index < Math.min(steps.length, firstStep + 3);
    index++
  ) {
    const taken = steps[index].move!;
    if (taken.color !== actor || !taken.captured || taken.isEnPassant())
      continue;
    const victimBoard = new Chess(steps[index - 1].fen);
    if (
      !origin.get(taken.to) ||
      origin.get(taken.to)?.color === actor ||
      !sameVictim(line, 0, index, taken.to)
    )
      continue;
    const guards = defenders(origin, taken.to);
    const lost = guards.find(
      (square) =>
        (decision.color !== actor && decision.from === square) ||
        (decision.color === actor &&
          decision.captured &&
          decision.to === square),
    );
    if (
      lost &&
      index > 1 &&
      !defenders(afterDecision, taken.to).length &&
      !defenders(victimBoard, taken.to).length &&
      !hasRecapture(taken)
    ) {
      const removed = decision.color === actor;
      ideas.push({
        kind: "defender",
        title: removed ? "Défenseur supprimé" : "Défenseur déplacé",
        step: 0,
        consequence: index,
        text: `${pieceAt(origin, lost)} défend ${pieceAt(origin, taken.to)}. ${removed ? "Sa capture" : `Son déplacement en ${decision.to}`} retire cette défense ; la cible est ensuite capturée sans reprise immédiate dans la suite.`,
        marks: [
          arrow(lost, taken.to, "idea"),
          arrow(decision.from, decision.to),
        ],
      });
    }
  }

  if (
    move.captured &&
    !move.isEnPassant() &&
    !defenders(before, move.to).length &&
    !hasRecapture(move)
  ) {
    ideas.push({
      kind: "hanging",
      title: "Pièce sans défense",
      step: firstStep - 1,
      consequence: firstStep,
      text: `${pieceAt(before, move.to)} n’a pas de défenseur capable de reprendre sur cette case. Dans la suite, ${pieceAt(before, move.from)} effectue la capture.`,
      marks: [arrow(move.from, move.to), { from: move.to, tone: "threat" }],
    });
  }
  if (move.san.endsWith("#") && firstStep > 1) {
    ideas.push({
      kind: "mate",
      title: "Mat en un permis",
      step: firstStep - 1,
      consequence: firstStep,
      text: `Après le coup joué, ${pieceAt(before, move.from)} peut aller en ${move.to} et donner échec et mat.`,
      marks: [arrow(move.from, move.to)],
    });
  } else if (!board.isCheck()) {
    const mate = steps[firstStep + 2]?.move;
    if (
      mate?.san.endsWith("#") &&
      !matesFor(before, actor).some(
        (candidate) =>
          candidate.from === mate.from &&
          candidate.to === mate.to &&
          candidate.promotion === mate.promotion,
      ) &&
      matesFor(board, actor).some(
        (candidate) =>
          candidate.from === mate.from &&
          candidate.to === mate.to &&
          candidate.promotion === mate.promotion,
      )
    ) {
      ideas.push({
        kind: "mate",
        title: "Menace de mat",
        step: firstStep,
        consequence: firstStep + 2,
        text: `Ce coup prépare un mat en un par ${pieceAt(board, mate.from)} en ${mate.to}. La réponse de la suite ne le pare pas.`,
        marks: [arrow(mate.from, mate.to)],
      });
    }
  }
  if (move.piece === "p" && !move.promotion) {
    let square = move.to;
    const path: TacticalMark[] = [];
    for (let index = firstStep + 1; index < steps.length; index++) {
      const next = steps[index].move!;
      if (next.to === square && next.color !== actor) break;
      if (next.color !== actor || next.from !== square) continue;
      path.push(arrow(square, next.to, "idea"));
      square = next.to;
      if (next.promotion) {
        ideas.push({
          kind: "promotion",
          title: "Course à la promotion",
          step: firstStep,
          consequence: index,
          text: `L’avancée du pion en ${move.to} mène à sa promotion en ${square} dans la suite analysée.`,
          marks: path,
        });
        break;
      }
    }
  }
  const priority: TacticalIdea["kind"][] = [
    "mate",
    "fork",
    "pin",
    "discovery",
    "defender",
    "promotion",
    "hanging",
  ];
  return ideas.sort(
    (a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind),
  );
}

/** Défenses immédiates vérifiées avant/après ; ne prédit pas les menaces profondes. */
export function defensiveIdea(line: ExplanationLine): TacticalIdea | null {
  const first = line.steps[1]?.move;
  if (!first) return null;
  const before = new Chess(line.steps[0].fen),
    after = new Chess(line.steps[1].fen);
  const enemy = opposite(first.color);
  const threat = matesFor(before, enemy)[0];
  if (threat && !matesFor(after, enemy).length) {
    return {
      kind: "defence",
      title: "Menace de mat parée",
      step: 0,
      consequence: 1,
      text: `Sans réponse, ${pieceAt(before, threat.from)} pouvait donner mat en ${threat.to}. Le coup joué empêche ce mat en un.`,
      marks: [
        arrow(threat.from, threat.to),
        arrow(first.from, first.to, "idea"),
      ],
    };
  }
  const king = pieces(before).find(
    (piece) => piece.color === first.color && piece.type === "k",
  )!;
  if (before.isCheck() && !after.isCheck()) {
    const attacker = before
      .attackers(king.square, enemy)
      .find((square) => rayBetween(square, king.square).includes(first.to));
    if (attacker)
      return {
        kind: "defence",
        title: "Échec bloqué",
        step: 1,
        consequence: 1,
        text: `${pieceAt(after, first.to)} s’interpose entre ${pieceAt(before, attacker)} et son roi en ${king.square}, ce qui bloque l’échec.`,
        marks: [
          arrow(attacker, first.to),
          arrow(first.to, king.square, "idea"),
        ],
      };
  }
  if (before.isCheck()) return null;
  for (const capture of movesFor(before, enemy).filter(
    (move) => move.captured && values[move.captured] >= 3,
  )) {
    const probe = withTurn(before, enemy);
    probe.move(capture);
    if (
      probe
        .moves({ verbose: true })
        .some((reply) => reply.captured && reply.to === capture.to)
    )
      continue;
    if (
      capture.to === first.from &&
      !movesFor(after, enemy).some(
        (move) => move.captured && move.to === first.to,
      )
    ) {
      return {
        kind: "defence",
        title: "Pièce mise à l’abri",
        step: 0,
        consequence: 1,
        text: `${pieceAt(before, first.from)} était menacé par ${pieceAt(before, capture.from)} sans reprise immédiate possible. Après son déplacement en ${first.to}, aucune capture adverse de cette pièce n’est légale immédiatement.`,
        marks: [
          arrow(capture.from, first.from),
          arrow(first.from, first.to, "idea"),
        ],
      };
    }
    if (
      first.to !== capture.to &&
      after.get(capture.to)?.color === first.color
    ) {
      const attack = movesFor(after, enemy).find(
        (move) =>
          move.from === capture.from && move.to === capture.to && move.captured,
      );
      if (!attack) continue;
      const defended = withTurn(after, enemy);
      defended.move(attack);
      const recapture = defended
        .moves({ verbose: true })
        .find(
          (move) =>
            move.from === first.to && move.to === capture.to && move.captured,
        );
      if (recapture && values[attack.piece] >= values[attack.captured!])
        return {
          kind: "defence",
          title: "Pièce défendue",
          step: 1,
          consequence: 1,
          text: `${pieceAt(after, first.to)} défend maintenant ${pieceAt(after, capture.to)} : après la prise depuis ${capture.from}, une reprise sur ${capture.to} est légale.`,
          marks: [
            arrow(first.to, capture.to, "idea"),
            arrow(capture.from, capture.to),
          ],
        };
    }
  }
  return null;
}
