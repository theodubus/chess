import { expect, it } from "vitest";
import { DEFAULT_SETUP, gameTimeControls, type GameSetup } from "./preferences";
import {
  PROFILES,
  applyProfile,
  describeProfile,
  profileMatches,
  profileThreads,
  threadLimit,
  type ThreadLimits,
} from "./profiles";

const profile = (id: string) => PROFILES.find((entry) => entry.id === id)!;
const unlimited: ThreadLimits = { engine: 1024, w: 1024, b: 1024 };

it("définit quatre profils face au moteur, du plus facile au plus dur, et quatre de match", () => {
  expect(PROFILES.filter((entry) => entry.opponent === "engine").map((entry) => entry.level))
    .toEqual(["facile", "moyen", "difficile", "abominable"]);
  expect(PROFILES.filter((entry) => entry.opponent === "match")).toHaveLength(4);
});

it("résout les cœurs conseillés comme le conseil de l’écran, sur cette machine", () => {
  // Huit cœurs logiques : un reste à l’interface ; deux moteurs qui pondèrent
  // calculent en même temps et se partagent les sept autres.
  expect(profileThreads(profile("engine-medium"), 8, 1024)).toBe(7);
  expect(profileThreads(profile("match-advice"), 8, 1024)).toBe(7);
  expect(profileThreads(profile("match-ponder"), 8, 1024)).toBe(3);
  expect(profileThreads(profile("match-ponder"), 16, 1024)).toBe(7);
  expect(profileThreads(profile("match-single"), 8, 1024)).toBe(1);
  // Jamais plus que le moteur n’en accepte, jamais moins d’un.
  expect(profileThreads(profile("engine-medium"), 8, 2)).toBe(2);
  expect(profileThreads(profile("match-ponder"), 2, 1024)).toBe(1);
});

it("borne les cœurs par ce que le moteur annonce, et suppose la machine tant qu’il n’a rien dit", () => {
  expect(threadLimit(8, null)).toBe(8);
  expect(threadLimit(8, { ponder: true, threads: { min: 1, max: 4 } })).toBe(4);
  expect(threadLimit(8, { ponder: true, threads: null })).toBe(1);
});

it("pré-remplit le temps, le ponder, les cœurs et les retours sans toucher au reste", () => {
  const before: GameSetup = { ...DEFAULT_SETUP, side: "b", handicap: null };
  const easy = applyProfile(before, profile("engine-easy"), 8, unlimited);
  expect(easy.side).toBe("b");
  expect(gameTimeControls(easy, "w")).toEqual({
    w: { initialMs: 180_000, incrementMs: 0 },
    b: { initialMs: 30_000, incrementMs: 0 },
  });
  expect(easy.engineOptions).toEqual({ ponder: false, threads: 1 });
  expect(easy.takebacks.player).toBe(false);
  const hard = applyProfile(easy, profile("engine-hard"), 8, unlimited);
  expect(hard.engineTimeControl).toBeNull();
  expect(hard.engineOptions).toEqual({ ponder: true, threads: 7 });
  expect(hard.takebacks.player).toBe(true);
  const match = applyProfile(
    { ...DEFAULT_SETUP, matchEngines: { ...DEFAULT_SETUP.matchEngines, b: { id: "stockfish", options: { ponder: false, threads: 1 } } } },
    profile("match-ponder"), 8, { engine: 1024, w: 1024, b: 2 },
  );
  expect(match.opponent).toBe("match");
  expect(match.matchEngines.w).toEqual({ id: "default", options: { ponder: true, threads: 3 } });
  expect(match.matchEngines.b).toEqual({ id: "stockfish", options: { ponder: true, threads: 2 } });
});

it("ne met un profil en avant que tant que ses réglages sont exactement les siens", () => {
  for (const entry of PROFILES) {
    const applied = applyProfile(DEFAULT_SETUP, entry, 8, unlimited);
    expect(profileMatches(applied, entry, 8, unlimited)).toBe(true);
    // Un seul profil à la fois : aucun autre ne correspond aux mêmes réglages.
    expect(PROFILES.filter((other) => profileMatches(applied, other, 8, unlimited)))
      .toEqual([entry]);
  }
  const hard = profile("engine-hard");
  const applied = applyProfile(DEFAULT_SETUP, hard, 8, unlimited);
  const changes: GameSetup[] = [
    { ...applied, engineOptions: { ...applied.engineOptions, threads: 6 } },
    { ...applied, engineOptions: { ...applied.engineOptions, ponder: false } },
    { ...applied, takebacks: { ...applied.takebacks, player: false } },
    { ...applied, timeControl: { initialMs: 180_000, incrementMs: 2000 } },
    { ...applied, engineTimeControl: { initialMs: 60_000, incrementMs: 0 } },
    { ...applied, opponent: "human" },
  ];
  for (const changed of changes) expect(profileMatches(changed, hard, 8, unlimited)).toBe(false);
  // Les réglages qu’un profil ne décrit pas ne l’éteignent pas.
  expect(profileMatches({ ...applied, side: "random", takebacks: { ...applied.takebacks, w: true } }, hard, 8, unlimited)).toBe(true);
  // Un temps du moteur égal au vôtre vaut « même temps ».
  expect(profileMatches({ ...applied, engineTimeControl: applied.timeControl }, hard, 8, unlimited)).toBe(true);
  // Sur une autre machine, le même nombre de cœurs n’est plus le conseil.
  expect(profileMatches(applied, hard, 16, unlimited)).toBe(false);
});

it("décrit chaque profil par le vrai nombre de cœurs", () => {
  expect(describeProfile(profile("engine-easy"), 1)).toBe("Sans ponder · 1 cœur");
  expect(describeProfile(profile("engine-hard"), 7)).toBe("Ponder · 7 cœurs · retours");
  expect(describeProfile(profile("match-ponder"), 3)).toBe("Ponder · 3 cœurs chacun");
});
