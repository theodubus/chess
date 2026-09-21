import book from "./opening-book.json";
import type { ReviewPosition } from "./model";

const entries: Readonly<Record<string, string>> = book;
export function isBookMove(position: ReviewPosition): boolean {
  if (!position.played || Number(position.fen.split(" ")[5]) > 20) return false;
  // Les compteurs ne changent pas les coups disponibles ; les roques et l'EP, si.
  const key = position.fen.split(" ").slice(0, 4).join(" ");
  return entries[key]?.split(" ").includes(position.played) ?? false;
}
