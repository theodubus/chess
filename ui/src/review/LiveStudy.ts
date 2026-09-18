import type { EngineFactory } from "../GameController";
import { UciSession } from "../engine/UciSession";
import type { SearchInfo } from "../engine/analysis";
import { boardFromCommand } from "./StudyTree";
import { frenchSan, legalVariation, type ReviewResult } from "./model";

/** Une recherche annulable, indépendante de la revue et des coups réellement joués. */
export class LiveStudy {
  command = "";
  state: "idle" | "running" | "complete" | "error" = "idle";
  result: ReviewResult | null = null;
  info: SearchInfo | null = null;
  error = "";
  private generation = 0;
  private session?: UciSession;
  private rejectReady?: (error: Error) => void;
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    for (const listener of this.listeners) listener();
  }
  async stop() {
    ++this.generation;
    this.rejectReady?.(new Error("Recherche annulée."));
    this.rejectReady = undefined;
    const session = this.session;
    this.session = undefined;
    this.state = "idle";
    this.info = null;
    this.result = null;
    this.command = "";
    this.publish();
    await session?.dispose();
  }
  async analyse(command: string, factory: EngineFactory, budget = 1500) {
    const stopping = this.stop();
    const generation = this.generation;
    this.command = command;
    this.state = "running";
    this.error = "";
    this.publish();
    let session: UciSession | undefined;
    try {
      await stopping;
      if (generation !== this.generation) return;
      const board = boardFromCommand(command);
      if (board.isGameOver()) {
        this.result = {
          score: board.isCheckmate()
            ? {
                kind: "mate",
                value: 0,
                winner: board.turn() === "w" ? "b" : "w",
              }
            : { kind: "cp", value: 0 },
          depth: null,
          bestMove: null,
          bestSan: null,
          variation: [],
        };
        this.state = "complete";
        this.publish();
        return;
      }
      let connectionError = "";
      const engine = await factory((message) => {
        if (generation === this.generation) {
          connectionError = message;
          session?.fail(message);
        }
      });
      if (generation !== this.generation || connectionError) {
        await engine.dispose();
        if (connectionError) throw new Error(connectionError);
        return;
      }
      await new Promise<void>((resolve, reject) => {
        this.rejectReady = reject;
        session = new UciSession(engine, (snapshot) => {
          if (generation !== this.generation) return;
          this.info = snapshot.analysis;
          if (snapshot.state === "ready") resolve();
          if (snapshot.state === "error") reject(new Error(snapshot.error));
          this.publish();
        });
        this.session = session;
        session.start();
      });
      this.rejectReady = undefined;
      if (generation !== this.generation) return;
      const bestMove = await session!.search(command, budget, board.turn());
      if (generation !== this.generation) return;
      const move = board
        .moves({ verbose: true })
        .find(
          (move) => move.from + move.to + (move.promotion ?? "") === bestMove,
        );
      if (!move)
        throw new Error(
          "Le moteur a proposé un coup illégal dans cette variante.",
        );
      const info = this.info as SearchInfo | null;
      this.result = {
        score: info?.score ?? null,
        depth: info?.depth ?? null,
        bestMove,
        bestSan: frenchSan(move.san),
        variation: legalVariation(
          board.fen(),
          info?.pv?.[0] === bestMove ? info.pv : [bestMove],
        ),
      };
      this.state = "complete";
      this.publish();
    } catch (error) {
      if (generation === this.generation) {
        this.error =
          error instanceof Error ? error.message : "Analyse indisponible.";
        this.state = "error";
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
}
