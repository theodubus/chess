import { expect, it } from "vitest";
import { scorePreference } from "./scorePreference";
import type { Score, Side } from "../../engine/analysis";

const cp = (value: number): Score => ({ kind: "cp", value });
const mate = (winner: Side, distance = 3): Score => ({ kind: "mate", value: distance * (winner === "w" ? 1 : -1), winner });
it.each(["w", "b"] as const)("compare les issues sans convertir les mats en CP : %s", actor => {
  const sign = actor === "w" ? 1 : -1, enemy = actor === "w" ? "b" : "w";
  expect(scorePreference(cp(-500 * sign), cp(0), actor)).toBe("cp-margin");
  expect(scorePreference(cp(0), cp(99 * sign), actor)).toBeNull();
  expect(scorePreference(cp(0), cp(100 * sign), actor)).toBe("cp-margin");
  expect(scorePreference(cp(500 * sign), cp(0), actor)).toBeNull();
  expect(scorePreference(mate(enemy), cp(0), actor)).toBe("mate-outcome");
  expect(scorePreference(mate(enemy), cp(-1 * sign), actor)).toBeNull();
  expect(scorePreference(cp(2000 * sign), mate(actor), actor)).toBe("mate-outcome");
  expect(scorePreference(mate(enemy), mate(actor), actor)).toBe("mate-outcome");
  expect(scorePreference(mate(actor, 5), mate(actor, 1), actor)).toBeNull();
  expect(scorePreference(mate(enemy, 1), mate(enemy, 8), actor)).toBeNull();
  expect(scorePreference(mate(actor), cp(10000 * sign), actor)).toBeNull();
  expect(scorePreference(cp(0), mate(enemy), actor)).toBeNull();
  expect(scorePreference(cp(-500 * sign), mate(actor, 0), actor)).toBeNull();
  expect(scorePreference(cp(-500 * sign), mate(actor, 0), actor, true)).toBe("mate-outcome");
});
it.each([null, cp(NaN), cp(Infinity), { ...cp(200), bound: "lower" as const }, { kind: "mate" as const, value: 2 }, mate("w", 1.5), { ...mate("w"), value: -3 }])("refuse les scores incomplets ou incohérents : %j", score => {
  expect(scorePreference(score, cp(10000), "w")).toBeNull();
  expect(scorePreference(cp(-10000), score, "w")).toBeNull();
});
