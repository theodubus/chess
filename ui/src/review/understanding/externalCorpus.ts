import { Chess, DEFAULT_POSITION } from "chess.js";
import games from "./externalGames.json";
import { type CorpusCase, corpusReport, evaluateCorpus } from "./corpus";

export type ExternalGame = {
  id: string;
  source: string;
  retrievedAt: string;
  pgn: string;
  finalFen: string;
  plies: number;
  selection: {
    ply: number;
    san: string;
    family: string;
    expected: CorpusCase["expected"];
    reason: string;
  }[];
};
export const externalGames = games as ExternalGame[];
/** Conserver le passé entier d'une vraie partie. Le futur du PGN est un témoin
 * joué, sans statut de PV moteur ni promesse d'optimalité. */
export function externalCasesFromGame(game: ExternalGame): CorpusCase[] {
  const board = new Chess();
  board.loadPgn(game.pgn, { strict: true });
  const history = board.history({ verbose: true });
  if (history[0]?.before !== DEFAULT_POSITION)
    throw new Error(`Historique source incomplet : ${game.id}.`);
  const moves = history.map((move) => move.san);
  if (moves.length !== game.plies || board.fen() !== game.finalFen)
    throw new Error(`Partie source incohérente : ${game.id}.`);
  if (new Set(game.selection.map((s) => s.ply)).size !== game.selection.length)
    throw new Error(`Sélection dupliquée : ${game.id}.`);
  return game.selection.map((selection) => {
    const index = selection.ply - 1;
    if (!Number.isInteger(index) || index < 0 || moves[index] !== selection.san)
      throw new Error(
        `Décision source incohérente : ${game.id}/${selection.ply}.`,
      );
    return {
      id: `${game.id}-${selection.ply}`,
      family: selection.family,
      origin: "published-game",
      fen: DEFAULT_POSITION,
      prefix: moves.slice(0, index),
      played: moves[index],
      line: moves.slice(index + 1, index + 9),
      expected: selection.expected,
      forbiddenClaims: [
        "best-move",
        "forced-loss",
        "winning-exchange-from-recapture",
        "material-only-judgment",
      ],
      notes: `${selection.reason} Source : ${game.source}. Suite jouée, sans score moteur.`,
    };
  });
}
export const externalCorpus = externalGames.flatMap(externalCasesFromGame);
export function externalCorpusReport() {
  const rows = evaluateCorpus(externalCorpus);
  return {
    ...corpusReport(rows),
    dataset: "published-games",
    provenance: {
      sourceGamesIndependentOfDetector: true,
      independentPedagogicalReview: false,
      representativeSample: false,
      selection: "fixed-before-prototype-measurement",
      continuation: "played-game-moves",
      games: externalGames.map((game) => ({
        id: game.id,
        source: game.source,
        selectedPlies: game.selection.map((s) => s.ply),
      })),
    },
    rows,
  };
}
