import ArmyEditor from "./ArmyEditor";
import EngineSettings from "./EngineSettings";
import { useEngineInspection, type EngineInspection } from "./useEngineInspection";
import AnalysisEngineSelect from "./review/AnalysisEngineSelect";
import { DEFAULT_ENGINE_OPTIONS } from "./engine/options";
import type { EngineOptions } from "./engine/options";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  describeTimeControl,
  formatTime,
  parseTimeControl,
  sameTimeControl,
  timeControlFromParts,
  TIME_CONTROLS,
  type TimeControl,
} from "./GameClock";
import type { GameSetup as Setup } from "./preferences";
import { localArmies, localArmiesError, matchArmyError } from "./handicap";
import { logicalCores } from "./engine/threadAdvice";
import {
  PROFILES,
  applyProfile,
  describeProfile,
  profileMatches,
  profileThreads,
  threadLimit,
  type Profile,
} from "./profiles";
import type { Side } from "./engine/analysis";

/** Les cadences toutes prêtes ; la carte « Personnalisée » couvre le reste. */
const PRESETS = ["1 min", "3 min", "5 min + 3 s", "10 min"].map(
  (label) => TIME_CONTROLS.find((control) => control.label === label)!,
);

/**
 * L'écran de préparation, à plat (Théo, 2 nov. 2026) : plus aucun menu à
 * déplier pour la cadence, les cœurs ou le ponder. Deux cases côte à côte —
 * vous et le moteur, les Blancs et les Noirs — portent chacune son temps et,
 * pour un moteur, ses réglages ; pour un humain, ses retours en arrière.
 */
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
  const [editingArmy, setEditingArmy] = useState<"engine" | "player" | Side | null>(null);
  const [positionOpen, setPositionOpen] = useState(false);
  const [custom, setCustom] = useState(() => draftOf(initial.timeControl));
  const mode = setup.opponent;
  const local = useEngineInspection("default", mode === "engine");
  const white = useEngineInspection(setup.matchEngines.w.id, mode === "match");
  const black = useEngineInspection(setup.matchEngines.b.id, mode === "match");
  const cores = logicalCores(navigator.hardwareConcurrency);
  const limits = {
    engine: threadLimit(cores, local.capabilities),
    w: threadLimit(cores, white.capabilities),
    b: threadLimit(cores, black.capabilities),
  };
  const displayError = mode !== "human" ? error : "";
  const armies = mode === "match" ? setup.matchArmies : setup.humanArmies;
  // Face au moteur, la couleur n'est connue qu'au lancement : l'éditeur
  // montre la vôtre, ou les Blancs avant un tirage au sort.
  const humanColor: Side = setup.side === "b" ? "b" : "w";
  const positionError =
    mode === "engine"
      ? localArmiesError(setup.handicap, setup.playerArmy)
      : matchArmyError(armies);
  const customPosition =
    mode === "engine" ? !!(setup.handicap || setup.playerArmy) : !!(armies.w || armies.b);
  const valid =
    (mode !== "match" ||
      Object.values(setup.matchEngines).every(
        (player) =>
          Number.isSafeInteger(player.options.threads) &&
          player.options.threads >= 1 &&
          player.options.threads <= 1024,
      )) &&
    !positionError;
  const second = setup.engineTimeControl ?? setup.timeControl;
  const symmetric = sameTimeControl(second, setup.timeControl);

  // Les cadences et la carte personnalisée règlent les deux camps ensemble.
  function chooseBoth(control: TimeControl) {
    setSetup((current) => ({ ...current, timeControl: control, engineTimeControl: null }));
  }
  // « modifier » ne change que son camp : l'autre garde son temps.
  function chooseFirst(control: TimeControl) {
    setSetup((current) => {
      const other = current.engineTimeControl ?? current.timeControl;
      return {
        ...current,
        timeControl: control,
        engineTimeControl: sameTimeControl(other, control) ? null : other,
      };
    });
  }
  function chooseSecond(control: TimeControl) {
    setSetup((current) => ({
      ...current,
      engineTimeControl: sameTimeControl(control, current.timeControl) ? null : control,
    }));
  }
  function applyChosenProfile(profile: Profile) {
    setSetup((current) => applyProfile(current, profile, cores, limits));
    setCustom(draftOf(profile.time));
  }
  const matchOptions = (side: Side, options: EngineOptions) =>
    setSetup((current) => ({
      ...current,
      matchEngines: { ...current.matchEngines, [side]: { ...current.matchEngines[side], options } },
    }));
  const profiles = PROFILES.filter((profile) => profile.opponent === mode);
  const sameAs = mode === "engine" ? "vous" : "les Blancs";
  const reset = symmetric
    ? undefined
    : { label: `Remettre le même temps que ${sameAs}`, onReset: () => chooseSecond(setup.timeControl) };

  return (
    <section className="setup-screen" aria-label="Préparer une partie">
      <div className="setup-intro">
        <p className="eyebrow">À votre rythme</p>
        <h1>Une nouvelle partie.</h1>
        <p>
          {mode === "match"
            ? "Choisissez les deux moteurs et observez leur partie."
            : "Choisissez votre adversaire et prenez place."}
        </p>
      </div>
      <div className="setup-card">
        {/* Le formulaire ne porte que le lancement : les cases des moteurs
            contiennent le formulaire d'ajout d'un moteur, et un formulaire
            ne s'imbrique pas dans un autre. */}
        <fieldset disabled={busy}>
            <legend>Mode de jeu</legend>
            <div className="choice-row">
              {(
                [
                  ["engine", "♞ Moteur local", "Affrontez ShallowRed"],
                  ["human", "♙ Deux joueurs", "Sur cet appareil"],
                  ["match", "♞ Deux moteurs", "Moteur contre moteur"],
                ] as const
              ).map(([opponent, title, help]) => (
                <button
                  type="button"
                  className="choice"
                  key={opponent}
                  aria-pressed={mode === opponent}
                  onClick={() => setSetup({ ...setup, opponent })}
                >
                  <strong>{title}</strong>
                  <small>{help}</small>
                </button>
              ))}
            </div>
          </fieldset>
          {profiles.length > 0 && (
            <fieldset disabled={busy}>
              <legend>Profils</legend>
              <div className="card-grid profile-grid">
                {profiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    active={profileMatches(setup, profile, cores, limits)}
                    threads={profileThreads(
                      profile,
                      cores,
                      mode === "engine" ? limits.engine : Math.min(limits.w, limits.b),
                    )}
                    onChoose={() => applyChosenProfile(profile)}
                  />
                ))}
              </div>
            </fieldset>
          )}
          {mode === "engine" && (
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
            <legend>Cadence</legend>
            <div className="card-grid cadence-grid">
              {PRESETS.map((control) => (
                <button
                  type="button"
                  className="choice"
                  key={control.label}
                  aria-pressed={symmetric && sameTimeControl(control, setup.timeControl)}
                  onClick={() => {
                    chooseBoth(control);
                    setCustom(draftOf(control));
                  }}
                >
                  {control.label}
                </button>
              ))}
              <div
                className={`custom-cadence ${
                  symmetric && !PRESETS.some((control) => sameTimeControl(control, setup.timeControl))
                    ? "active"
                    : ""
                }`}
              >
                <span>Personnalisée</span>
                <span className="time-fields">
                  <input
                    type="number"
                    name="custom-minutes"
                    aria-label="Minutes de la cadence personnalisée"
                    min="0.5"
                    max="180"
                    step="0.5"
                    value={custom.minutes}
                    onChange={(event) => {
                      const next = { ...custom, minutes: event.target.value };
                      setCustom(next);
                      const control = parseTimeControl(next.minutes, next.increment);
                      if (control) chooseBoth(control);
                    }}
                  />
                  min +
                  <input
                    type="number"
                    name="custom-increment"
                    aria-label="Incrément de la cadence personnalisée, en secondes"
                    min="0"
                    max="60"
                    step="1"
                    value={custom.increment}
                    onChange={(event) => {
                      const next = { ...custom, increment: event.target.value };
                      setCustom(next);
                      const control = parseTimeControl(next.minutes, next.increment);
                      if (control) chooseBoth(control);
                    }}
                  />
                  s
                </span>
              </div>
            </div>
          </fieldset>
          <fieldset disabled={busy} className="player-boxes" aria-label="Les deux camps">
            {mode === "engine" && (
              <>
                <PlayerBox
                  title="Vous"
                  subtitle={sideName(setup.side)}
                  time={setup.timeControl}
                  onTime={chooseFirst}
                  takeback={setup.takebacks.player}
                  onTakeback={(player) => setSetup({ ...setup, takebacks: { ...setup.takebacks, player } })}
                  name="player"
                />
                <EngineBox
                  title={local.name || "Moteur local"}
                  subtitle={`Le moteur${setup.side === "random" ? "" : ` · ${sideName(setup.side === "w" ? "b" : "w")}`}`}
                  time={second}
                  onTime={chooseSecond}
                  reset={reset}
                  inspection={local}
                  options={setup.engineOptions}
                  onOptions={(engineOptions) => setSetup({ ...setup, engineOptions })}
                  prefix="engine"
                />
              </>
            )}
            {mode === "human" && (
              <>
                {(["w", "b"] as const).map((side) => (
                  <PlayerBox
                    key={side}
                    title={sideName(side)}
                    subtitle="Joueur sur cet appareil"
                    time={side === "w" ? setup.timeControl : second}
                    onTime={side === "w" ? chooseFirst : chooseSecond}
                    reset={side === "b" ? reset : undefined}
                    takeback={setup.takebacks[side]}
                    onTakeback={(value) =>
                      setSetup({ ...setup, takebacks: { ...setup.takebacks, [side]: value } })
                    }
                    name={side}
                  />
                ))}
              </>
            )}
            {mode === "match" &&
              (["w", "b"] as const).map((side) => (
                <EngineBox
                  key={side}
                  title={sideName(side)}
                  subtitle={`Moteur des ${sideName(side)}`}
                  select={
                    <AnalysisEngineSelect
                      value={setup.matchEngines[side].id}
                      disabled={busy}
                      label={`Moteur des ${sideName(side)}`}
                      compact
                      onChange={(id) =>
                        setSetup((current) => ({
                          ...current,
                          matchEngines: {
                            ...current.matchEngines,
                            [side]: {
                              id,
                              options: id === current.matchEngines[side].id
                                ? current.matchEngines[side].options
                                : DEFAULT_ENGINE_OPTIONS,
                            },
                          },
                        }))
                      }
                    />
                  }
                  time={side === "w" ? setup.timeControl : second}
                  onTime={side === "w" ? chooseFirst : chooseSecond}
                  reset={side === "b" ? reset : undefined}
                  inspection={side === "w" ? white : black}
                  options={setup.matchEngines[side].options}
                  onOptions={(options) => matchOptions(side, options)}
                  opponentOptions={setup.matchEngines[side === "w" ? "b" : "w"].options}
                  prefix={`match-${side}`}
                  match
                />
              ))}
          </fieldset>
          <div className="position-entry">
            <button
              type="button"
              className="position-link"
              disabled={busy}
              aria-expanded={positionOpen}
              onClick={() => setPositionOpen(!positionOpen)}
            >
              Modifier la position de départ
            </button>
            {customPosition && (
              <p className="setting-help">
                Une position personnalisée sera utilisée.{" "}
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    setSetup((current) =>
                      mode === "engine"
                        ? { ...current, handicap: null, playerArmy: null }
                        : mode === "match"
                          ? { ...current, matchArmies: { w: null, b: null } }
                          : { ...current, humanArmies: { w: null, b: null } },
                    )
                  }
                >
                  Revenir à la position classique
                </button>
              </p>
            )}
            {positionOpen && (
              <div className="choice-row position-sides">
                {mode === "engine" ? (
                  <>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditingArmy("player")}>
                      Éditer votre camp
                    </button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditingArmy("engine")}>
                      Éditer le camp du moteur
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditingArmy("w")}>
                      Éditer les Blancs
                    </button>
                    <button type="button" className="secondary" disabled={busy} onClick={() => setEditingArmy("b")}>
                      Éditer les Noirs
                    </button>
                  </>
                )}
              </div>
            )}
            {positionError && (
              <p role="alert" className="setting-help">
                {positionError}
              </p>
            )}
          </div>
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid && !busy) onStart(setup);
            }}
          >
          <button className="primary wide" disabled={busy || !valid} type="submit">
            {busy
              ? mode === "match"
                ? "Préparation des moteurs…"
                : "Préparation du moteur…"
              : displayError
                ? "Réessayer"
                : mode === "match"
                  ? "Lancer le match"
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
      </div>
      {(editingArmy === "player" || editingArmy === "engine") && (
        // Votre camp et celui du moteur s'éditent comme les deux camps d'un
        // match : l'autre reste visible, verrouillé, tel qu'il a été préparé.
        <ArmyEditor
          initial={editingArmy === "player" ? setup.playerArmy : setup.handicap}
          humanSide={editingArmy === "player" ? (humanColor === "w" ? "b" : "w") : humanColor}
          matchArmies={localArmies(setup.handicap, setup.playerArmy, humanColor)}
          labels={
            editingArmy === "player"
              ? {
                  title: "Éditer votre camp",
                  intro: "Le camp du moteur est verrouillé. La disposition suivra votre couleur.",
                  of: "de votre camp",
                }
              : {
                  title: "Éditer le camp du moteur",
                  intro: "Votre camp est verrouillé. La disposition suivra la couleur du moteur.",
                  of: "du moteur",
                }
          }
          onClose={() => setEditingArmy(null)}
          onSave={(army) => {
            setSetup((current) =>
              editingArmy === "player" ? { ...current, playerArmy: army } : { ...current, handicap: army },
            );
            setEditingArmy(null);
          }}
        />
      )}
      {(editingArmy === "w" || editingArmy === "b") && (
        <ArmyEditor
          initial={armies[editingArmy]}
          humanSide={editingArmy === "w" ? "b" : "w"}
          matchArmies={armies}
          onClose={() => setEditingArmy(null)}
          onSave={(army) => {
            setSetup((current) =>
              mode === "match"
                ? { ...current, matchArmies: { ...current.matchArmies, [editingArmy]: army } }
                : { ...current, humanArmies: { ...current.humanArmies, [editingArmy]: army } },
            );
            setEditingArmy(null);
          }}
        />
      )}
    </section>
  );
}

