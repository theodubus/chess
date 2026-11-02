import { useEffect, useState } from "react";
import { inspectDevelopmentEngine } from "./engine/DevelopmentEngine";
import type { EngineCapabilities } from "./engine/options";

export type EngineInspection = {
  name: string;
  capabilities: EngineCapabilities | null;
  error: string;
  retry: () => void;
};

/**
 * Ce que le moteur annonce — son nom, `Ponder`, `Threads` —, lu par une
 * connexion courte. Remonté ici pour que l'écran de préparation le
 * partage entre la case du moteur et les profils, qui en tirent le vrai
 * nombre de cœurs. `enabled` faux : aucune connexion, rien n'est lu.
 */
export function useEngineInspection(engineId: string, enabled: boolean): EngineInspection {
  const [result, setResult] = useState<{ name: string; capabilities: EngineCapabilities | null; error: string }>({
    name: "",
    capabilities: null,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setResult({ name: "", capabilities: null, error: "" });
    void inspectDevelopmentEngine(controller.signal, engineId)
      .then(({ name, capabilities }) => {
        if (!controller.signal.aborted) setResult({ name, capabilities, error: "" });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setResult({ name: "", capabilities: null, error: error.message });
      });
    return () => controller.abort();
  }, [attempt, engineId, enabled]);
  return { ...result, retry: () => setAttempt((value) => value + 1) };
}
