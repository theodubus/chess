import entries from "./mechanismCases.json";
import { corpusInput, type CorpusCase } from "./corpus";
import { understandDecision } from "./prototype";
export const mechanismCases = entries;
export function mechanismInput(test: (typeof entries)[number]) {
  const input = corpusInput({
    ...test,
    prefix: [],
    family: "mechanism",
    notes: "Cas de développement construit",
    expected: {},
    forbiddenClaims: [],
  } as CorpusCase);
  const understanding = understandDecision(input.position, input.result);
  const mechanismIndex = understanding.mechanisms.findIndex(
    (h) => h.kind === test.kind && h.capture === test.capture,
  );
  return { understanding, mechanismIndex };
}
