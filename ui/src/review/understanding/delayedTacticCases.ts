import { corpusInput } from "./corpus";
import { decisionContext } from "./context";

/** Petites contre-épreuves du modèle, exécutées avec chess.js avant ajout.
 * Ces suites choisies ne constituent ni meilleure défense ni validation indépendante. */
export const delayedTacticCases = [
  { id: "delayed-fork", fen: "6rk/7p/8/4n3/4b3/8/7P/R1K5 w - - 0 1", played: "Ra3",
    line: ["Rg1+", "Kd2", "Nc4+", "Kc3", "Nxa3"], alternative: "a1a2" },
  { id: "delayed-fork-black", fen: "5k1r/p7/8/3B4/3N4/8/P7/KR6 b - - 0 1", played: "Rh6",
    line: ["Rb8+", "Ke7", "Nf5+", "Kf6", "Nxh6"], alternative: "h8h7" },
  { id: "checking-preparation", fen: "6rk/7p/8/4n3/4b3/R7/7P/2K5 b - - 0 1", played: "Rg1+",
    line: ["Kd2", "Nc4+", "Kc3", "Nxa3"] },
  { id: "intermediate-error", fen: "6rk/7p/8/4n3/4b3/8/7P/R1K5 w - - 0 1", played: "h3",
    line: ["h6", "Ra3", "Rg1+", "Kd2", "Nc4+", "Kc3", "Nxa3"], alternative: "h2h4" },
  { id: "unrelated-decision", fen: "6rk/7p/8/4n3/4b3/R7/7P/2K5 w - - 0 1", played: "h3",
    line: ["Rg1+", "Kd2", "Nc4+", "Kc3", "Nxa3"], alternative: "h2h4" },
  { id: "compensated-fork", fen: "6rk/7p/8/4n3/4b3/8/1B5P/2K5 w - - 0 1", played: "Ba3",
    line: ["Rg1+", "Kb2", "Nc4+", "Kb3", "Nxa3", "Kxa3"] },
  { id: "delayed-pin", fen: "5b1k/7p/8/8/8/2N5/7P/5K2 w - - 0 1", played: "Ke1",
    line: ["Bd6", "h3", "Bb4", "h4", "Bxc3+", "Kf2"], alternative: "f1f2" },
  { id: "existing-pin", fen: "7k/7p/8/8/1b6/2N5/7P/4K3 w - - 0 1", played: "h3", line: ["Kg7", "h4"] },
];
export function delayedTacticInput(id: string) {
  const test = delayedTacticCases.find(c => c.id === id);
  if (!test) throw new Error("Contre-épreuve différée absente.");
  const input = corpusInput({ ...test, prefix: [], family: "delayed-tactics", origin: "constructed", notes: "Suite logicielle conditionnelle.",
    expected: {}, forbiddenClaims: ["forced-loss", "best-move", "verified-cause"] });
  return { ...input, context: decisionContext(input.position, input.result), test };
}
