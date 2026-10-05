import { useEffect, useState } from "react";
import { inspectDevelopmentEngine } from "./engine/DevelopmentEngine";
import type { EngineOptions, EngineCapabilities } from "./engine/options";

export default function EngineSettings({
  options,
  onChange,
  engineId = "default",
  prefix = "engine",
  match = false,
}: {
  options: EngineOptions;
  onChange: (options: EngineOptions) => void;
  engineId?: string;
  prefix?: string;
  match?: boolean;
}) {
  const [capabilities, setCapabilities] = useState<EngineCapabilities | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCapabilities(null);
    setError("");
    void inspectDevelopmentEngine(controller.signal, engineId)
      .then((result) => {
        if (!controller.signal.aborted) setCapabilities(result.capabilities);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [attempt, engineId]);
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
      <label className="setting-switch">
        <input
          type="checkbox"
          name="ponder"
          checked={options.ponder}
          disabled={!capabilities?.ponder && !options.ponder}
          onChange={(event) =>
            onChange({ ...options, ponder: event.target.checked })
          }
        />
        <span className="switch-track" aria-hidden="true" />
        <span className="setting-copy">
          <strong>{match ? "Réfléchir pendant le tour adverse" : "Réfléchir pendant mon tour"}</strong>
          <span className="setting-help">
            {match ? "Ce moteur prépare sa réponse pendant la recherche de l’autre moteur." : "Le moteur prépare sa réponse pendant votre réflexion. Votre pendule continue normalement."}
          </span>
        </span>
      </label>
      {capabilities && !capabilities.ponder && (
        <p className="setting-help">Ce moteur ne propose pas cette option.</p>
      )}
      <div className="thread-setting">
        <div className="setting-copy">
          <label htmlFor={`${prefix}-threads`}>Cœurs de calcul</label>
          <p className="setting-help" id={`${prefix}-threads-help`}>
            {capabilities?.threads
              ? `Jusqu’à ${max} cœurs logiques. Plus de cœurs sollicite davantage le processeur.`
              : "Un seul cœur tant que le moteur n’annonce pas cette option."}
          </p>
        </div>
        <div className="number-stepper">
          <button
            type="button"
            aria-label="Utiliser un cœur de moins"
            disabled={
              !capabilities?.threads ||
              options.threads <= (capabilities.threads.min ?? 1)
            }
            onClick={() =>
              onChange({
                ...options,
                threads: Math.max(
                  capabilities?.threads?.min ?? 1,
                  options.threads - 1,
                ),
              })
            }
          >
            −
          </button>
          <input
            id={`${prefix}-threads`}
            type="number"
            name="engine-threads"
            aria-describedby={`${prefix}-threads-help`}
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
          <button
            type="button"
            aria-label="Utiliser un cœur de plus"
            disabled={!capabilities?.threads || options.threads >= max}
            onClick={() =>
              onChange({
                ...options,
                threads: Math.min(max, options.threads + 1),
              })
            }
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
