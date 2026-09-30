import { Chess, type Color, type Move, type Square } from "chess.js";
import { boardFromCommand } from "./StudyTree";
import type { ExplanationLine } from "./explanations";
import type { TacticalMark } from "./tactics";

export type PositionalFact = {
  kind: "development" | "file" | "pawns" | "king" | "activity" | "center";
  title: string;
  text: string;
  squares: Square[];
};
export type PositionalObservation = {
  fact: PositionalFact;
  line: ExplanationLine | null;
};
export type PositionalNotes = {
  played: PositionalObservation | null;
  alternative: PositionalObservation | null;
};
const names = {
  p: "pion",
  n: "cavalier",
  b: "fou",
  r: "tour",
  q: "dame",
  k: "roi",
};
const camp = (side: Color) => (side === "w" ? "blanc" : "noir");
const enemy = (side: Color): Color => (side === "w" ? "b" : "w");
const pieces = (board: Chess) =>
  board
    .board()
    .flat()
    .filter((piece) => piece !== null);
const pawns = (board: Chess, side: Color) =>
  pieces(board).filter((piece) => piece.color === side && piece.type === "p");
const file = (square: Square) => square.charCodeAt(0);
const rank = (square: Square) => Number(square[1]);
const ahead = (from: Square, to: Square, side: Color) =>
  (rank(to) - rank(from)) * (side === "w" ? 1 : -1) > 0;
const center: Square[] = ["d4", "e4", "d5", "e5"];
const standard = new Chess().fen();

function isolated(board: Chess, square: Square, side: Color) {
  return !pawns(board, side).some(
    (pawn) => Math.abs(file(pawn.square) - file(square)) === 1,
  );
}
function passed(board: Chess, square: Square, side: Color) {
  // Un pion doublé bloqué par son propre pion n'est pas présenté comme un candidat libre.
  return (
    !pawns(board, side).some(
      (pawn) =>
        pawn.square[0] === square[0] && ahead(square, pawn.square, side),
    ) &&
    !pawns(board, enemy(side)).some(
      (pawn) =>
        Math.abs(file(pawn.square) - file(square)) <= 1 &&
        ahead(square, pawn.square, side),
    )
  );
}
function shield(board: Chess, king: Square, side: Color) {
  return pawns(board, side)
    .filter(
      (pawn) =>
        Math.abs(file(pawn.square) - file(king)) <= 1 &&
        ahead(king, pawn.square, side) &&
        Math.abs(rank(pawn.square) - rank(king)) <= 2,
    )
    .map((pawn) => pawn.square);
}
function legalMoves(board: Chess, side: Color) {
  const fields = board.fen().split(" ");
  fields[1] = side;
  fields[3] = "-";
  return new Chess(fields.join(" "))
    .moves({ verbose: true })
    .filter((move) => !move.isKingsideCastle() && !move.isQueensideCastle());
}
function pawnFacts(before: Chess, after: Chess, move: Move): PositionalFact[] {
  const facts: PositionalFact[] = [];
  for (const side of [move.color, enemy(move.color)]) {
    const prior = pawns(before, side),
      next = pawns(after, side);
    for (const letter of "abcdefgh") {
      const doubled = next.filter((pawn) => pawn.square[0] === letter);
      if (
        doubled.length >= 2 &&
        prior.filter((pawn) => pawn.square[0] === letter).length < 2
      )
        facts.push({
          kind: "pawns",
          title: "Pions doublés",
          text: `Les pions ${camp(side)}s en ${doubled.map((pawn) => pawn.square).join(" et ")} sont maintenant sur la même colonne. Cela change leur structure ; ce n’est pas à lui seul un verdict sur le coup.`,
          squares: doubled.map((pawn) => pawn.square),
        });
    }
    for (const pawn of next) {
      const source =
        move.piece === "p" && move.color === side && pawn.square === move.to
          ? move.from
          : pawn.square;
      if (
        before.get(source)?.type !== "p" ||
        before.get(source)?.color !== side
      )
        continue;
      if (passed(after, pawn.square, side) && !passed(before, source, side))
        facts.push({
          kind: "pawns",
          title: "Pion passé",
          text: `Le pion ${camp(side)} en ${pawn.square} n’a plus de pion adverse devant lui sur sa colonne ou les colonnes voisines. C’est un pion passé ; les autres pièces peuvent encore le bloquer ou le capturer.`,
          squares: [pawn.square],
        });
      else if (
        isolated(after, pawn.square, side) &&
        !isolated(before, source, side)
      )
        facts.push({
          kind: "pawns",
          title: "Pion isolé",
          text: `Le pion ${camp(side)} en ${pawn.square} n’a plus de pion ami sur les colonnes voisines. C’est un pion isolé ; les autres pièces peuvent encore le défendre.`,
          squares: [pawn.square],
        });
    }
  }
  return facts;
}

