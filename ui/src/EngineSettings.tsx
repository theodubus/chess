import { useEffect, useState } from "react";
import { inspectDevelopmentEngine } from "./engine/DevelopmentEngine";
import type { EngineOptions, EngineCapabilities } from "./engine/options";

export default function EngineSettings({
  options,
  onChange,
}: {
  options: EngineOptions;
  onChange: (options: EngineOptions) => void;
}) {
  const [capabilities, setCapabilities] = useState<EngineCapabilities | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void inspectDevelopmentEngine(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCapabilities(result.capabilities);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [attempt]);
  const cores = Math.max(1, navigator.hardwareConcurrency || 1);
  const max = Math.min(cores, capabilities?.threads?.max ?? 1);
  return (
    <div className="engine-settings-body">
      {!capabilities && !error && (
        <p role="status">Vérification des options du moteur…</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError("");
              setAttempt(attempt + 1);
            }}
          >
            Revérifier le moteur
          </button>
        </div>
      )}
      <label className="engine-ponder-toggle">
        <input
          type="checkbox"
          name="ponder"
          checked={options.ponder}
          disabled={!capabilities?.ponder && !options.ponder}
          onChange={(event) =>
            onChange({ ...options, ponder: event.target.checked })
          }
        />
        Réfléchir pendant mon tour
      </label>
      <p className="setting-help">
        Le moteur prépare sa réponse pendant votre réflexion. Votre pendule
        continue normalement.
      </p>
      {capabilities && !capabilities.ponder && (
        <p className="setting-help">Ce moteur ne propose pas cette option.</p>
      )}
      <label>
        Cœurs de calcul
        <input
          type="number"
          name="engine-threads"
          min={capabilities?.threads?.min ?? 1}
          max={max}
          step="1"
          required
          disabled={
            !capabilities || (!capabilities.threads && options.threads === 1)
          }
          value={options.threads}
          onChange={(event) =>
            onChange({ ...options, threads: Number(event.target.value) })
          }
        />
      </label>
      <p className="setting-help">
        {capabilities?.threads
          ? `De ${capabilities.threads.min} à ${max} cœurs logiques sur cet appareil. Plus de cœurs sollicite davantage le processeur.`
          : "Un seul cœur tant que le moteur n’annonce pas cette option."}
      </p>
    </div>
  );
}
