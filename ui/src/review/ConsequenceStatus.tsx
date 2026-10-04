import type { ConsequenceState } from "./usePedagogicalAnalysis";

export default function ConsequenceStatus({ state, fallback }: { state: ConsequenceState; fallback: string }) {
  if (state === "supported" || state === "idle") return null;
  if (["pending", "extracting", "verifying"].includes(state)) return (
    <p className="cause-progress" role="status" aria-live="polite">
      <span className="analysis-spinner" aria-hidden="true" />{" "}
      {state === "verifying"
        ? "Le moteur vérifie la menace, les reprises et les compensations…"
        : "Recherche de ce que ce coup permet à l’adversaire…"}
      {" "}Vous pouvez continuer à parcourir la partie.
    </p>
  );
  return <p className="hint" role="status">{state === "unavailable"
    ? "La vérification n’a pas abouti. Vous pouvez approfondir ce coup."
    : fallback}</p>;
}
