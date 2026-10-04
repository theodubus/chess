import { Chess, type Square } from "chess.js";
import { boardFromCommand } from "../StudyTree";
import type { ReviewPosition } from "../model";
import { decisionContext, opposite, uci } from "./context";
import { assertDraftQuestions, campName, explanationSteps, moveLabel, type PedagogicalDraft } from "./draftModel";
import type { MateConsequenceReport } from "./MateConsequenceVerification";
import { mateWitness, validMateStrategy } from "./forcedMate";

/** Expliquer le mat par l'échec, les sorties du roi et l'absence de réponse
 * légale. Les cases sont examinées après déplacement/capture du roi pour ne pas
 * cacher une attaque derrière sa case de départ. Aucun verdict d'optimalité. */
function mateCage(command: string) {
  const board = boardFromCommand(command);
  if (!board.isCheckmate()) throw new Error("Le repère ne termine pas par un mat.");
  const loser = board.turn(), winner = opposite(loser), king = board.findPiece({ type: "k", color: loser })[0],
    checkers = board.attackers(king, winner), controlled: Square[] = [], occupied: Square[] = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
    if (!dx && !dy) continue;
    const file = king.charCodeAt(0) + dx, rank = Number(king[1]) + dy;
    if (file < 97 || file > 104 || rank < 1 || rank > 8) continue;
    const square = `${String.fromCharCode(file)}${rank}` as Square;
    if (board.get(square)?.color === loser) { occupied.push(square); continue; }
    const probe = new Chess(board.fen()); probe.remove(king); probe.remove(square); probe.put({ type: "k", color: loser }, square);
    if (probe.isAttacked(square, winner)) controlled.push(square);
  }
  const checking = checkers.length > 1 ? `Le roi en ${king} subit un double échec depuis ${checkers.join(" et ")}.`
    : `Le roi en ${king} est en échec depuis ${checkers[0]}.`;
  const escapes = controlled.length ? ` Ses sorties ${controlled.join(", ")} sont contrôlées par l'adversaire.` : "";
  const blocked = occupied.length ? ` Les autres cases voisines (${occupied.join(", ")}) sont occupées par ses propres pièces.` : "";
  return { text: `${checking}${escapes}${blocked} Aucune capture, interposition ou fuite légale ne répond à l'échec.`,
    marks: [...checkers.map((from) => ({ from, to: king, tone: "threat" as const })), ...controlled.map((from) => ({ from, tone: "threat" as const }))] };
}

export function mateConsequenceDraft(position: ReviewPosition, report: MateConsequenceReport): PedagogicalDraft | null {
  if (report.status !== "supported") return null;
  const context = decisionContext(position), winner = opposite(position.turn);
  assertDraftQuestions(context, null, report.passes);
  for (const pass of report.passes) {
    const proof = pass.proof, after = pass.questions.find((q) => q.purpose === "played")!.result,
      before = pass.questions.find((q) => q.purpose === "decision")!.result;
    if (!pass.matched || pass.preExisting || proof?.status !== "proved" || !proof.strategy ||
      proof.winner !== winner || proof.strategy.command !== context.after.command || proof.strategy.fen !== context.after.fen ||
      after.score?.kind !== "mate" || after.score.bound || after.score.winner !== winner ||
      !Number.isInteger(after.score.value) || Math.abs(after.score.value) < 1 || Math.abs(after.score.value) > 3 ||
      proof.horizon !== Math.abs(after.score.value) * 2 - 1 ||
      before.score?.kind === "mate" && before.score.winner === winner || !pass.witness?.moves.length ||
      pass.witness.moves[0] !== after.bestMove || pass.witness.moves.length > proof.horizon ||
      !validMateStrategy(proof, context.after.command))
      throw new Error("Preuve de mat incomplète ou d'une autre décision.");
    // Le témoin illustré appartient lui aussi à la stratégie exhaustive.
    const board = boardFromCommand(context.after.command), hint = after.variation.map((item) => {
      const move = board.moves({ verbose: true }).find((m) => m.from === item.from && m.to === item.to && m.after === item.fen);
      if (!move) throw new Error("PV de mat incohérente.");
      return uci(board.move(move));
    });
    const witness = mateWitness(proof.strategy, hint);
    if (JSON.stringify(witness) !== JSON.stringify(pass.witness)) throw new Error("Branche de mat absente de la preuve ou origine incorrecte.");
  }
  const pass = report.passes.at(-1)!, witness = pass.witness!,
    label = moveLabel(context.before, uci(context.moves[context.decision])),
    played = explanationSteps(context.after, witness.moves, `Après ${label}`),
    cage = mateCage(played.at(-1)!.command),
    count = Math.max(...report.passes.map((p) => Math.ceil(p.proof!.strategy!.plies / 2))),
    change = `Après ${label}, les ${campName(winner)} peuvent forcer le mat en au plus ${count} ${count === 1 ? "coup" : "coups"}.`,
    consequence = `${played[1].label} ${count === 1 ? "donne immédiatement mat." : "engage cette menace ; les réponses légales sont couvertes par la preuve courte."}`;
  played[0].note = change;
  for (let index = 1; index < played.length; index++) {
    played[index].origin = witness.origins[index - 1];
    const board = boardFromCommand(played[index - 1].command), move = board.move(witness.moves[index - 1]);
    if (board.isCheckmate()) { played[index].note = cage.text; played[index].marks = cage.marks; }
    else if (move.color === position.turn) played[index].note = `${played[index].label} est une défense légale ; le mat reste forcé après cette réponse.`;
    else played[index].note = board.isCheck() ? `${played[index].label} donne échec et impose une réponse.`
      : `${played[index].label} prépare le mat. La preuve couvre aussi les réponses autres que celle illustrée.`;
  }
  return { status: "draft", family: "forced-mate", role: "allows-loss", title: `Un mat forcé contre les ${campName(position.turn)}`,
    summary: `${change} ${consequence} ${cage.text}`, comparisonText: "", story: { decision: position.played!, change, consequence, alternative: "" },
    played, alternative: [], evidence: { playedMoves: [...witness.moves], alternativeMoves: [], materialDelta: null,
      exchange: null, contextText: null, origin: "engine-and-rules", scope: "short-forcing-route" },
    limitation: "Les règles couvrent toutes les défenses dans cet horizon après le coup examiné. Une seule branche est illustrée. Cette preuve ne classe pas les autres coups et ne prétend pas démontrer une cause positionnelle antérieure. " +
      (witness.origins.includes("rules") ? "Les coups absents de la PV sont complétés par la preuve légale, pas attribués au moteur." : "Le moteur fournit tous les coups illustrés.") };
}
