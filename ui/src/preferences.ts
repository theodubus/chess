import { readHandicap, type Handicap } from "./handicap";
import {
  DEFAULT_TIME_CONTROL,
  parseTimeControl,
  type TimeControl,
} from "./GameClock";
import { DEFAULT_ENGINE_OPTIONS, type EngineOptions } from "./engine/options";
import type { ClockControls } from "./GameClock";
import type { Side } from "./engine/analysis";
export type GameSetup = {
  opponent: "engine" | "human";
  side: Side | "random";
  timeControl: TimeControl;
  engineTimeControl: TimeControl | null;
  engineOptions: EngineOptions;
  handicap: Handicap;
};
export const DEFAULT_SETUP: GameSetup = {
  opponent: "engine",
  side: "w",
  timeControl: DEFAULT_TIME_CONTROL,
  engineTimeControl: null,
  engineOptions: DEFAULT_ENGINE_OPTIONS,
  handicap: null,
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
    const timeControl =
      value?.timeControl &&
      parseTimeControl(
        String(value.timeControl.initialMs / 60000),
        String(value.timeControl.incrementMs / 1000),
      );
    if (
      timeControl &&
      ["engine", "human"].includes(value.opponent) &&
      ["w", "b", "random"].includes(value.side)
    )
      return {
        handicap: readHandicap(value.handicap),
        opponent: value.opponent,
        side: value.side,
        timeControl,
        engineTimeControl: value.engineTimeControl
          ? parseTimeControl(
              String(value.engineTimeControl.initialMs / 60000),
              String(value.engineTimeControl.incrementMs / 1000),
            )
          : null,
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
  const engine =
    setup.opponent === "engine"
      ? (setup.engineTimeControl ?? setup.timeControl)
      : setup.timeControl;
  return humanSide === "w"
    ? { w: setup.timeControl, b: engine }
    : { w: engine, b: setup.timeControl };
}
