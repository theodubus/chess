import { afterEach, expect, it, vi } from "vitest";
import {
  DEFAULT_SETUP,
  gameTimeControls,
  evaluationPreference,
  readSetup,
  resolveSide,
} from "./preferences";
afterEach(() => vi.unstubAllGlobals());
it("sépare les évaluations de jeu et de revue et préserve le choix antérieur", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
  });
  expect(evaluationPreference("play")).toBe(false);
  expect(evaluationPreference("review")).toBe(true);
  data.set("chess-ui.show-evaluation", "false");
  expect(evaluationPreference("review")).toBe(false);
  data.set("chess-ui.evaluation.review", "true");
  expect(evaluationPreference("review")).toBe(true);
  expect(evaluationPreference("play")).toBe(false);
});
it("valide les réglages sauvegardés et résiste au stockage indisponible", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        opponent: "human",
        side: "b",
        timeControl: { initialMs: 60000, incrementMs: 1000 },
      }),
  });
  expect(readSetup().opponent).toBe("human");
  vi.stubGlobal("localStorage", { getItem: () => "{broken" });
  expect(readSetup()).toEqual(DEFAULT_SETUP);
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Stockage indisponible");
    },
  });
  expect(readSetup()).toEqual(DEFAULT_SETUP);
});
it("résout le tirage au sort sans changer les camps explicitement choisis", () => {
  expect(resolveSide("random", () => 0.2)).toBe("w");
  expect(resolveSide("random", () => 0.8)).toBe("b");
  expect(resolveSide("w", () => 0.8)).toBe("w");
});

it("restaure les anciennes préférences sans activer de nouvelles options", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        opponent: "engine",
        side: "w",
        timeControl: DEFAULT_SETUP.timeControl,
      }),
  });
  expect(readSetup().engineOptions).toEqual({ ponder: false, threads: 1 });
  expect(readSetup().engineTimeControl).toBeNull();
});
it("valide aussi les temps du bot et les réglages moteur sauvegardés", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        ...DEFAULT_SETUP,
        engineTimeControl: { initialMs: -1, incrementMs: 0 },
        engineOptions: { ponder: "true", threads: 1000000 },
      }),
  });
  expect(readSetup().engineOptions).toEqual({ ponder: false, threads: 1 });
  expect(readSetup().engineTimeControl).toBeNull();
});

it("attache les temps aux joueurs après le choix ou le tirage du camp", () => {
  const setup = {
    ...DEFAULT_SETUP,
    engineTimeControl: { initialMs: 60_000, incrementMs: 0 },
  };
  expect(
    gameTimeControls(
      setup,
      resolveSide("random", () => 0.9),
    ),
  ).toEqual({ w: setup.engineTimeControl, b: setup.timeControl });
  expect(gameTimeControls(setup, "w")).toEqual({
    w: setup.timeControl,
    b: setup.engineTimeControl,
  });
  expect(gameTimeControls({ ...setup, opponent: "human" }, "b")).toEqual({
    w: setup.timeControl,
    b: setup.timeControl,
  });
});
