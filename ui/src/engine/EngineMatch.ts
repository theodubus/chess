import { Chess } from "chess.js";
import type { EngineFactory } from "../GameController";
import type { ClockBudget } from "../GameClock";
import type { Side } from "./analysis";
import type { EngineOptions } from "./options";
import { UciSession, type SessionSnapshot } from "./UciSession";

export type MatchPlayers = Record<Side, {
  factory: EngineFactory;
  options: EngineOptions;
}>;
type MatchCallbacks = {
  board: () => Chess;
  position: () => string;
  budget: () => ClockBudget;
  play: (uci: string, name: string) => void;
  ready: () => void;
  update: (snapshot: SessionSnapshot) => void;
  failed: () => void;
};
const emptySnapshot = (): SessionSnapshot => ({
  state: "connecting", name: "", error: "", log: [], analysis: null,
});

/** Deux processus indépendants ; seuls leurs coups UCI traversent la frontière du match. */
export class EngineMatch {
  readonly snapshots: Record<Side, SessionSnapshot> = {
    w: emptySnapshot(), b: emptySnapshot(),
  };
  private sessions: Partial<Record<Side, UciSession>> = {};
  private rejectReady: Partial<Record<Side, (error: Error) => void>> = {};
  private predictions: Partial<Record<Side, string>> = {};
  private prepared = false;
  private disposed = false;
  private closing?: Promise<void>;
  constructor(
    private players: MatchPlayers,
    private callbacks: MatchCallbacks,
  ) {}

  private publish() {
    if (this.disposed) return;
    const active = this.snapshots[this.callbacks.board().turn()];
    this.callbacks.update({
      ...active,
      state: this.prepared ? active.state : "connecting",
      analysis: this.prepared ? active.analysis : null,
    });
  }
  async start() {
    try {
      await Promise.all((["w", "b"] as const).map(side => this.connect(side)));
      if (this.disposed) return;
      this.prepared = true;
      this.callbacks.ready();
      this.publish();
      void this.playLoop();
    } catch {
      // La connexion défaillante publie l'erreur et ferme aussi l'autre moteur.
    }
  }
  private async connect(side: Side) {
    try {
      const engine = await this.players[side].factory(message => {
        if (this.disposed) return;
        if (this.sessions[side]) this.sessions[side]!.fail(message);
        else this.fail(side, message);
      });
      if (this.disposed) {
        await engine.dispose();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        this.rejectReady[side] = reject;
        const session = new UciSession(engine, snapshot => {
          if (this.disposed) return;
          this.snapshots[side] = snapshot;
          if (snapshot.state === "error") {
            reject(new Error(snapshot.error));
            this.fail(side, snapshot.error);
            return;
          }
          if (snapshot.state === "ready") {
            delete this.rejectReady[side];
            resolve();
          }
          this.publish();
        }, 5000, this.players[side].options);
        this.sessions[side] = session;
        session.start();
      });
    } catch (error) {
      this.fail(side, error instanceof Error ? error.message : "Connexion impossible.");
      throw error;
    }
  }
  private fail(side: Side, message: string) {
    if (this.disposed) return;
    this.callbacks.update({
      ...this.snapshots[side], state: "error", analysis: null,
      error: `${side === "w" ? "Blancs" : "Noirs"} : ${message}`,
    });
    this.callbacks.failed();
    void this.dispose();
  }
  private async playLoop() {
    let side = this.callbacks.board().turn();
    try {
      while (!this.disposed && !this.callbacks.board().isGameOver()) {
        side = this.callbacks.board().turn();
        const session = this.sessions[side]!;
        const fen = this.callbacks.board().fen();
        const predicted = this.predictions[side];
        delete this.predictions[side];
        let uci: string;
        const actual = this.callbacks.board().history({ verbose: true }).at(-1)?.lan;
        if (predicted && actual === predicted)
          uci = await session.ponderHit();
        else {
          if (predicted) await session.cancelPonder();
          if (this.disposed) return;
          uci = await session.search(this.callbacks.position(), () => this.callbacks.budget(), side);
        }
        if (this.disposed || this.callbacks.board().fen() !== fen) return;
        this.callbacks.play(uci, this.snapshots[side].name || "Moteur UCI");
        if (this.disposed || this.callbacks.board().isGameOver()) break;
        this.startPonder(side, session);
      }
      if (!this.disposed) {
        this.callbacks.update({ ...this.snapshots[side], state: "closed" });
        await this.dispose();
      }
    } catch (error) {
      this.fail(side, error instanceof Error ? error.message : "Réponse moteur invalide.");
    }
  }
  private startPonder(side: Side, session: UciSession) {
    const predicted = session.ponderMove;
    if (!this.players[side].options.ponder || !predicted) return;
    const future = new Chess(this.callbacks.board().fen());
    const move = future.moves({ verbose: true }).find(move => move.lan === predicted);
    if (!move) return;
    future.move(move);
    if (future.isGameOver()) return;
    this.predictions[side] = predicted;
    const position = this.callbacks.position();
    session.ponder(position + (position.includes(" moves ") ? " " : " moves ") + predicted, () => {
      const budget = this.callbacks.budget();
      // Le coup anticipé n'est pas encore joué : ajouter seulement son incrément virtuel.
      const opponent = side === "w" ? "b" : "w";
      if (this.callbacks.board().turn() === opponent) {
        if (opponent === "w") budget.wtime += budget.winc;
        else budget.btime += budget.binc;
      }
      return budget;
    }, side);
  }
  dispose() {
    if (this.closing) return this.closing;
    this.disposed = true;
    for (const reject of Object.values(this.rejectReady)) reject(new Error("Match interrompu."));
    this.rejectReady = {};
    this.closing = Promise.allSettled(
      Object.values(this.sessions).map(session => session.dispose()),
    ).then(() => {});
    return this.closing;
  }
}
