import type { Move } from "chess.js";
import type { ReviewPosition, ReviewResult } from "../model";
import { boardFromCommand } from "../StudyTree";
import { capturedSquare, uci } from "./context";
import { exchangeContext } from "./exchanges";
import { campName, points } from "./materialWording";

/** Observation de la suite visible, sans jugement du meilleur coup ni recherche
 * supplémentaire. Les identités tactiques ne sont pas nécessaires à ce bilan. */
export function recaptureObservation(position: ReviewPosition, result: ReviewResult | null) {
  try {
    if (!/^position (startpos|fen )/.test(position.command)) return null;
    const board = boardFromCommand(position.command);
    if (board.fen() !== position.fen || board.turn() !== position.turn || board.isGameOver()) return null;
    const history = board.history({ verbose: true }), previous = history.at(-1);
    if (!previous?.captured) return null;
    const played = board.move(position.played!);
    if (!played.captured || capturedSquare(played) !== previous.to || board.isCheckmate()) return null;
    const moves: Move[] = [...history, played];
    const frames = moves.map(move => ({ fen: move.before, terminal: false }));
    frames.push({ fen: board.fen(), terminal: board.isGameOver() });
    const after = board.fen();
    // Un fragment incohérent n'efface pas le fait historique de la reprise.
    // Il ne contribue simplement à aucun bilan après le coup joué.
    try {
      for (const [index, item] of (result?.variation ?? []).slice(0, 8).entries()) {
        if (board.isGameOver()) break;
        const move = board.moves({ verbose: true }).find(move => move.from === item.from && move.to === item.to && move.after === item.fen);
        if (!move || (index === 0 && uci(move) !== result?.bestMove)) throw new Error("Variante incohérente.");
        board.move(move);
        moves.push(move);
        frames.push({ fen: board.fen(), terminal: board.isGameOver() });
      }
    } catch {
      moves.splice(history.length + 1);
      frames.splice(history.length + 2);
      board.load(after);
    }
    const exchange = exchangeContext({ moves, frames, decision: history.length,
      priorHistory: position.command.split(" moves ")[0] === "position startpos" ? "complete" : "unknown" });
    if (!exchange || exchange.role !== "recapture") return null;
    let text = "Ce coup est une reprise dans un échange déjà commencé. ";
    if (exchange.recaptureStillPossible) {
      text += "Une nouvelle reprise reste possible : le bilan de cet échange n'est pas encore établi.";
    } else {
      const local = `${points(exchange.balanceFromDecision)} pour les ${campName(position.turn)} depuis cette reprise`;
      text += exchange.beginning === "unknown"
        ? `Le début manque dans l'historique ; le bilan total n'est pas connu. Les prises successives affichées valent ${local}.`
        : `Dans la suite affichée, les prises successives valent ${points(exchange.totalBalance)} pour les ${campName(position.turn)} depuis le début, contre ${local}.`;
    }
    return { exchange, text };
  } catch {
    return null;
  }
}
