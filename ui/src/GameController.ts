import { Chess } from "chess.js";
import type { Key } from "@lichess-org/chessground/types";
import { LocalGame, type Promotion } from "./game";
import { GameClock, type TimeControl, type ClockState } from "./GameClock";
import type { Engine } from "./engine/Engine";
import type { Side } from "./engine/analysis";
import { UciSession, type SessionSnapshot } from "./engine/UciSession";

export type GameOutcome = {
  reason: "checkmate" | "draw" | "timeout" | "resignation";
  winner: Side | null;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
};

type RecordedMove = {
  color: Side;
  move: { from: string; to: string; promotion?: string };
  before: ClockState;
  after: ClockState;
  player: string;
};

export type EngineFactory = (
  onFailure: (message: string) => void,
) => Promise<Engine>;

/** Coordonne la partie sans connaître le transport du moteur. */
export class GameController {
  readonly game = new LocalGame();
  readonly clock: GameClock;
  timeResult = "";
  snapshot: SessionSnapshot | null = null;
  mode: "local" | "fake" | null = null;
  readonly humanSide: Side;
  private startRequested = false;
  private disposed = false;
  private resigned: Side | null = null;
  private played: RecordedMove[] = [];
  private redos: RecordedMove[][] = [];
  private date = new Date();
  private session?: UciSession;
  private factory?: EngineFactory;
  private generation = 0;
  private searching = false;
  private listeners = new Set<() => void>();

  constructor(
    options: {
      timeControl?: TimeControl;
      now?: () => number;
      humanSide?: Side;
    } = {},
  ) {
    this.clock = new GameClock(options.timeControl, options.now);
    this.humanSide = options.humanSide ?? "w";
  }

  get finished() {
    return (
      this.game.chess.isGameOver() ||
      this.clock.flagged !== null ||
      this.resigned !== null
    );
  }
  get outcome(): GameOutcome | null {
    const winner = this.resigned
      ? this.resigned === "w"
        ? "b"
        : "w"
      : this.game.chess.isCheckmate()
        ? this.game.chess.turn() === "w"
          ? "b"
          : "w"
        : null;
    if (this.resigned)
      return {
        reason: "resignation",
        winner,
        result: winner === "w" ? "1-0" : "0-1",
      };
    if (this.clock.flagged)
      return { reason: "timeout", winner: null, result: "*" };
    if (winner)
      return {
        reason: "checkmate",
        winner,
        result: winner === "w" ? "1-0" : "0-1",
      };
    if (this.game.chess.isDraw())
      return { reason: "draw", winner: null, result: "1/2-1/2" };
    return null;
  }
  get status() {
    return this.resigned
      ? `Abandon · Les ${this.resigned === "w" ? "Noirs" : "Blancs"} gagnent`
      : this.timeResult || this.game.status;
  }
  async start(factory?: EngineFactory) {
    this.startRequested = true;
    if (factory) await this.connect("local", factory);
    else {
      this.clock.start("w");
      this.publish();
    }
  }
  async reconnect() {
    if (this.mode && this.factory && !this.finished)
      await this.connect(this.mode, this.factory);
  }
  resign() {
    this.tick();
    if (this.finished) return;
    this.resigned = this.mode ? this.humanSide : this.game.chess.turn();
    this.clock.pause();
    this.game.pending = null;
    ++this.generation;
    this.searching = false;
    const session = this.session;
    this.session = undefined;
    if (this.snapshot) this.snapshot = { ...this.snapshot, state: "closed" };
    this.publish();
    void session?.dispose();
  }
  async dispose() {
    this.disposed = true;
    ++this.generation;
    this.clock.pause();
    const session = this.session;
    this.session = undefined;
    this.searching = false;
    await session?.dispose();
  }

  get canChangeTimeControl() {
    return !this.clock.started && this.game.chess.history().length === 0;
  }

  setTimeControl(control: TimeControl) {
    if (!this.canChangeTimeControl) return;
    this.clock.reset(control);
    this.redos = [];
    this.publish();
  }

