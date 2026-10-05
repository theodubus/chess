import type { ReviewPosition, ReviewResult } from "../model";
import type { VerificationIdentity } from "./BoundedVerification";
import { understandingWork, type Understanding } from "./prototype";
import type { WorkPhase } from "./work";

export type UnderstandingRequest = VerificationIdentity & {
  position: ReviewPosition;
  result: ReviewResult | null;
};

function betweenSlices(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, 0);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

// structuredClone détruirait les méthodes des Move de chess.js. Conserver ces
// objets, mais interdire à un lecteur de modifier le résultat mis en cache.
function freezeFacts<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeFacts(child);
    Object.freeze(value);
  }
  return value;
}

/** Extraction locale coopérative, indépendante du transport UCI. Une tranche
 * peut dépasser sliceMs si une primitive chess.js est longue : cette classe
 * permet l'interruption entre les primitives, sans promettre une durée d'image. */
export class UnderstandingAnalysis {
  private generation = 0;
  private abort?: AbortController;
  private request?: UnderstandingRequest;
  private cache = new WeakMap<object, Map<string, Understanding>>();
  private listeners = new Set<() => void>();
  state: "idle" | "running" | "complete" | "stopped" | "timed-out" | "error" = "idle";
  phase: WorkPhase = "context";
  error = "";
  cached = false;
  elapsedMs = 0;
  slices = 0;
  constructor(private sliceMs = 8, private deadlineMs = 12000, private cacheSize = 32) {
    if (![sliceMs, deadlineMs].every((n) => Number.isFinite(n) && n > 0) || !Number.isInteger(cacheSize) || cacheSize < 1)
      throw new Error("Limites d'extraction invalides.");
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private publish() { for (const listener of this.listeners) listener(); }
  private key(request: UnderstandingRequest) {
    // L'historique complet et la PV sont indispensables : une même FEN ne
    // signifie ni les mêmes reprises antérieures, ni la même menace suivante.
    return JSON.stringify([request.revision, request.engineId, request.position, request.result]);
  }
  matches(request: UnderstandingRequest) {
    return this.request?.review === request.review && this.key(this.request) === this.key(request);
  }
  resultFor(request: UnderstandingRequest) { return this.cache.get(request.review)?.get(this.key(request)) ?? null; }
  stop() {
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    if (this.state === "running") { this.state = "stopped"; this.publish(); }
  }
  async analyse(input: UnderstandingRequest): Promise<Understanding | null> {
    this.stop();
    const generation = this.generation, start = performance.now();
    const request = { ...input, position: structuredClone(input.position), result: structuredClone(input.result) };
    this.request = request;
    this.error = ""; this.cached = false; this.elapsedMs = 0; this.slices = 0; this.phase = "context";
    const key = this.key(request), cache = this.cache.get(request.review) ?? new Map<string, Understanding>();
    this.cache.set(request.review, cache);
    const cached = cache.get(key);
    if (cached) {
      this.cached = true; this.state = "complete"; this.publish();
      return this.generation === generation ? cached : null;
    }
    const abort = new AbortController();
    this.abort = abort;
    this.state = "running";
    const work = understandingWork(request.position, request.result);
    const current = () => {
      if (generation !== this.generation || abort.signal.aborted) return false;
      if (performance.now() - start >= this.deadlineMs) {
        this.generation++; abort.abort(); this.abort = undefined;
        this.state = "timed-out"; this.elapsedMs = performance.now() - start; this.publish();
        return false;
      }
      return true;
    };
    this.publish();
    try {
      while (current()) {
        const sliceStart = performance.now();
        this.slices++;
        do {
          const step = work.next();
          if (!current()) return null;
          if (step.done) {
            const result = freezeFacts(step.value);
            if (!current()) return null;
            cache.set(key, result);
            while (cache.size > this.cacheSize) cache.delete(cache.keys().next().value!);
            this.state = "complete"; this.elapsedMs = performance.now() - start; this.publish();
            return generation === this.generation && !abort.signal.aborted ? result : null;
          }
          this.phase = step.value;
        } while (performance.now() - sliceStart < this.sliceMs);
        this.elapsedMs = performance.now() - start;
        this.publish();
        if (!current()) return null;
        await betweenSlices(abort.signal);
      }
      return null;
    } catch (error) {
      if (current()) {
        this.error = error instanceof Error ? error.message : "Extraction indisponible.";
        this.state = "error"; this.elapsedMs = performance.now() - start; this.publish();
      }
      return null;
    } finally {
      work.return(undefined as never);
      if (generation === this.generation) this.abort = undefined;
    }
  }
}
