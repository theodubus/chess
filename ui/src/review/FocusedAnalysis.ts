import type { EngineFactory } from "../GameController";
import { LiveStudy } from "./LiveStudy";
import { boardFromCommand } from "./StudyTree";
import { candidateLine } from "./explanations";
import type { ReviewPosition, ReviewResult } from "./model";

export const focusedBudget = 3000;
export const focusedDeadline = 10000;
export type FocusRequest = {
  review: object;
  revision: number;
  engineId: string;
  positions: ReviewPosition[];
};
type Entry = { results: ReviewResult[] | null; unavailable: boolean };

/** Un score seul ou une PV provenant d'ailleurs ne peut pas dévoiler un indice. */
export function usableResult(
  position: ReviewPosition,
  result: ReviewResult | null,
): result is ReviewResult {
  if (
    !result?.score ||
    result.score.bound ||
    !Number.isFinite(result.score.value)
  )
    return false;
  try {
    const board = boardFromCommand(position.command);
    if (board.fen() !== position.fen) return false;
    if (board.isGameOver()) return result.bestMove === null;
    return !!candidateLine(position, result);
  } catch {
    return false;
  }
}

/** Une vérification à la demande, au plus deux positions, sans modifier la partie. */
export class FocusedAnalysis {
  constructor(
    private budget = focusedBudget,
    private deadline = focusedDeadline,
  ) {}
  private cache = new WeakMap<object, Map<string, Entry>>();
  private positions = new WeakMap<object, Map<string, ReviewResult>>();
  private generation = 0;
  private abort?: AbortController;
  private request?: FocusRequest;
  private search?: LiveStudy;
  private listeners = new Set<() => void>();
  state: "idle" | "running" | "complete" | "unavailable" | "error" | "stopped" =
    "idle";
  completed = 0;
  total = 0;
  error = "";
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    for (const listener of this.listeners) listener();
  }
  private positionKey(request: FocusRequest, command: string) {
    return JSON.stringify([request.revision, request.engineId, command]);
  }
  private key(request: FocusRequest) {
    return JSON.stringify([
      request.revision,
      request.engineId,
      request.positions.map((position) => [position.command, position.fen]),
    ]);
  }
  matches(request: FocusRequest) {
    return (
      this.request?.review === request.review &&
      this.key(this.request) === this.key(request)
    );
  }
  has(request: FocusRequest) {
    return this.cache.get(request.review)?.has(this.key(request)) ?? false;
  }
  isUnavailable(request: FocusRequest) {
    return (
      this.cache.get(request.review)?.get(this.key(request))?.unavailable ??
      false
    );
  }
  resultFor(request: FocusRequest, position: ReviewPosition) {
    return (
      this.positions
        .get(request.review)
        ?.get(this.positionKey(request, position.command)) ?? null
    );
  }
  stop() {
    ++this.generation;
    this.abort?.abort();
    this.abort = undefined;
    void this.search?.stop();
    this.search = undefined;
    if (this.state === "running") {
      this.state = "stopped";
      this.publish();
    }
  }
  async analyse(
    request: FocusRequest,
    factory: EngineFactory,
  ): Promise<ReviewResult[] | null> {
    this.stop();
    if (request.positions.length < 1 || request.positions.length > 2)
      throw new Error("Une vérification cible une ou deux positions.");
    const generation = this.generation;
    this.request = request;
    const cache = this.cache.get(request.review) ?? new Map<string, Entry>();
    const positions =
      this.positions.get(request.review) ?? new Map<string, ReviewResult>();
    this.cache.set(request.review, cache);
    this.positions.set(request.review, positions);
    const key = this.key(request),
      cached = cache.get(key);
    this.error = "";
    this.total = request.positions.length;
    this.completed = 0;
    if (cached) {
      this.state = cached.unavailable ? "unavailable" : "complete";
      this.completed = this.total;
      this.publish();
      return generation === this.generation ? cached.results : null;
    }
    this.state = "running";
    const abort = new AbortController(),
      search = new LiveStudy();
    this.abort = abort;
    this.search = search;
    this.publish();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      abort.signal.addEventListener(
        "abort",
        () => reject(new Error("Vérification interrompue.")),
        { once: true },
      );
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Le moteur n’a pas terminé la vérification dans le délai prévu.",
            ),
          ),
        this.deadline,
      );
    });
    // Une paire peut être entièrement en cache : l’annulation reste alors
    // consommée même si aucun Promise.race n’a été nécessaire.
    void interrupted.catch(() => {});
    const current = () =>
      generation === this.generation && !abort.signal.aborted;
    try {
      const results: ReviewResult[] = [];
      for (const position of request.positions) {
        if (!current()) return null;
        let result =
          positions.get(this.positionKey(request, position.command)) ?? null;
        if (!result) {
          await Promise.race([
            search.analyse(position.command, factory, this.budget),
            interrupted,
          ]);
          if (!current()) return null;
          if (search.state === "error") throw new Error(search.error);
          result = search.result;
        }
        if (!usableResult(position, result)) {
          cache.set(key, { results: null, unavailable: true });
          while (cache.size > 64) cache.delete(cache.keys().next().value!);
          this.state = "unavailable";
          this.publish();
          return null;
        }
        results.push(result);
        this.completed++;
        this.publish();
      }
      if (!current()) return null;
      // Publier et mémoriser seulement un ensemble complet : une moitié de
      // comparaison abandonnée ne doit pas servir à un nouveau verdict.
      cache.set(key, { results, unavailable: false });
      request.positions.forEach((position, index) =>
        positions.set(
          this.positionKey(request, position.command),
          results[index],
        ),
      );
      while (cache.size > 64) cache.delete(cache.keys().next().value!);
      while (positions.size > 128)
        positions.delete(positions.keys().next().value!);
      this.state = "complete";
      this.publish();
      return current() ? results : null;
    } catch (error) {
      if (current()) {
        this.state = "error";
        this.error =
          error instanceof Error ? error.message : "Vérification indisponible.";
        this.publish();
      }
      return null;
    } finally {
      clearTimeout(timeout);
      void search.stop();
      if (generation === this.generation) {
        this.abort = undefined;
        this.search = undefined;
      }
    }
  }
}
