import {
  DEFAULT_TIME_CONTROL,
  parseTimeControl,
  type TimeControl,
} from "./GameClock";
import type { Side } from "./engine/analysis";
export type GameSetup = {
  opponent: "engine" | "human";
  side: Side | "random";
  timeControl: TimeControl;
};
export const DEFAULT_SETUP: GameSetup = {
  opponent: "engine",
  side: "w",
  timeControl: DEFAULT_TIME_CONTROL,
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
      return { ...value, timeControl };
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
