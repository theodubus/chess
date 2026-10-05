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
  expect(readSetup().matchEngines).toEqual(DEFAULT_SETUP.matchEngines);
});

it("restaure séparément le choix et les options des deux moteurs d’un match", () => {
  const setup = { ...DEFAULT_SETUP, opponent: "match", matchEngines: {
    w: { id: "default", options: { ponder: true, threads: 2 } },
    b: { id: "stockfish", options: { ponder: false, threads: 4 } },
  } };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(setup) });
  expect(readSetup()).toEqual(setup);
});

it("valide les identifiants et options sauvegardés sans les transmettre aveuglément au pont", () => {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ ...DEFAULT_SETUP, opponent: "match", matchEngines: {
    w: { id: "../engine?path=bad", options: { ponder: "true", threads: -3 } },
    b: { id: "local_engine-2", options: { ponder: true, threads: 1.5 } },
  } }) });
  expect(readSetup().matchEngines).toEqual({
    w: { id: "default", options: { ponder: false, threads: 1 } },
    b: { id: "local_engine-2", options: { ponder: true, threads: 1 } },
  });
});

it("attache les cadences du match aux couleurs sans tenir compte de l’ancien camp humain", () => {
  const setup = { ...DEFAULT_SETUP, opponent: "match" as const,
    engineTimeControl: { initialMs: 60000, incrementMs: 1000 } };
  for (const side of ["w", "b"] as const) {
    expect(gameTimeControls(setup, side)).toEqual({ w: setup.timeControl, b: setup.engineTimeControl });
    expect(gameTimeControls({ ...setup, engineTimeControl: null }, side)).toEqual({ w: setup.timeControl, b: setup.timeControl });
  }
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