  tick() {
    this.clock.update();
    if (!this.clock.flagged || this.timeResult) return;
    this.timeResult = `Temps écoulé · ${this.clock.flagged === "w" ? "Blancs" : "Noirs"}`;
    this.game.pending = null;
    ++this.generation;
    const session = this.session;
    this.session = undefined;
    this.searching = false;
    if (this.snapshot)
      this.snapshot = { ...this.snapshot, state: "closed", analysis: null };
    void session?.dispose();
    this.publish();
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

  get canMove() {
    return (
      !this.disposed &&
      !this.finished &&
      (!this.mode ||
        (this.snapshot?.state === "ready" &&
          !this.searching &&
          this.game.chess.turn() === this.humanSide))
    );
  }

  move(from: Key, to: Key) {
    this.tick();
    if (!this.canMove) return false;
    const color = this.game.chess.turn();
    const before = this.clock.capture();
    const moved = this.game.move(from, to);
    if (moved) {
      this.clock.start(color);
      if (!this.game.pending) {
        this.clock.completeMove(color, this.game.chess.isGameOver());
        this.recordMove(before, "Joueur local");
      }
    }
    this.publish();
    void this.requestEngineMove();
    return moved;
  }
  promote(piece: Promotion) {
    this.tick();
    if (!this.canMove || !this.game.pending) return;
    const color = this.game.chess.turn();
    const before = this.clock.capture();
    this.game.promote(piece);
    this.clock.completeMove(color, this.game.chess.isGameOver());
    this.recordMove(before, "Joueur local");
    this.publish();
    void this.requestEngineMove();
  }
  cancelPromotion() {
    this.game.pending = null;
    this.publish();
  }

  async connect(mode: "local" | "fake", factory: EngineFactory) {
    this.tick();
    this.clock.pause();
    const generation = ++this.generation;
    const old = this.session;
    this.session = undefined;
    this.searching = false;
    this.mode = mode;
    this.factory = factory;
    this.game.pending = null;
    this.snapshot = {
      state: "connecting",
      name: "",
      error: "",
      log: [],
      analysis: null,
    };
    this.publish();
    await old?.dispose();
    if (generation !== this.generation) return;
    try {
      const engine = await factory((message) => {
        if (generation !== this.generation) return;
        if (this.session) this.session.fail(message);
        else this.connectionError(message);
      });
      if (generation !== this.generation || this.snapshot?.state === "error") {
        await engine.dispose();
        return;
      }
      let initialized = false;
      this.session = new UciSession(engine, (snapshot) => {
        if (generation !== this.generation) return;
        this.snapshot = snapshot;
        if (snapshot.state === "error") {
          this.game.pending = null;
          this.clock.pause();
          this.tick();
        }
        this.publish();
        if (!initialized && snapshot.state === "ready") {
          initialized = true;
          if (!this.finished) {
            if (this.startRequested) this.clock.start(this.game.chess.turn());
            this.clock.resume(this.game.chess.turn());
          }
          void this.requestEngineMove();
        }
      });
      this.session.start();
    } catch (error) {
      if (generation === this.generation)
        this.connectionError(
          error instanceof Error ? error.message : "Connexion impossible.",
        );
    }
  }

  private connectionError(message: string) {
    this.game.pending = null;
    this.clock.pause();
    this.tick();
    this.snapshot = {
      state: "error",
      name: this.snapshot?.name ?? "",
      error: message,
      log: this.snapshot?.log ?? [],
      analysis: null,
    };
    this.publish();
  }

  private async requestEngineMove() {
    if (
      !this.mode ||
      !this.session ||
      this.snapshot?.state !== "ready" ||
      this.searching ||
      this.game.pending ||
      this.game.chess.turn() === this.humanSide ||
      this.finished
    )
      return;
    const generation = this.generation;
    const session = this.session;
    const fen = this.game.chess.fen();
    const moves = this.game.chess
      .history({ verbose: true })
      .map((move) => move.from + move.to + (move.promotion ?? ""));
    this.searching = true;
    try {
      const uci = await session.search(
        `position startpos${moves.length ? ` moves ${moves.join(" ")}` : ""}`,
        () => {
          this.tick();
          if (this.finished) throw new Error("Partie terminée.");
          return this.clock.budget();
        },
        this.game.chess.turn(),
      );
      this.tick();
      // Les réponses d'une connexion remplacée ne doivent jamais toucher la nouvelle partie.
      if (generation !== this.generation || this.game.chess.fen() !== fen)
        return;
      const move = this.game.chess
        .moves({ verbose: true })
        .find((move) => move.from + move.to + (move.promotion ?? "") === uci);
      if (!move)
        throw new Error(
          `Le moteur a renvoyé un coup illégal : ${uci}. Partie suspendue.`,
        );
      const before = this.clock.capture();
      this.game.chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });
      this.clock.completeMove(move.color, this.game.chess.isGameOver());
      this.recordMove(before, this.snapshot?.name || "Moteur UCI");
    } catch (error) {
      if (generation === this.generation)
        session.fail(
          error instanceof Error
            ? error.message
            : "Réponse du moteur invalide.",
        );
    } finally {
      if (generation === this.generation) {
        this.searching = false;
        this.publish();
      }
    }
  }

  private recordMove(before: ClockState, player: string) {
    const last = this.game.chess.history({ verbose: true }).at(-1)!;
    this.played.push({
      color: last.color,
      move: { from: last.from, to: last.to, promotion: last.promotion },
      before,
      after: this.clock.capture(),
      player,
    });
    this.redos = [];
  }

  get canUndo() {
    return (
      this.game.pending !== null ||
      (this.mode
        ? this.played.some((entry) => entry.color === this.humanSide)
        : this.played.length > 0)
    );
  }
  get canRedo() {
    return !this.game.pending && this.redos.length > 0;
  }

  undo() {
    if (this.game.pending) {
      this.cancelPromotion();
      return;
    }
    if (!this.canUndo) return;
    const lastHuman = this.played
      .map((entry) => entry.color)
      .lastIndexOf(this.humanSide);
    const count = this.mode ? this.played.length - lastHuman : 1;
    const batch = this.played.splice(-count);
    for (let index = 0; index < count; index++) this.game.chess.undo();
    this.redos.push(batch);
    this.clock.restore(batch[0].before);
    this.restorePosition();
  }

  redo() {
    if (!this.canRedo) return;
    const batch = this.redos.pop()!;
    for (const entry of batch) {
      this.game.chess.move(entry.move);
      this.played.push(entry);
    }
    this.clock.restore(batch.at(-1)!.after);
    this.restorePosition();
  }

  private restorePosition() {
    this.game.pending = null;
    this.timeResult = "";
    this.resigned = null;
    // Remplacer la session annule la recherche et les évaluations de l'ancienne ligne.
    if (this.mode && this.factory) void this.connect(this.mode, this.factory);
    else {
      this.snapshot = null;
      this.publish();
    }
  }

  exportPgn(): string {
    this.tick();
    // Construire une copie évite de modifier les en-têtes ou l'état de la partie jouée.
    const exported = new Chess();
    for (const move of this.game.chess.history({ verbose: true }))
      exported.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });
    const playerName = (color: Side) => {
      const names = [
        ...new Set(
          this.played
            .filter((entry) => entry.color === color)
            .map((entry) => entry.player),
        ),
      ];
      return names.length
        ? names.join(" / ")
        : this.mode && color !== this.humanSide
          ? this.snapshot?.name || "Moteur UCI"
          : "Joueur local";
    };
    const result = this.outcome?.result ?? "*";
    const date = `${this.date.getFullYear()}.${String(this.date.getMonth() + 1).padStart(2, "0")}.${String(this.date.getDate()).padStart(2, "0")}`;
    const headers = {
      Event: "Partie amicale",
      Site: "ShallowRed UI",
      Date: date,
      Round: "-",
      White: playerName("w"),
      Black: playerName("b"),
      Result: result,
      TimeControl: `${this.clock.control.initialMs / 1000}+${this.clock.control.incrementMs / 1000}`,
      Termination: this.clock.flagged
        ? "time forfeit"
        : this.finished
          ? "normal"
          : "unterminated",
    };
    for (const [key, value] of Object.entries(headers))
      exported.setHeader(key, value.replace(/["\\\r\n]/g, " ").trim());
    if (this.resigned)
      exported.setComment(
        `Abandon des ${this.resigned === "w" ? "Blancs" : "Noirs"}.`,
      );
    if (this.timeResult)
      exported.setComment(`${this.timeResult}. Résultat non arbitré.`);
    return exported.pgn({ maxWidth: 80 });
  }

  reset() {
    this.played = [];
    this.redos = [];
    this.date = new Date();
    this.game.reset();
    this.clock.reset();
    this.timeResult = "";
    this.resigned = null;
    if (this.startRequested && !this.mode) this.clock.start("w");
    // Une nouvelle connexion isole la recherche annulée, sans ambiguïté de bestmove tardif.
    if (this.mode && this.factory) void this.connect(this.mode, this.factory);
    else this.publish();
  }

  async disconnect() {
    this.tick();
    this.clock.pause();
    ++this.generation;
    const session = this.session;
    this.session = undefined;
    this.mode = null;
    this.factory = undefined;
    this.snapshot = null;
    this.searching = false;
    this.game.pending = null;
    if (!this.finished) this.clock.resume(this.game.chess.turn());
    this.publish();
    await session?.dispose();
  }
}
