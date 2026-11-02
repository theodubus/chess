import { sameTimeControl, type TimeControl } from "./GameClock";
import type { Side } from "./engine/analysis";
import type { EngineCapabilities, EngineOptions } from "./engine/options";
import { logicalCores, threadAdvice } from "./engine/threadAdvice";
import type { GameSetup } from "./preferences";

export type ProfileLevel = "facile" | "moyen" | "difficile" | "abominable";

/**
 * Une combinaison de réglages qu'un clic pré-remplit (Théo, 2 nov. 2026).
 * Un profil ne choisit ni le camp, ni les moteurs, ni la position : il ne
 * touche que ce qu'il décrit.
 */
export type Profile = {
  id: string;
  opponent: "engine" | "match";
  level?: ProfileLevel;
  /** Vous face au moteur, les deux moteurs d'un match. */
  time: TimeControl;
  /** Le moteur face à vous ; absent quand c'est le même temps. */
  engineTime?: TimeControl;
  ponder: boolean;
  /** « advice » : les cœurs conseillés sur cette machine, comme l'écran les calcule. */
  threads: number | "advice";
  /** Retours en arrière pour le joueur humain. */
  takeback?: boolean;
};

const minutes = (value: number): TimeControl => ({
  initialMs: value * 60_000,
  incrementMs: 0,
});

export const PROFILES: readonly Profile[] = [
  { id: "engine-easy", opponent: "engine", level: "facile", time: minutes(3), engineTime: minutes(0.5), ponder: false, threads: 1 },
  { id: "engine-medium", opponent: "engine", level: "moyen", time: minutes(3), engineTime: minutes(0.5), ponder: true, threads: "advice" },
  { id: "engine-hard", opponent: "engine", level: "difficile", time: minutes(3), ponder: true, threads: "advice", takeback: true },
  { id: "engine-abominable", opponent: "engine", level: "abominable", time: minutes(3), ponder: true, threads: "advice" },
  { id: "match-single", opponent: "match", time: minutes(3), ponder: false, threads: 1 },
  { id: "match-advice", opponent: "match", time: minutes(3), ponder: false, threads: "advice" },
  { id: "match-ponder", opponent: "match", time: minutes(3), ponder: true, threads: "advice" },
  { id: "match-bullet", opponent: "match", time: minutes(0.5), ponder: true, threads: "advice" },
];

/**
 * Le plus de cœurs qu'un moteur peut recevoir : ceux de la machine, bornés
 * par ce que le moteur annonce. Tant que ses capacités ne sont pas connues,
 * on suppose qu'il en accepte autant que la machine en a ; un moteur qui
 * n'annonce pas `Threads` n'en reçoit qu'un.
 */
export function threadLimit(
  cores: number,
  capabilities: EngineCapabilities | null | undefined,
) {
  const available = logicalCores(cores);
  if (!capabilities) return available;
  return capabilities.threads ? Math.min(available, capabilities.threads.max) : 1;
}

/**
 * Le nombre de cœurs d'un profil sur cette machine. Les cœurs conseillés
 * sont ceux du conseil de l'écran (`threadAdvice`) : quand les deux moteurs
 * d'un match pondèrent, ils calculent en même temps et se partagent le
 * budget, chacun en recevant la moitié.
 */
export function profileThreads(profile: Profile, cores: number, limit: number) {
  if (profile.threads !== "advice") return Math.max(1, Math.min(profile.threads, limit));
  const options = { ponder: profile.ponder, threads: 1 };
  const advice = threadAdvice(cores, options, profile.opponent === "match" ? options : undefined);
  const recommended = advice.shared ? Math.max(1, Math.floor(advice.budget / 2)) : advice.limit;
  return Math.max(1, Math.min(recommended, limit));
}

/** Le temps de la seconde case, `null` quand il est le même que la première. */
function secondTime(first: TimeControl, second: TimeControl | undefined | null) {
  return second && !sameTimeControl(first, second) ? second : null;
}

/**
 * Ce que chaque moteur peut recevoir de cœurs (`threadLimit`) : celui du
 * mode « Moteur local », et ceux des Blancs et des Noirs d'un match.
 */
export type ThreadLimits = { engine: number } & Record<Side, number>;

export function applyProfile(
  setup: GameSetup,
  profile: Profile,
  cores: number,
  limits: ThreadLimits,
): GameSetup {
  const options = (limit: number): EngineOptions => ({
    ponder: profile.ponder,
    threads: profileThreads(profile, cores, limit),
  });
  const timed: GameSetup = {
    ...setup,
    opponent: profile.opponent,
    timeControl: profile.time,
    engineTimeControl: secondTime(profile.time, profile.engineTime),
  };
  if (profile.opponent === "engine")
    return {
      ...timed,
      engineOptions: options(limits.engine),
      takebacks: { ...setup.takebacks, player: profile.takeback === true },
    };
  return {
    ...timed,
    matchEngines: {
      w: { ...setup.matchEngines.w, options: options(limits.w) },
      b: { ...setup.matchEngines.b, options: options(limits.b) },
    },
  };
}

/**
 * Un profil n'est mis en avant que si les réglages qu'il décrit sont
 * EXACTEMENT les siens : la surbrillance se déduit des réglages, elle n'est
 * jamais mémorisée. Toucher un seul de ces réglages après le clic l'éteint,
 * et retrouver ses valeurs à la main la rallume (Théo, 2 nov. 2026).
 */
export function profileMatches(
  setup: GameSetup,
  profile: Profile,
  cores: number,
  limits: ThreadLimits,
) {
  const same = (options: EngineOptions, limit: number) =>
    options.ponder === profile.ponder &&
    options.threads === profileThreads(profile, cores, limit);
  return (
    setup.opponent === profile.opponent &&
    sameTimeControl(setup.timeControl, profile.time) &&
    sameTimeControl(
      setup.engineTimeControl ?? setup.timeControl,
      profile.engineTime ?? profile.time,
    ) &&
    (profile.opponent === "engine"
      ? same(setup.engineOptions, limits.engine) &&
        setup.takebacks.player === (profile.takeback === true)
      : same(setup.matchEngines.w.options, limits.w) &&
        same(setup.matchEngines.b.options, limits.b))
  );
}

/** Ce que la carte du profil affiche : le vrai nombre de cœurs, jamais « conseillés ». */
export function describeProfile(profile: Profile, threads: number) {
  const cores = `${threads} cœur${threads > 1 ? "s" : ""}`;
  return [
    profile.ponder ? "Ponder" : "Sans ponder",
    profile.opponent === "match" ? `${cores} chacun` : cores,
    ...(profile.takeback ? ["retours"] : []),
  ].join(" · ");
}
