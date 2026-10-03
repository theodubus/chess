import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext } from "./context";
import { tacticalConstraints } from "./constraints";
import { externalCorpus } from "./externalCorpus";

/** Régressions de développement, pas un échantillon de validation indépendant.
 * Chaque position et chaque suite a été exécutée avec chess.js. */
const constructed = (id: string, fen: string, played: string, line: string[]): CorpusCase => ({
  id, fen, played, line, prefix: [], family: "tactical-comparison", origin: "constructed",
  notes: "Fixture logicielle, sans validation pédagogique indépendante.", expected: {}, forbiddenClaims: ["forced-loss", "best-move"],
});
export const tacticalCases: { test: CorpusCase; alternative: string; alternativeLine: string[]; kind: "double-threat" | "pin" }[] = [
  { test: constructed("fork-direct", "r3k3/8/8/3N4/8/8/7P/7K w - - 0 1", "Nc7+", ["Kd7", "Nxa8"]), alternative: "d5b6", alternativeLine: ["Rb8"], kind: "double-threat" },
  { test: constructed("fork-black", "7k/7p/8/8/3n4/8/8/R3K3 b - - 0 1", "Nc2+", ["Kd2", "Nxa1"]), alternative: "d4b3", alternativeLine: ["Rb1"], kind: "double-threat" },
  { test: constructed("pin-retreat", "4k3/pp2pppp/2n5/3P4/8/8/PPP2PPP/5B1K w - - 0 1", "Bb5", ["Kd7", "dxc6+", "bxc6", "Be2"]), alternative: "f1d3", alternativeLine: ["Nb4"], kind: "pin" },
  { test: constructed("pin-defence-changed", "8/3kp3/2n5/3P4/8/8/7P/5B1K w - - 0 1", "Bb5", ["e6", "dxc6+", "Ke7"]), alternative: "f1d3", alternativeLine: ["Nb4"], kind: "pin" },
  { test: { ...externalCorpus.find((c) => c.id === "byrne-22")!, line: ["Qa3", "Nxc3", "bxc3", "Nxe4", "Bf4"] }, alternative: "b6d7", alternativeLine: ["Qa3"], kind: "double-threat" },
  { test: { ...externalCorpus.find((c) => c.id === "byrne-22")!, id: "byrne-allows-fork", prefix: externalCorpus.find((c) => c.id === "byrne-22")!.prefix.slice(0, -1), played: "Bg5", line: ["Na4", "Qa3", "Nxc3", "bxc3", "Nxe4", "Bf4"] }, alternative: "c5b4", alternativeLine: ["a5"], kind: "double-threat" },
];

export function tacticalInput(id: string) {
  const example = tacticalCases.find((c) => c.test.id === id);
  if (!example) throw new Error("Cas tactique absent.");
  const { position, result } = corpusInput(example.test);
  const context = decisionContext(position, result), constraints = tacticalConstraints(context);
  const hypothesisIndex = constraints.hypotheses.findIndex((h) => h.kind === example.kind);
  if (hypothesisIndex < 0) throw new Error("Contrainte attendue absente.");
  return { example, understanding: { context, constraints }, hypothesisIndex, alternative: example.alternative };
}