function sideName(side: Setup["side"]) {
  return side === "w" ? "Blancs" : side === "b" ? "Noirs" : "Couleur tirée au sort";
}

function draftOf(control: TimeControl) {
  return {
    minutes: String(control.initialMs / 60000),
    increment: String(control.incrementMs / 1000),
  };
}

function ProfileCard({
  profile,
  active,
  threads,
  onChoose,
}: {
  profile: Profile;
  active: boolean;
  threads: number;
  onChoose: () => void;
}) {
  const time =
    profile.opponent === "engine"
      ? profile.engineTime
        ? `Vous ${describeTimeControl(profile.time)} · moteur ${describeTimeControl(profile.engineTime)}`
        : `${describeTimeControl(profile.time)} chacun`
      : describeTimeControl(profile.time);
  return (
    <button type="button" className="profile-card" aria-pressed={active} onClick={onChoose}>
      {profile.level && <span className={`level level-${profile.level}`}>{profile.level}</span>}
      <strong>{time}</strong>
      <small>{describeProfile(profile, threads)}</small>
    </button>
  );
}

/** Le temps d'un camp, lu comme une pendule ; « modifier » ne change que lui. */
function ClockField({
  whose,
  time,
  onTime,
  reset,
}: {
  /** « le temps des Blancs », « le temps du moteur », « votre temps ». */
  whose: string;
  time: TimeControl;
  onTime: (control: TimeControl) => void;
  reset?: { label: string; onReset: () => void };
}) {
  const [draft, setDraft] = useState<{ minutes: string; seconds: string; increment: string } | null>(null);
  if (!draft)
    return (
      <>
        <div className="clock-field">
          <span className="clock-value" aria-label={`${whose[0].toUpperCase()}${whose.slice(1)} : ${describeTimeControl(time)}`}>
            {formatTime(time.initialMs)}
            <small>+ {time.incrementMs / 1000} s</small>
          </span>
          <button
            type="button"
            className="text-button"
            aria-label={`Modifier ${whose}`}
            onClick={() =>
              setDraft({
                minutes: String(Math.floor(time.initialMs / 60000)),
                seconds: String((time.initialMs / 1000) % 60),
                increment: String(time.incrementMs / 1000),
              })
            }
          >
            modifier
          </button>
        </div>
        {reset && (
          <button type="button" className="text-button reset-time" onClick={reset.onReset}>
            {reset.label}
          </button>
        )}
      </>
    );
  const control = timeControlFromParts(draft.minutes, draft.seconds, draft.increment);
  const confirm = () => {
    if (!control) return;
    onTime(control);
    setDraft(null);
  };
  // Entrée valide sans envoyer le formulaire de la partie ; Échap annule.
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
  };
  const field = (key: keyof typeof draft, name: string, max: number) => (
    <input
      type="number"
      aria-label={`${name}, ${whose}`}
      min="0"
      max={max}
      step="1"
      value={draft[key]}
      onKeyDown={keys}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
    />
  );
  return (
    <div className="clock-editing">
      <div className="setting-line">
        <span>Temps</span>
        <span className="time-fields">
          {field("minutes", "Minutes", 180)} min {field("seconds", "Secondes", 59)} s
        </span>
      </div>
      <div className="setting-line">
        <span>Incrément</span>
        <span className="time-fields">{field("increment", "Incrément en secondes", 60)} s</span>
      </div>
      <p className="setting-help">
        {control
          ? "Ne change que ce camp. Entrée valide, Échap annule."
          : "De 30 s à 180 min, et jusqu’à 60 s d’incrément."}
      </p>
      <div className="clock-actions">
        <button type="button" className="text-button" onClick={() => setDraft(null)}>
          Annuler
        </button>
        <button type="button" disabled={!control} onClick={confirm}>
          Valider
        </button>
      </div>
    </div>
  );
}

function BoxHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <h3 className="box-title">
      {title}
      <small>{subtitle}</small>
    </h3>
  );
}

function PlayerBox({
  title,
  subtitle,
  time,
  onTime,
  reset,
  takeback,
  onTakeback,
  name,
}: {
  title: string;
  subtitle: string;
  time: TimeControl;
  onTime: (control: TimeControl) => void;
  reset?: { label: string; onReset: () => void };
  takeback: boolean;
  onTakeback: (value: boolean) => void;
  name: string;
}) {
  return (
    <div className="player-box">
      <BoxHeader title={title} subtitle={subtitle} />
      <ClockField whose={title === "Vous" ? "votre temps" : `le temps des ${title}`} time={time} onTime={onTime} reset={reset} />
      <label className="setting-switch setting-line trailing">
        <span className="setting-copy">
          <strong>Retours en arrière</strong>
          <span className="setting-help">
            Reprendre son dernier coup pendant la partie
          </span>
        </span>
        <input
          type="checkbox"
          name={`takeback-${name}`}
          checked={takeback}
          onChange={(event) => onTakeback(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
    </div>
  );
}

function EngineBox({
  title,
  subtitle,
  select,
  time,
  onTime,
  reset,
  inspection,
  options,
  onOptions,
  opponentOptions,
  prefix,
  match = false,
}: {
  title: string;
  subtitle: string;
  select?: ReactNode;
  time: TimeControl;
  onTime: (control: TimeControl) => void;
  reset?: { label: string; onReset: () => void };
  inspection: EngineInspection;
  options: EngineOptions;
  onOptions: (options: EngineOptions) => void;
  opponentOptions?: EngineOptions;
  prefix: string;
  match?: boolean;
}) {
  return (
    <div className="player-box">
      <BoxHeader title={title} subtitle={subtitle} />
      {select}
      <ClockField whose={match ? `le temps des ${title}` : "le temps du moteur"} time={time} onTime={onTime} reset={reset} />
      <EngineSettings
        options={options}
        onChange={onOptions}
        inspection={inspection}
        prefix={prefix}
        match={match}
        opponentOptions={opponentOptions}
      />
    </div>
  );
}
