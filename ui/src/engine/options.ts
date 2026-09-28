export type EngineOptions = { ponder: boolean; threads: number };
export type EngineCapabilities = {
  ponder: boolean;
  threads: { min: number; max: number } | null;
};
export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  ponder: false,
  threads: 1,
};

export function readEngineOption(
  line: string,
  capabilities: EngineCapabilities,
) {
  if (/^option name Ponder type check(?: |$)/i.test(line))
    capabilities.ponder = true;
  if (/^option name Threads type spin(?: |$)/i.test(line)) {
    const min = Number(/\bmin (\d+)\b/.exec(line)?.[1]);
    const max = Number(/\bmax (\d+)\b/.exec(line)?.[1]);
    if (
      Number.isSafeInteger(min) &&
      Number.isSafeInteger(max) &&
      min >= 1 &&
      max >= min
    )
      capabilities.threads = { min, max };
  }
}

export function validateEngineOptions(
  options: EngineOptions,
  capabilities: EngineCapabilities,
) {
  if (options.ponder && !capabilities.ponder)
    throw new Error(
      "Ce moteur ne propose pas la réflexion sur le temps adverse. Désactivez cette option.",
    );
  if (
    !Number.isSafeInteger(options.threads) ||
    options.threads < 1 ||
    (capabilities.threads
      ? options.threads < capabilities.threads.min ||
        options.threads > capabilities.threads.max
      : options.threads !== 1)
  )
    throw new Error(
      "Ce nombre de cœurs n’est pas pris en charge par le moteur. Modifiez les options de la partie.",
    );
}
