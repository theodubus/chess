import type { EngineFactory } from "../../GameController";
import { FocusedAnalysis } from "../FocusedAnalysis";
import type { ReviewPosition, ReviewResult } from "../model";

export type Question<P extends string = string> = {
  purpose: P;
  position: ReviewPosition;
  result: ReviewResult;
};
export type VerificationCost = {
  cached: boolean;
  elapsedMs: number;
  searches: number;
  requestedSearchMs: number;
};
export type VerificationIdentity = {
  review: object;
  revision: number;
  engineId: string;
};
export type PassQueries<P extends string> = {
  budgetMs: number;
  questions: Question<P>[];
  ask: (purpose: P, position: ReviewPosition) => Promise<ReviewResult | null>;
};

/** Les familles de causes partagent arrêt, budgets, cache et contrôle d'horloge.
 * Chaque budget garde son cache propre ; aucune passe longue ne réutilise la courte. */
export class BoundedVerification<
  Pass,
  Report extends object,
  Purpose extends string,
> {
  private generation = 0;
  private focuses: FocusedAnalysis[];
  private cache = new WeakMap<object, Map<string, Report & VerificationCost>>();
  state: "idle" | "running" | "complete" | "stopped" | "timed-out" | "error" =
    "idle";
  error = "";
  constructor(
    private budgets: [number, number] = [300, 900],
    private deadline = 12000,
  ) {
    if (
      !budgets.every((n) => Number.isFinite(n) && n > 0) ||
      budgets[1] <= budgets[0] ||
      !Number.isFinite(deadline) ||
      deadline <= 0
    )
      throw new Error("Budgets invalides.");
    this.budgets = [...budgets];
    this.focuses = budgets.map(
      (budget) => new FocusedAnalysis(budget, deadline),
    );
  }
  stop() {
    this.generation++;
    this.focuses.forEach((focus) => focus.stop());
    if (this.state === "running") this.state = "stopped";
  }
  protected async run(
    identity: VerificationIdentity,
    mechanismKey: string,
    factory: EngineFactory,
    passFor: (queries: PassQueries<Purpose>) => Promise<Pass | null>,
    reportFor: (passes: Pass[]) => Report,
  ): Promise<(Report & VerificationCost) | null> {
    this.stop();
    const generation = this.generation,
      start = performance.now();
    const key = JSON.stringify([
      identity.revision,
      identity.engineId,
      mechanismKey,
    ]);
    const cache =
      this.cache.get(identity.review) ??
      new Map<string, Report & VerificationCost>();
    this.cache.set(identity.review, cache);
    this.error = "";
    const cached = cache.get(key);
    if (cached) {
      this.state = "complete";
      return {
        ...structuredClone(cached),
        cached: true,
        searches: 0,
        requestedSearchMs: 0,
        elapsedMs: 0,
      };
    }
    this.state = "running";
    const timer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.stop();
      this.state = "timed-out";
    }, this.deadline);
    // Un calcul synchrone peut dépasser le délai avant que le timer soit appelé.
    const current = () => {
      if (generation !== this.generation) return false;
      if (performance.now() - start >= this.deadline) {
        this.stop();
        this.state = "timed-out";
        return false;
      }
      return true;
    };
    let searches = 0,
      requestedSearchMs = 0;
    const passes: Pass[] = [];
    try {
      for (const [index, budgetMs] of this.budgets.entries()) {
        const focus = this.focuses[index],
          questions: Question<Purpose>[] = [];
        const ask = async (purpose: Purpose, position: ReviewPosition) => {
          if (!current()) return null;
          const query = { ...identity, positions: [position] };
          if (!position.terminal && !focus.resultFor(query, position)) {
            searches++;
            requestedSearchMs += budgetMs;
          }
          const results = await focus.analyse(query, factory);
          if (!current()) return null;
          if (!results)
            throw new Error(
              `${purpose} : ${focus.error || "Réponse moteur sans score exact ou variante exploitable."}`,
            );
          questions.push({ purpose, position, result: results[0] });
          return results[0];
        };
        const pass = await passFor({ budgetMs, questions, ask });
        if (!current() || !pass) return null;
        passes.push(pass);
      }
      const report = {
        ...reportFor(passes),
        cached: false,
        elapsedMs: performance.now() - start,
        searches,
        requestedSearchMs,
      };
      if (!current()) return null;
      cache.set(key, structuredClone(report));
      while (cache.size > 32) cache.delete(cache.keys().next().value!);
      this.state = "complete";
      return structuredClone(report);
    } catch (error) {
      if (generation === this.generation) {
        this.error =
          error instanceof Error ? error.message : "Vérification indisponible.";
        this.state = "error";
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
