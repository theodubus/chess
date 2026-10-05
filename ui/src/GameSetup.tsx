import ArmyEditor from "./ArmyEditor";
import EngineSettings from "./EngineSettings";
import AnalysisEngineSelect from "./review/AnalysisEngineSelect";
import { DEFAULT_ENGINE_OPTIONS } from "./engine/options";
import { useState } from "react";
import { parseTimeControl, TIME_CONTROLS } from "./GameClock";
import type { GameSetup as Setup } from "./preferences";
export default function GameSetup({
  initial,
  busy,
  error,
  onStart,
  onCancel,
  onReturn,
}: {
  initial: Setup;
  busy: boolean;
  error: string;
  onStart: (setup: Setup) => void;
  onCancel: () => void;
  onReturn?: () => void;
}) {
  const [setup, setSetup] = useState(initial);
  const [editingArmy, setEditingArmy] = useState(false);
  const [engineSettings, setEngineSettings] = useState(false);
  const [separate, setSeparate] = useState(initial.engineTimeControl !== null);
  const [engineMinutes, setEngineMinutes] = useState(
    String(
      (initial.engineTimeControl ?? initial.timeControl).initialMs / 60000,
    ),
  );
  const [engineIncrement, setEngineIncrement] = useState(
    String(
      (initial.engineTimeControl ?? initial.timeControl).incrementMs / 1000,
    ),
  );
  const [more, setMore] = useState(false);
  const [minutes, setMinutes] = useState(
    String(initial.timeControl.initialMs / 60000),
  );
  const [increment, setIncrement] = useState(
    String(initial.timeControl.incrementMs / 1000),
  );
  const displayError = setup.opponent !== "human" ? error : "";
  const valid = parseTimeControl(minutes, increment);
  const engineControl = parseTimeControl(engineMinutes, engineIncrement);
  const validClocks =
    valid && (setup.opponent === "human" || !separate || engineControl) &&
    (setup.opponent !== "match" || Object.values(setup.matchEngines).every(player =>
      Number.isSafeInteger(player.options.threads) &&
      player.options.threads >= 1 && player.options.threads <= 1024,
    ));
  const choose = (control: Setup["timeControl"]) => {
    setMinutes(String(control.initialMs / 60000));
    setIncrement(String(control.incrementMs / 1000));
  };
  return (
    <section className="setup-screen" aria-label="Préparer une partie">
      <div className="setup-intro">
        <p className="eyebrow">À votre rythme</p>
        <h1>Une nouvelle partie.</h1>
        <p>{setup.opponent === "match" ? "Choisissez les deux moteurs et observez leur partie." : "Choisissez votre adversaire et prenez place."}</p>
      </div>
      <div className="setup-card">
        <fieldset disabled={busy}>
          <legend>Mode de jeu</legend>
          <div className="choice-row">
            <button
              type="button"
              className="choice"
              aria-pressed={setup.opponent === "engine"}
              onClick={() => setSetup({ ...setup, opponent: "engine" })}
            >
              <strong>♞ Moteur local</strong>
              <small>Affrontez ShallowRed</small>
            </button>
            <button
              type="button"
              className="choice"
              aria-pressed={setup.opponent === "human"}
              onClick={() => setSetup({ ...setup, opponent: "human" })}
            >
              <strong>♙ Deux joueurs</strong>
              <small>Sur cet appareil</small>
            </button>
            <button
              type="button" className="choice"
              aria-pressed={setup.opponent === "match"}
              onClick={() => setSetup({ ...setup, opponent: "match" })}
            >
              <strong>♞ Deux moteurs</strong>
              <small>Moteur contre moteur</small>
            </button>
          </div>
        </fieldset>
        {setup.opponent === "match" && (["w", "b"] as const).map(color => (
          <MatchEngineSetup key={color}
            color={color} player={setup.matchEngines[color]} disabled={busy}
            onChange={player => setSetup(current => ({
              ...current,
              matchEngines: { ...current.matchEngines, [color]: player },
            }))}
          />
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && validClocks && !busy)
              onStart({ ...setup, timeControl: valid, engineTimeControl: separate ? engineControl : null });
          }}
        >
        {setup.opponent === "engine" && (
          <fieldset disabled={busy}>
            <legend>Votre camp</legend>
            <div className="choice-row">
              {(
                [
                  ["w", "Blancs"],
                  ["b", "Noirs"],
                  ["random", "Aléatoire"],
                ] as const
              ).map(([side, label]) => (
                <button
                  type="button"
                  className="choice"
                  aria-pressed={setup.side === side}
                  key={side}
                  onClick={() => setSetup({ ...setup, side })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {setup.opponent === "engine" && (
          <fieldset disabled={busy}>
            <legend>Camp du moteur</legend>
            <div className="army-summary">
              <div>
                <strong>
                  {setup.handicap
                    ? "Position personnalisée"
                    : "Position classique"}
                </strong>
                <p className="setting-help">
                  {setup.handicap
                    ? "Votre configuration est prête à jouer."
                    : "Choisissez les pièces et leur disposition."}
                </p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingArmy(true)}
              >
                Éditer le camp
              </button>
            </div>
            {setup.handicap && (
              <button
                type="button"
                className="text-button"
                onClick={() => setSetup({ ...setup, handicap: null })}
              >
                Revenir à la position classique
              </button>
            )}
          </fieldset>
        )}
        <fieldset disabled={busy}>
          <legend>
            {setup.opponent === "match" ? separate ? "Cadence des Blancs" : "Cadence commune"
              : separate && setup.opponent === "engine" ? "Votre cadence" : "Cadence"}{" "}
            <span>
              {minutes} min + {increment} s
            </span>
          </legend>
          <div className="choice-row">
            {[TIME_CONTROLS[2], TIME_CONTROLS[5], TIME_CONTROLS[6]].map(
              (control) => (
                <button
                  type="button"
                  className="choice"
                  key={control.label}
                  aria-pressed={
                    valid?.initialMs === control.initialMs &&
                    valid?.incrementMs === control.incrementMs
                  }
                  onClick={() => choose(control)}
                >
                  {control.label}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className="text-button"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            Autres cadences {more ? "−" : "+"}
          </button>
          {more && (
            <div className="custom-controls">
              <label>
                Préréglage
                <select
                  value=""
                  onChange={(event) =>
                    choose(TIME_CONTROLS[Number(event.target.value)])
                  }
                >
                  <option value="" disabled>
                    Choisir une cadence
                  </option>
                  {TIME_CONTROLS.map((control, index) => (
                    <option key={control.label} value={index}>
                      {control.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="choice-row">
                <label>
                  Minutes
                  <input
                    type="number"
                    min="0.5"
                    max="180"
                    step="0.5"
                    required
                    value={minutes}
                    onChange={(event) => setMinutes(event.target.value)}
                  />
                </label>
                <label>
                  Incrément (secondes)
                  <input
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    required
                    value={increment}
                    onChange={(event) => setIncrement(event.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
        </fieldset>
        {setup.opponent !== "human" && (
          <>
            <fieldset disabled={busy} className="asymmetric-controls">
              <legend>{setup.opponent === "match" ? "Temps des Noirs" : "Temps du moteur"}</legend>
              <label className="setting-switch">
                <input
                  type="checkbox"
                  name="separate-clock"
                  checked={separate}
                  onChange={(event) => {
                    setSeparate(event.target.checked);
                    if (event.target.checked) {
                      setEngineMinutes(minutes);
                      setEngineIncrement(increment);
                    }
                  }}
                />
                <span className="switch-track" aria-hidden="true" />
                <span className="setting-copy">
                  <strong>{setup.opponent === "match" ? "Cadence différente pour les Noirs" : "Donner une cadence différente au bot"}</strong>
                </span>
              </label>
              {separate && (
                <div className="choice-row custom-controls">
                  <label>
                    {setup.opponent === "match" ? "Minutes des Noirs" : "Minutes du bot"}
                    <input
                      name="engine-minutes"
                      type="number"
                      min="0.5"
                      max="180"
                      step="0.5"
                      required
                      value={engineMinutes}
                      onChange={(event) => setEngineMinutes(event.target.value)}
                    />
                  </label>
                  <label>
                    {setup.opponent === "match" ? "Incrément des Noirs (secondes)" : "Incrément du bot (secondes)"}
                    <input
                      name="engine-increment"
                      type="number"
                      min="0"
                      max="60"
                      step="1"
                      required
                      value={engineIncrement}
                      onChange={(event) =>
                        setEngineIncrement(event.target.value)
                      }
                    />
                  </label>
                </div>
              )}
            </fieldset>
            {setup.opponent === "engine" && <fieldset disabled={busy}>
              <details
                className="engine-settings"
                open={engineSettings}
                onToggle={(event) =>
                  setEngineSettings(event.currentTarget.open)
                }
              >
                <summary>Options du moteur</summary>
                {engineSettings && (
                  <EngineSettings
                    options={setup.engineOptions}
                    onChange={(engineOptions) =>
                      setSetup({ ...setup, engineOptions })
                    }
                  />
                )}
              </details>
            </fieldset>}
          </>
        )}
        {displayError && (
          <div className="connection-error" role="alert">
            <p>{displayError}</p>
            <details>
              <summary>Aide à la connexion</summary>
              <p>Depuis la racine du dépôt, lancez l’application complète :</p>
              <code>npm --prefix ui run dev</code>
              <p>Puis réessayez. Vos réglages sont conservés.</p>
            </details>
          </div>
        )}
        <button
          className="primary wide"
          disabled={busy || !validClocks}
          type="submit"
        >
          {busy
            ? setup.opponent === "match" ? "Préparation des moteurs…" : "Préparation du moteur…"
            : displayError
              ? "Réessayer"
              : setup.opponent === "match" ? "Lancer le match" : "Jouer"}
        </button>
        {busy && (
          <button type="button" className="secondary wide" onClick={onCancel}>
            Annuler la connexion
          </button>
        )}
        {!busy && onReturn && (
          <button type="button" className="text-button wide" onClick={onReturn}>
            Revenir à la partie précédente
          </button>
        )}
      </form>
      </div>
      {editingArmy && (
        <ArmyEditor
          initial={setup.handicap}
          humanSide={setup.side === "b" ? "b" : "w"}
          onClose={() => setEditingArmy(false)}
          onSave={(handicap) => {
            setSetup({ ...setup, handicap });
            setEditingArmy(false);
          }}
        />
      )}
    </section>
  );
}

function MatchEngineSetup({ color, player, disabled, onChange }: {
  color: "w" | "b";
  player: Setup["matchEngines"]["w"];
  disabled: boolean;
  onChange: (player: Setup["matchEngines"]["w"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const side = color === "w" ? "Blancs" : "Noirs";
  return (
    <fieldset disabled={disabled} className="match-engine-setup">
      <AnalysisEngineSelect value={player.id} disabled={disabled} label={`Moteur des ${side}`}
        onChange={id => onChange({
          id, options: id === player.id ? player.options : DEFAULT_ENGINE_OPTIONS,
        })}
      />
      <details className="engine-settings" open={open}
        onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>Options des {side}</summary>
        {open && <EngineSettings engineId={player.id} prefix={`match-${color}`} match
          options={player.options}
          onChange={options => onChange({ ...player, options })}
        />}
      </details>
    </fieldset>
  );
}
