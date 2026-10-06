import type { EngineOptions } from "./options";

export function logicalCores(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 1024) : 1;
}

/** Estimation locale : réserver une marge pour l'UI, puis les recherches simultanées. */
export function threadAdvice(cores: number, options: EngineOptions, opponent?: EngineOptions) {
  const detected = logicalCores(cores);
  const budget = Math.max(1, detected - 1);
  const shared = Boolean(opponent && (options.ponder || opponent.ponder));
  const otherThreads = logicalCores(opponent?.threads);
  return {
    detected, budget, shared, otherThreads,
    limit: shared
      ? Math.max(1, Math.min(Math.floor(budget / 2), budget - otherThreads))
      : budget,
  };
}
