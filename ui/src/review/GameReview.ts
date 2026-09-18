import { Chess } from "chess.js";
import type { EngineFactory } from "../GameController";
import { UciSession } from "../engine/UciSession";
import type { SearchInfo } from "../engine/analysis";
import {
  classifyMove,
  verificationPositions,
  moveFacts,
  withMoveFacts,
} from "./annotations";
import {
  frenchSan,
  gamePositions,
  legalVariation,
  type ReviewResult,
} from "./model";

/** Une copie de la partie et une session UCI indépendante de la partie jouée. */
export class GameReview {
  readonly positions;
  readonly facts;
  results: (ReviewResult | null)[];
  state: "idle" | "running" | "stopped" | "complete" | "error" = "idle";
  error = "";
  engineName = "";
  current = 0;
  liveDepth: number | null = null;
  phase: "positions" | "verification" | "resolution" = "positions";
  verificationTotal = 0;
  verified = new Set<number>();
  resolutionTotal = 0;
  resolvedPositions = 0;
  get unclassifiedCount() {
    return this.annotations.filter(
      (annotation, index) => this.positions[index].played && !annotation,
    ).length;
  }
  get annotations() {
    return this.positions.map((_, index) =>
      withMoveFacts(
        classifyMove(
          this.positions,
          this.results,
          index,
          this.verified.has(index) &&
            (this.verified.has(index + 1) ||
              !!this.positions[index + 1]?.terminal),
        ),
        this.facts[index],
      ),
    );
  }
  private generation = 0;
  private session?: UciSession;
  private rejectReady?: (reason: Error) => void;
  private listeners = new Set<() => void>();

  constructor(pgn: string) {
    this.positions = gamePositions(pgn);
    this.facts = this.positions.map(moveFacts);
    this.results = this.positions.map(() => null);
  }
  get completed() {
    return this.results.filter(Boolean).length;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    for (const listener of this.listeners) listener();
  }

  async start(factory: EngineFactory, budgetMs: number) {
    if (![100, 250, 500, 1000, 3000].includes(budgetMs))
      throw new Error("Budget d’analyse invalide.");
    const generation = ++this.generation;
    const previous = this.session;
    this.rejectReady?.(new Error("Analyse remplacée."));
    this.rejectReady = undefined;
    this.session = undefined;
    this.state = "running";
    this.error = "";
    this.engineName = "";
    this.current = 0;
    this.liveDepth = null;
    this.phase = "positions";
    this.verificationTotal = 0;
    this.resolutionTotal = 0;
    this.resolvedPositions = 0;
    this.verified.clear();
    this.results = this.positions.map(() => null);
    this.publish();
    let session: UciSession | undefined;
    try {
      await previous?.dispose();
      if (generation !== this.generation) return;
      let connectionError = "";
      const engine = await factory((message) => {
        if (generation !== this.generation) return;
        connectionError = message;
        session?.fail(message);
      });
      if (generation !== this.generation || connectionError) {
        await engine.dispose();
        if (connectionError) throw new Error(connectionError);
        return;
      }
      let latest: SearchInfo | null = null;
      await new Promise<void>((resolve, reject) => {
        this.rejectReady = reject;
        session = new UciSession(engine, (snapshot) => {
          if (generation !== this.generation) return;
          this.engineName = snapshot.name;
          latest = snapshot.analysis;
          this.liveDepth = snapshot.analysis?.depth ?? null;
          if (snapshot.state === "error") reject(new Error(snapshot.error));
          if (snapshot.state === "ready") resolve();
          this.publish();
        });
        this.session = session;
        session.start();
      });
      this.rejectReady = undefined;
      if (generation !== this.generation) return;
      const analyse = async (index: number, time: number) => {
        if (generation !== this.generation) return;
        const position = this.positions[index];
        this.current = index;
        this.liveDepth = null;
        this.publish();
        if (position.terminal) {
          this.results[index] = {
            score: position.terminal,
            depth: null,
            bestMove: null,
            bestSan: null,
            variation: [],
          };
        } else {
          const bestMove = await session!.search(
            position.command,
            time,
            position.turn,
          );
          if (generation !== this.generation) return;
          const move = new Chess(position.fen)
            .moves({ verbose: true })
            .find(
              (move) =>
                move.from + move.to + (move.promotion ?? "") === bestMove,
            );
          if (!move)
            throw new Error(
              `Coup invalide reçu à la position ${index} : ${bestMove}`,
            );
          // TypeScript ne suit pas l'affectation asynchrone de latest dans l'abonnement.
          const info = latest as SearchInfo | null;
          const pv = info?.pv?.[0] === bestMove ? info.pv : [bestMove];
          const variation = legalVariation(position.fen, pv);
          this.results[index] = {
            score: info?.score ?? null,
            depth: info?.depth ?? null,
            bestMove,
            bestSan: frenchSan(move.san),
            variation: variation.length
              ? variation
              : legalVariation(position.fen, [bestMove]),
          };
        }
        this.publish();
      };
      for (let index = 0; index < this.positions.length; index++) {
        await analyse(index, budgetMs);
        if (generation !== this.generation) return;
      }
      const verification = verificationPositions(this.positions, this.results);
      this.phase = "verification";
      this.verificationTotal = verification.length;
      this.publish();
      // Une seule passe de confirmation ; le budget reste borné par position.
      for (const index of verification) {
        await analyse(index, Math.min(6000, Math.max(1000, budgetMs * 2)));
        if (generation !== this.generation) return;
        this.verified.add(index);
        this.publish();
      }
      // Recalculer les deux côtés des coups encore inconnus, sans boucle infinie.
      // Deux vagues bornées permettent aussi de traiter une incohérence déplacée
      // sur un coup voisin par l'amélioration d'une évaluation partagée.
      for (const time of [
        Math.max(3000, budgetMs * 4),
        Math.max(6000, budgetMs * 8),
      ]) {
        const unresolved = new Set<number>();
        this.annotations.forEach((annotation, index) => {
          if (!this.positions[index].played || annotation) return;
          for (const candidate of [index, index + 1])
            if (
              this.positions[candidate] &&
              !this.positions[candidate].terminal
            )
              unresolved.add(candidate);
        });
        if (!unresolved.size) break;
        this.phase = "resolution";
        this.resolutionTotal = unresolved.size;
        this.resolvedPositions = 0;
        this.publish();
        for (const index of [...unresolved].sort((a, b) => a - b)) {
          await analyse(index, Math.min(12000, time));
          if (generation !== this.generation) return;
          this.verified.add(index);
          this.resolvedPositions++;
          this.publish();
        }
      }
      if (generation !== this.generation) return;
      this.state = "complete";
      this.publish();
    } catch (error) {
      if (generation === this.generation) {
        this.state = "error";
        this.error =
          error instanceof Error ? error.message : "Analyse impossible.";
        this.publish();
      }
    } finally {
      await session?.dispose();
      if (generation === this.generation) {
        this.session = undefined;
        this.rejectReady = undefined;
      }
    }
  }

  async stop() {
    ++this.generation;
    this.rejectReady?.(new Error("Analyse interrompue."));
    this.rejectReady = undefined;
    const session = this.session;
    this.session = undefined;
    if (this.state === "running") {
      this.state = "stopped";
      this.publish();
    }
    await session?.dispose();
  }
}
