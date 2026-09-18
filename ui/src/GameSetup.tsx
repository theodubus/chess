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
  const [more, setMore] = useState(false);
  const [minutes, setMinutes] = useState(
    String(initial.timeControl.initialMs / 60000),
  );
  const [increment, setIncrement] = useState(
    String(initial.timeControl.incrementMs / 1000),
  );
  const displayError = setup.opponent === "engine" ? error : "";
  const valid = parseTimeControl(minutes, increment);
  const choose = (control: Setup["timeControl"]) => {
    setMinutes(String(control.initialMs / 60000));
    setIncrement(String(control.incrementMs / 1000));
  };
  return (
    <section className="setup-screen" aria-label="Préparer une partie">
      <div className="setup-intro">
        <p className="eyebrow">À votre rythme</p>
        <h1>Une nouvelle partie.</h1>
        <p>Choisissez votre adversaire et prenez place.</p>
      </div>
      <form
        className="setup-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) onStart({ ...setup, timeControl: valid });
        }}
      >
        <fieldset disabled={busy}>
          <legend>Votre adversaire</legend>
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
          </div>
        </fieldset>
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
        <fieldset disabled={busy}>
          <legend>
            Cadence{" "}
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
        {displayError && (
          <div className="connection-error" role="alert">
            <p>{displayError}</p>
            <details>
              <summary>Aide à la connexion</summary>
              <p>Dans le dossier ui, lancez le pont local :</p>
              <code>npm run engine:bridge -- ../target/release/shallowred</code>
              <p>Puis réessayez. Vos réglages sont conservés.</p>
            </details>
          </div>
        )}
        <button
          className="primary wide"
          disabled={busy || !valid}
          type="submit"
        >
          {busy
            ? "Préparation du moteur…"
            : displayError
              ? "Réessayer"
              : "Jouer"}
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
    </section>
  );
}
