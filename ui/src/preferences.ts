import { readHandicap, readMatchArmies, type Handicap, type MatchArmies } from "./handicap";
import {
  DEFAULT_TIME_CONTROL,
  validTimeControl,
  type TimeControl,
} from "./GameClock";
import { DEFAULT_ENGINE_OPTIONS, type EngineOptions } from "./engine/options";
import type { ClockControls } from "./GameClock";
import type { Side } from "./engine/analysis";
export type GameSetup = {
  opponent: "engine" | "human" | "match";
  side: Side | "random";
  /** Le temps de la première case : vous face au moteur, les Blancs sinon. */
  timeControl: TimeControl;
  /**
   * Le temps de la seconde case — le moteur, ou les Noirs d'un match comme
   * de deux joueurs ; `null` quand c'est le même. Le nom date du temps où
   * seul le moteur pouvait en avoir un autre, et la clé enregistrée aussi.
   */
  engineTimeControl: TimeControl | null;
  engineOptions: EngineOptions;
  handicap: Handicap;
  matchEngines: Record<Side, { id: string; options: EngineOptions }>;
  matchArmies: MatchArmies;
  /** La position de départ de deux joueurs, les deux camps modifiables. */
  humanArmies: MatchArmies;
  /**
   * Retours en arrière autorisés, par joueur humain : vous face au moteur,
   * les Blancs et les Noirs à deux. Enregistrés dès maintenant, sans effet
   * tant que la fonction n'existe pas.
   */
  takebacks: { player: boolean; w: boolean; b: boolean };
};
export const DEFAULT_SETUP: GameSetup = {
  opponent: "engine",
  side: "w",
  timeControl: DEFAULT_TIME_CONTROL,
  engineTimeControl: null,
  engineOptions: DEFAULT_ENGINE_OPTIONS,
  handicap: null,
  matchArmies: { w: null, b: null },
  matchEngines: {
    w: { id: "default", options: DEFAULT_ENGINE_OPTIONS },
    b: { id: "default", options: DEFAULT_ENGINE_OPTIONS },
  },
  humanArmies: { w: null, b: null },
  takebacks: { player: false, w: false, b: false },
};
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Le stockage n'est pas indispensable pour jouer. */
  }
}
export function evaluationPreference(view: "play" | "review") {
  const value =
    readPreference(`chess-ui.evaluation.${view}`) ??
    readPreference("chess-ui.show-evaluation");
  return value === null ? view === "review" : value !== "false";
}
export function readSetup(): GameSetup {
  try {
    const value = JSON.parse(readPreference("chess-ui.setup") || "null");
    const timeControl = validTimeControl(value?.timeControl);
    if (
      timeControl &&
      ["engine", "human", "match"].includes(value.opponent) &&
      ["w", "b", "random"].includes(value.side)
    )
      return {
        handicap: readHandicap(value.handicap),
        matchArmies: readMatchArmies(value.matchArmies),
        humanArmies: readMatchArmies(value.humanArmies),
        takebacks: {
          player: value.takebacks?.player === true,
          w: value.takebacks?.w === true,
          b: value.takebacks?.b === true,
        },
        opponent: value.opponent,
        side: value.side,
        timeControl,
        matchEngines: {
          w: readMatchEngine(value.matchEngines?.w),
          b: readMatchEngine(value.matchEngines?.b),
        },
        engineTimeControl: validTimeControl(value.engineTimeControl),
        engineOptions: {
          ponder: value.engineOptions?.ponder === true,
          threads:
            Number.isSafeInteger(value.engineOptions?.threads) &&
            value.engineOptions.threads >= 1 &&
            value.engineOptions.threads <= 1024
              ? value.engineOptions.threads
              : 1,
        },
      };
  } catch {
    /* Revenir aux valeurs initiales si les préférences sont endommagées. */
  }
  return DEFAULT_SETUP;
}
function readMatchEngine(
  value: { id?: string; options?: EngineOptions } | undefined,
) {
  const threads = value?.options?.threads;
  return {
    id: typeof value?.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value.id)
      ? value.id : "default",
    options: {
      ponder: value?.options?.ponder === true,
      threads: threads !== undefined && Number.isSafeInteger(threads) && threads >= 1 && threads <= 1024
        ? threads : 1,
    },
  };
}
export function resolveSide(
  side: GameSetup["side"],
  random = Math.random,
): Side {
  return side === "random" ? (random() < 0.5 ? "w" : "b") : side;
}

export function gameTimeControls(
  setup: GameSetup,
  humanSide: Side,
): ClockControls {
  const second = setup.engineTimeControl ?? setup.timeControl;
  // À deux joueurs comme en match, la première case est celle des Blancs ;
  // face au moteur, c'est la vôtre, quel que soit votre camp.
  if (setup.opponent !== "engine") return { w: setup.timeControl, b: second };
  return humanSide === "w"
    ? { w: setup.timeControl, b: second }
    : { w: second, b: setup.timeControl };
}
