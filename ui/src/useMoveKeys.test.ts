import { expect, it } from "vitest";
import { moveKeyDirection } from "./useMoveKeys";

it.each([
  ["ArrowLeft", "ArrowLeft", false, -1],
  ["ArrowRight", "ArrowRight", false, 1],
  ["<", "IntlBackslash", false, -1],
  [">", "IntlBackslash", true, 1],
  ["<", "Comma", true, -1],
  [">", "Period", true, 1],
  ["Unidentified", "IntlBackslash", false, -1],
  ["Unidentified", "IntlBackslash", true, 1],
  ["Unidentified", "ArrowLeft", false, -1],
  ["Unidentified", "ArrowRight", false, 1],
  ["a", "KeyA", false, 0],
] as const)(
  "interprète le clavier %s/%s (Maj=%s)",
  (key, code, shiftKey, direction) => {
    expect(moveKeyDirection({ key, code, shiftKey })).toBe(direction);
  },
);