/** Constats locaux, indépendants du score : une propriété ne prouve pas la qualité du coup. */
function computePositionFacts(line: ExplanationLine): PositionalFact[] {
  try {
    const before = boardFromCommand(line.steps[0].command);
    if (before.fen() !== line.steps[0].fen || before.isGameOver()) return [];
    const candidate = line.steps[1]?.move;
    if (!candidate) return [];
    const after = boardFromCommand(line.steps[0].command);
    const move = after.move({
      from: candidate.from,
      to: candidate.to,
      promotion: candidate.promotion,
    });
    const expected =
      line.steps[0].command +
      (line.steps[0].command.includes(" moves ") ? " " : " moves ") +
      move.from +
      move.to +
      (move.promotion ?? "");
    if (
      line.steps[1].command !== expected ||
      after.fen() !== line.steps[1].fen ||
      after.isGameOver() ||
      move.promotion
    )
      return [];
    const facts: PositionalFact[] = [];
    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const rook =
        `${move.isKingsideCastle() ? "f" : "d"}${move.color === "w" ? 1 : 8}` as Square;
      const cover = shield(after, move.to, move.color);
      facts.push({
        kind: "king",
        title: "Roque",
        text: `Le roi rejoint ${move.to} et la tour ${rook}.${cover.length ? ` Les pions en ${cover.join(", ")} se trouvent devant le roi, à une ou deux rangées.` : " Aucun pion ami ne se trouve devant le roi sur les trois colonnes proches, à une ou deux rangées."} La sécurité du roi dépend aussi des lignes et des pièces adverses.`,
        squares: [move.to, rook, ...cover],
      });
    }
    for (const side of [move.color, enemy(move.color)]) {
      const king = pieces(after).find(
        (piece) => piece.type === "k" && piece.color === side,
      )!.square;
      // La couverture proche du roi est surtout pertinente sur une aile, avec une dame adverse.
      if (
        !"bcgh".includes(king[0]) ||
        (side === "w" ? rank(king) > 2 : rank(king) < 7) ||
        before.get(king)?.type !== "k" ||
        !pieces(after).some(
          (piece) => piece.type === "q" && piece.color !== side,
        )
      )
        continue;
      const prior = shield(before, king, side),
        next = shield(after, king, side);
      if (
        prior.length > next.length &&
        !move.isKingsideCastle() &&
        !move.isQueensideCastle()
      )
        facts.push({
          kind: "king",
          title: "Couverture du roi",
          text: `Devant le roi ${camp(side)} en ${king}, il reste ${next.length} pion${next.length === 1 ? "" : "s"} ami${next.length === 1 ? "" : "s"} à une ou deux rangées, contre ${prior.length} avant le coup. Ce constat ne suffit pas à prouver une attaque ou un mat.`,
          squares: [
            king,
            ...next,
            ...prior.filter((square) => !next.includes(square)),
          ],
        });
    }
    for (const rook of pieces(after).filter(
      (piece) => piece.type === "r" && piece.color === move.color,
    )) {
      const letter = rook.square[0];
      const own = pawns(after, move.color).filter(
        (pawn) => pawn.square[0] === letter,
      );
      if (own.length) continue;
      const opposing = pawns(after, enemy(move.color)).filter(
        (pawn) => pawn.square[0] === letter,
      );
      const wasOpen =
        pawns(before, move.color).every((pawn) => pawn.square[0] !== letter) &&
        (opposing.length > 0 ||
          pawns(before, enemy(move.color)).every(
            (pawn) => pawn.square[0] !== letter,
          ));
      if (
        wasOpen &&
        !(
          move.piece === "r" &&
          move.to === rook.square &&
          move.from[0] !== letter
        )
      )
        continue;
      const open = opposing.length === 0;
      facts.push({
        kind: "file",
        title: open ? "Colonne ouverte" : "Colonne semi-ouverte",
        text: open
          ? `La tour en ${rook.square} occupe la colonne ${letter}, où il n’y a aucun pion des deux camps. Les autres pièces peuvent encore couper cette colonne.`
          : `La tour en ${rook.square} occupe la colonne ${letter}, sans pion ${camp(move.color)} mais avec ${opposing.length} pion${opposing.length === 1 ? "" : "s"} adverse${opposing.length === 1 ? "" : "s"}. Cette colonne est semi-ouverte pour ${move.color === "w" ? "les Blancs" : "les Noirs"}.`,
        squares: [
          rook.square,
          ...Array.from({ length: 8 }, (_, i) => `${letter}${i + 1}` as Square),
        ],
      });
    }
    facts.push(...pawnFacts(before, after, move));
    const history = before.history({ verbose: true });
    const initial = history[0]?.before ?? before.fen();
    const home = move.color === "w" ? "1" : "8";
    if (
      initial === standard &&
      before.moveNumber() <= 15 &&
      "nb".includes(move.piece) &&
      move.from[1] === home &&
      move.to[1] !== home &&
      !history.some(
        (previous) => previous.from === move.from || previous.to === move.from,
      )
    )
      facts.push({
        kind: "development",
        title: "Développement",
        text: `Le ${names[move.piece]} ${camp(move.color)} quitte pour la première fois sa case de départ ${move.from} et rejoint ${move.to}.`,
        squares: [move.from, move.to],
      });
    // Ne pas simuler un tour supplémentaire pendant un échec. Les possibilités
    // comptées sont légales, mais leur sécurité après la réponse adverse reste inconnue.
    if (!before.isCheck() && !after.isCheck()) {
      const priorLegal = legalMoves(before, move.color),
        nextLegal = legalMoves(after, move.color);
      const priorMoves = priorLegal.filter((move) => !move.captured),
        nextMoves = nextLegal.filter((move) => !move.captured);
      for (const piece of pieces(after).filter(
        (piece) => piece.color === move.color && "nbrq".includes(piece.type),
      )) {
        const source = piece.square === move.to ? move.from : piece.square;
        if (
          before.get(source)?.type !== piece.type ||
          before.get(source)?.color !== piece.color
        )
          continue;
        const prior = new Set(
          priorMoves
            .filter((item) => item.from === source)
            .map((item) => item.to),
        );
        const next = new Set(
          nextMoves
            .filter((item) => item.from === piece.square)
            .map((item) => item.to),
        );
        if (next.size - prior.size >= 3 && prior.size <= 4)
          facts.push({
            kind: "activity",
            title: "Mobilité",
            text: `${piece.type === "q" || piece.type === "r" ? "La" : "Le"} ${names[piece.type]} en ${piece.square} dispose maintenant de ${next.size} déplacements légaux sans prise, contre ${prior.size} avant le coup, si son camp rejouait. Ce sont des possibilités de mouvement, pas des destinations garanties sûres.`,
            squares: [
              piece.square,
              ...[...next].filter((square) => !prior.has(square)),
            ],
          });
        const gained = center.filter(
          (square) =>
            nextLegal.some(
              (item) => item.from === piece.square && item.to === square,
            ) &&
            !priorLegal.some(
              (item) => item.from === source && item.to === square,
            ),
        );
        if (gained.length >= 2)
          facts.push({
            kind: "center",
            title: "Accès au centre",
            text: `Depuis ${piece.square}, le ${names[piece.type]} peut rejoindre ${gained.join(" et ")}, des cases centrales auxquelles il n’avait pas accès avant ce coup, si son camp rejouait. L’adversaire peut modifier ces possibilités.`,
            squares: [piece.square, ...gained],
          });
      }
      if (
        move.piece === "p" &&
        center.includes(move.to) &&
        !center.includes(move.from)
      )
        facts.push({
          kind: "center",
          title: "Occupation du centre",
          text: `Le pion ${camp(move.color)} occupe maintenant ${move.to}, une des quatre cases centrales. Cela décrit sa place sur l’échiquier, sans garantir qu’il pourra s’y maintenir.`,
          squares: [move.to],
        });
    }
    const priority: Record<PositionalFact["kind"], number> = {
      king: 0,
      file: 1,
      pawns: 2,
      development: 3,
      center: 4,
      activity: 5,
    };
    return facts.sort(
      (left, right) => priority[left.kind] - priority[right.kind],
    );
  } catch {
    return [];
  }
}

