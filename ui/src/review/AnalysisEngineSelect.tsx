import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ANALYSIS_ENGINE,
  listAnalysisEngines,
  addAnalysisEngine,
  type AnalysisEngineChoice,
} from "../engine/DevelopmentEngine";

export default function AnalysisEngineSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const [choices, setChoices] = useState<AnalysisEngineChoice[]>([
    DEFAULT_ANALYSIS_ENGINE,
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [added, setAdded] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void listAnalysisEngines()
      .then((engines) => {
        if (!cancelled) {
          setChoices(engines);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Liste indisponible. Vérifiez que le pont local est lancé avec la configuration des moteurs.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  return (
    <div className="analysis-engine-choice">
      <label>
        Moteur d’analyse
        <select
          name="analysis-engine"
          value={value}
          disabled={disabled || loading}
          onChange={(event) => onChange(event.target.value)}
        >
          {!choices.some((choice) => choice.id === value) && (
            <option value={value}>
              Moteur mémorisé ({value}) · indisponible
            </option>
          )}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="hint" role="status">
          {error}
        </p>
      )}
      <details>
        <summary>Ajouter un moteur local</summary>
        <form
          className="add-engine-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setAdding(true);
            setAddError("");
            setAdded("");
            try {
              const engine = await addAnalysisEngine(path.trim());
              if (!mounted.current) return;
              setChoices((previous) => [
                ...previous.filter((item) => item.id !== engine.id),
                engine,
              ]);
              onChange(engine.id);
              setAdded(`${engine.label} est prêt pour l’analyse.`);
              setPath("");
            } catch (error) {
              if (!mounted.current) return;
              setAddError(
                error instanceof Error ? error.message : "Moteur refusé.",
              );
            } finally {
              if (mounted.current) setAdding(false);
            }
          }}
        >
          <label>
            Chemin du binaire
            <input
              name="engine-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/chemin/vers/stockfish"
              required
              disabled={disabled || adding}
            />
          </label>
          <p className="hint">
            Choisissez un binaire local de confiance : le test exécute ce
            programme. Son nom, ses réponses UCI, ses évaluations et la légalité
            de ses coups seront vérifiés avant l’ajout.
          </p>
          <button type="submit" disabled={disabled || adding || !path.trim()}>
            {adding ? "Vérification du moteur…" : "Vérifier et ajouter"}
          </button>
          {adding && (
            <p role="status" className="hint">
              Connexion et recherches de test en cours…
            </p>
          )}
          {addError && (
            <p role="alert" className="connection-error">
              {addError}
            </p>
          )}
          {added && (
            <p role="status" className="hint">
              {added}
            </p>
          )}
        </form>
      </details>
      <button
        className="text-button"
        aria-busy={loading}
        disabled={loading || disabled}
        onClick={() => {
          setLoading(true);
          setRefresh((value) => value + 1);
        }}
      >
        {loading ? "Recherche des moteurs…" : "Actualiser les moteurs"}
      </button>
    </div>
  );
}
