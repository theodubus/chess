import type { EngineFactory } from "../../GameController";
import type { Category } from "../annotations";
import { confirmedConsequence, type ConfirmedConsequence } from "../directExplanation";
import type { ReviewPosition, ReviewResult } from "../model";
import type { VerificationIdentity } from "./BoundedVerification";
import { UnderstandingAnalysis } from "./UnderstandingAnalysis";
import { TacticalEffectVerification } from "./TacticalVerification";
import { RelationVerification } from "./RelationVerification";
import { tacticalDraft } from "./tacticalDraft";
import { relationDraft } from "./relationDraft";
import type { PedagogicalDraft } from "./draftModel";
import type { RelationDraft } from "./relationDraft";
import type { WorkPhase } from "./work";

export type PedagogicalRequest = VerificationIdentity & {
  position: ReviewPosition;
  result: ReviewResult | null;
  category: Category;
};
export type PedagogicalResult = {
  status: "supported" | "unconfirmed" | "unavailable";
  consequence: ConfirmedConsequence | null;
  attempts: number;
  searches: number;
  elapsedMs: number;
};
export const adverseCategory = (category: Category | undefined) =>
  !!category && ["inaccuracy", "mistake", "blunder", "miss"].includes(category);
export function pedagogicalSignature(request: Omit<PedagogicalRequest, "review">) {
  // Une amélioration ciblée ne change pas toujours la révision de GameReview.
  // Sa PV et son score doivent néanmoins invalider résultat et démonstration.
  return JSON.stringify([request.revision, request.engineId, request.position, request.result, request.category]);
}
export function eligibleConsequence(request: PedagogicalRequest) {
  return adverseCategory(request.category) && !!request.position.played && !request.position.terminal &&
    request.result?.score?.kind === "cp" && !request.result.score.bound && Number.isFinite(request.result.score.value) &&
    !!request.result.bestMove && request.result.variation.length > 0;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Orchestration du seul coup consulté. Un délai commun couvre extraction et
 * recherches, et deux candidats au maximum évitent de multiplier les moteurs.
 * Les motifs ne modifient jamais la classification de la partie. */
export class PedagogicalAnalysis {
  private generation = 0;
  private extraction: UnderstandingAnalysis;
  private cancelVerification?: () => void;
  private request?: PedagogicalRequest;
  private cache = new WeakMap<object, Map<string, PedagogicalResult>>();
  private listeners = new Set<() => void>();
  state: "idle" | "extracting" | "verifying" | "complete" | "stopped" | "timed-out" | "error" = "idle";
  phase: WorkPhase = "context";
  candidate: "tactic" | "relation" | null = null;
  error = "";
  cached = false;
  constructor(private budgets: [number, number] = [300, 900], private deadlineMs = 12000, private cacheSize = 32) {
    if (!budgets.every((n) => Number.isFinite(n) && n > 0) || budgets[1] <= budgets[0] ||
      !Number.isFinite(deadlineMs) || deadlineMs <= 0 || !Number.isInteger(cacheSize) || cacheSize < 1)
      throw new Error("Limites pédagogiques invalides.");
    this.budgets = [...budgets];
    this.extraction = new UnderstandingAnalysis(8, deadlineMs, cacheSize);
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish() { for (const listener of this.listeners) listener(); }
  matches(request: PedagogicalRequest) {
    return this.request?.review === request.review && pedagogicalSignature(this.request) === pedagogicalSignature(request);
  }
  resultFor(request: PedagogicalRequest) { return this.cache.get(request.review)?.get(pedagogicalSignature(request)) ?? null; }
  stop() {
    this.generation++;
    this.extraction.stop();
    this.cancelVerification?.();
    this.cancelVerification = undefined;
    if (this.state === "extracting" || this.state === "verifying") { this.state = "stopped"; this.publish(); }
  }
  async analyse(input: PedagogicalRequest, factory: EngineFactory): Promise<PedagogicalResult | null> {
    this.stop();
    const generation = this.generation, start = performance.now();
    const request = { ...input, position: structuredClone(input.position), result: structuredClone(input.result) };
    this.request = request;
    this.cached = false; this.error = ""; this.phase = "context"; this.candidate = null;
    const key = pedagogicalSignature(request), cache = this.cache.get(request.review) ?? new Map<string, PedagogicalResult>();
    this.cache.set(request.review, cache);
    const cached = cache.get(key);
    if (cached) {
      this.cached = true; this.state = "complete"; this.publish();
      return generation === this.generation ? cached : null;
    }
    const expire = () => {
      if (generation !== this.generation) return;
      this.stop(); this.state = "timed-out"; this.publish();
    };
    const current = () => {
      if (generation !== this.generation) return false;
      if (performance.now() - start >= this.deadlineMs) { expire(); return false; }
      return true;
    };
    const finish = (status: PedagogicalResult["status"], consequence: ConfirmedConsequence | null, attempts: number, searches: number) => {
      if (!current()) return null;
      const result = freeze({ status, consequence, attempts, searches, elapsedMs: performance.now() - start });
      cache.set(key, result);
      while (cache.size > this.cacheSize) cache.delete(cache.keys().next().value!);
      this.state = "complete"; this.publish();
      return generation === this.generation ? result : null;
    };
    // Les coups forcés, théoriques, positifs ou sans PV exacte n'ouvrent jamais
    // de connexion. Un retry masqué est filtré encore plus tôt par la revue.
    if (!eligibleConsequence(request)) return finish("unconfirmed", null, 0, 0);
    const timer = setTimeout(expire, this.deadlineMs);
    const off = this.extraction.subscribe(() => {
      if (generation === this.generation && this.state === "extracting" && this.phase !== this.extraction.phase) {
        this.phase = this.extraction.phase; this.publish();
      }
    });
    let attempts = 0, searches = 0;
    try {
      this.state = "extracting"; this.publish();
      if (!current()) return null;
      const understanding = await this.extraction.analyse(request);
      if (!current()) return null;
      if (!understanding) {
        this.error = this.extraction.error;
        if (this.extraction.state === "timed-out") { expire(); return null; }
        return finish("unavailable", null, 0, 0);
      }
      const tactics = understanding.constraints.hypotheses.flatMap((h, index) =>
        h.role === "allows-loss" && ["double-threat", "pin"].includes(h.kind) ? [{ family: "tactic" as const, index, rank: h.kind === "double-threat" ? 0 : 1 }] : []);
      const relations = understanding.mechanisms.flatMap((h, index) =>
        h.role === "allows-loss" ? [{ family: "relation" as const, index, rank: h.kind === "defender-removal" ? 2 : 3 }] : []);
      const candidates = [...tactics, ...relations].sort((a, b) => a.rank - b.rank).slice(0, 2);
      for (const candidate of candidates) {
        if (!current()) return null;
        this.candidate = candidate.family; this.state = "verifying"; this.publish();
        if (!current()) return null;
        attempts++;
        // Un nouveau contenu de revue relance les contrôles. Seul le cache
        // extérieur (historique + PV + score + verdict) peut sauter ce travail.
        const remaining = this.deadlineMs - (performance.now() - start);
        let draft: PedagogicalDraft | RelationDraft | null;
        if (candidate.family === "tactic") {
          const checker = new TacticalEffectVerification(this.budgets, remaining);
          this.cancelVerification = () => checker.stop();
          const report = await checker.verify({ ...request, understanding, hypothesisIndex: candidate.index }, factory);
          if (!current()) return null;
          if (!report) {
            this.error = checker.error;
            if (checker.state === "timed-out") { expire(); return null; }
            return finish("unavailable", null, attempts, searches);
          }
          searches += report.searches;
          draft = tacticalDraft(understanding, report);
        } else {
          const checker = new RelationVerification(this.budgets, remaining);
          this.cancelVerification = () => checker.stop();
          const report = await checker.verifyEffect({ ...request, understanding, mechanismIndex: candidate.index }, factory);
          if (!current()) return null;
          if (!report) {
            this.error = checker.error;
            if (checker.state === "timed-out") { expire(); return null; }
            return finish("unavailable", null, attempts, searches);
          }
          searches += report.searches;
          draft = relationDraft(understanding, report);
        }
        if (draft) return finish("supported", confirmedConsequence(draft, request.position), attempts, searches);
      }
      return finish("unconfirmed", null, attempts, searches);
    } catch (error) {
      if (!current()) return null;
      this.error = error instanceof Error ? error.message : "Explication indisponible.";
      return finish("unavailable", null, attempts, searches);
    } finally {
      clearTimeout(timer); off();
      if (generation === this.generation) { this.cancelVerification?.(); this.cancelVerification = undefined; }
    }
  }
}
