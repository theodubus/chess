import { Chess } from "chess.js";

export const MAX_PGN_BYTES = 1024 * 1024;

/** Normaliser une seule partie avant de remplacer la revue courante. */
export function importPgn(text: string) {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) throw new Error("Collez un PGN ou choisissez un fichier .pgn.");
  if (new TextEncoder().encode(source).length > MAX_PGN_BYTES)
    throw new Error("Le PGN est trop volumineux (maximum 1 Mo).");
  const game = new Chess();
  try {
    game.loadPgn(source);
  } catch {
    throw new Error(
      "PGN invalide : vérifiez les coups et la position initiale. Importez une seule partie à la fois.",
    );
  }
  const variant = game.getHeaders().Variant;
  const initial = new Chess(game.getHeaders().FEN);
  const previousKing = initial
    .board()
    .flat()
    .find((piece) => piece?.type === "k" && piece.color !== initial.turn());
  // chess.js valide la structure de la FEN, mais accepte un roi adverse déjà
  // attaqué alors que ce camp vient de jouer : cette position est incohérente.
  if (previousKing && initial.isAttacked(previousKing.square, initial.turn()))
    throw new Error(
      "Position FEN incohérente : le roi du camp qui n’a pas le trait est en échec.",
    );
  if (
    variant &&
    !["standard", "chess", "normal"].includes(variant.toLowerCase())
  )
    throw new Error(
      "Seules les parties d’échecs classiques sont prises en charge.",
    );
  const count = game.history().length;
  if (!count) throw new Error("Le PGN ne contient aucun coup à analyser.");
  if (count > 2000)
    throw new Error("Cette partie dépasse la limite de 2 000 demi-coups.");
  return game.pgn();
}
