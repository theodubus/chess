import { TRANSPORT_LIMITATIONS } from "./engine/DevelopmentEngine";
import type { EngineOptions } from "./engine/options";
import type { EngineInspection } from "./useEngineInspection";
import { logicalCores, threadAdvice } from "./engine/threadAdvice";

/** Cœurs et ponder d'un moteur, sur trois lignes : la case du moteur les montre sans menu à déplier. */
export default function EngineSettings({
  options,
  onChange,
  inspection,
  prefix = "engine",
  match = false,
  opponentOptions,
}: {
  options: EngineOptions;
  onChange: (options: EngineOptions) => void;
  inspection: EngineInspection;
  prefix?: string;
  match?: boolean;
  opponentOptions?: EngineOptions;
}) {
  const { capabilities, error } = inspection;
  const cores = logicalCores(navigator.hardwareConcurrency);
  const max = Math.min(cores, capabilities?.threads?.max ?? 1);
  const advice = threadAdvice(cores, options, opponentOptions);
  const recommended = Math.max(capabilities?.threads?.min ?? 1, Math.min(advice.limit, max));
  // L'explication du conseil, au survol : la ligne reste courte.
  const reason = `${advice.detected} cœur${advice.detected > 1 ? "s" : ""} logique${advice.detected > 1 ? "s" : ""} annoncé${advice.detected > 1 ? "s" : ""} par le navigateur, un gardé pour l’interface.${
    opponentOptions
      ? advice.shared
        ? ` Avec le ponder, les deux moteurs calculent en même temps et se partagent le reste.`
        : " Sans ponder, les recherches alternent : chaque moteur peut utiliser le même budget."
      : ""
  }`;
  return (
    <div className="engine-settings-body">
      {!capabilities && !error && (
        <p className="setting-help" role="status">Vérification des options du moteur…</p>
      )}
      {error && (
        <div className="setting-help" role="alert">
          <p>{error}</p>
          <button type="button" className="text-button" onClick={inspection.retry}>
            Revérifier le moteur
          </button>
        </div>
      )}
      <div className="setting-line">
        <label htmlFor={`${prefix}-threads`}>Cœurs de calcul</label>
        <div className="number-stepper">
          <button
            type="button"
            aria-label="Utiliser un cœur de moins"
            disabled={!capabilities?.threads || options.threads <= (capabilities.threads.min ?? 1)}
            onClick={() =>
              onChange({ ...options, threads: Math.max(capabilities?.threads?.min ?? 1, options.threads - 1) })
            }
          >
            −
          </button>
          <input
            id={`${prefix}-threads`}
            type="number"
            name="engine-threads"
            aria-describedby={`${prefix}-thread-advice`}
            min={capabilities?.threads?.min ?? 1}
            max={max}
            step="1"
            required
            disabled={!capabilities || (!capabilities.threads && options.threads === 1)}
            value={options.threads}
            onChange={(event) => onChange({ ...options, threads: Number(event.target.value) })}
          />
          <button
            type="button"
            aria-label="Utiliser un cœur de plus"
            disabled={!capabilities?.threads || options.threads >= max}
            onClick={() => onChange({ ...options, threads: Math.min(max, options.threads + 1) })}
          >
            +
          </button>
        </div>
      </div>
      {capabilities?.threads ? (
        <p className="advice-line" id={`${prefix}-thread-advice`} title={reason}>
          Conseil : {recommended} cœur{recommended > 1 ? "s" : ""} ·{" "}
          <button
            type="button"
            className="text-button"
            disabled={options.threads === recommended}
            onClick={() => onChange({ ...options, threads: recommended })}
          >
            appliquer
          </button>
        </p>
      ) : (
        <p className="setting-help" id={`${prefix}-thread-advice`}>
          {TRANSPORT_LIMITATIONS?.threads ?? "Un seul cœur tant que le moteur n’annonce pas cette option."}
        </p>
      )}
      <label className="setting-switch setting-line trailing">
        <span className="setting-copy">
          <strong>Ponder</strong>
          <span className="setting-help">
            {match ? "Réfléchit pendant le tour adverse" : "Réfléchit pendant votre tour"}
          </span>
        </span>
        <input
          type="checkbox"
          name="ponder"
          checked={options.ponder}
          disabled={!capabilities?.ponder && !options.ponder}
          onChange={(event) => onChange({ ...options, ponder: event.target.checked })}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      {capabilities && !capabilities.ponder && (
        <p className="setting-help">
          {TRANSPORT_LIMITATIONS?.ponder ?? "Ce moteur ne propose pas cette option."}
        </p>
      )}
      {capabilities?.ponder && TRANSPORT_LIMITATIONS?.ponderNote && (
        <p className="setting-help">{TRANSPORT_LIMITATIONS.ponderNote}</p>
      )}
    </div>
  );
}