// Les observations ne dépendent pas du score. Garder un cache court évite de
// recompter les coups légaux à chaque information UCI, sans perdre l’historique.
const factsCache = new Map<string, PositionalFact[]>();
export function positionFacts(line: ExplanationLine): PositionalFact[] {
  const move = line.steps[1]?.move;
  const key = JSON.stringify([
    line.steps[0]?.command,
    line.steps[0]?.fen,
    line.steps[1]?.fen,
    line.steps[1]?.command,
    move?.from,
    move?.to,
    move?.promotion,
  ]);
  const cached = factsCache.get(key);
  if (cached) return cached;
  const facts = computePositionFacts(line);
  factsCache.set(key, facts);
  while (factsCache.size > 128)
    factsCache.delete(factsCache.keys().next().value!);
  return facts;
}

export function positionObservation(
  line: ExplanationLine | null,
  alternative = false,
): PositionalObservation | null {
  if (!line) return null;
  const fact = positionFacts(line)[0];
  if (!fact) return null;
  const marks: TacticalMark[] = [...new Set(fact.squares)].map((from) => ({
    from,
    tone: "observation",
  }));
  // Rejouer un déplacement ou entourer seulement sa case d’arrivée n’apporte
  // rien. Une aide visuelle doit situer une relation entre plusieurs cases.
  const useful = fact.kind !== "development" && marks.length > 1;
  return {
    fact,
    line: useful
      ? {
          title: alternative
            ? "Repères du coup proposé"
            : "Repères du coup joué",
          kind: "observation",
          truncated: false,
          steps: [
            { ...line.steps[1], motif: fact.title, marks, text: fact.text },
          ],
        }
      : null,
  };
}
