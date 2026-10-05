import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import type { Key } from "@lichess-org/chessground/types";
import { LocalGame, type Promotion } from "./game";
import {
  GameClock,
  type TimeControl,
  type ClockState,
  type ClockControls,
} from "./GameClock";
import { DEFAULT_ENGINE_OPTIONS, type EngineOptions } from "./engine/options";
import type { Engine } from "./engine/Engine";
import type { Side } from "./engine/analysis";
import { UciSession, type SessionSnapshot } from "./engine/UciSession";
import { EngineMatch, type MatchPlayers } from "./engine/EngineMatch";

export type GameOutcome = {
  reason: "checkmate" | "draw" | "timeout" | "resignation" | "stopped";
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
  readonly game: LocalGame;
  readonly clock: GameClock;
  timeResult = "";
  snapshot: SessionSnapshot | null = null;
  mode: "local" | "fake" | "match" | null = null;
  paused = false;
  private stopped = false;
  private match?: EngineMatch;
  private matchPlayers?: MatchPlayers;
  readonly humanSide: Side;
  premove: { from: Key; to: Key; promotion?: Promotion } | null = null;
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
  private predicted: string | null = null;
  readonly engineOptions: EngineOptions;
  private listeners = new Set<() => void>();

  constructor(
    options: {
      timeControl?: TimeControl | ClockControls;
      engineOptions?: EngineOptions;
      now?: () => number;
      humanSide?: Side;
      initialFen?: string;
    } = {},
  ) {
    this.game = new LocalGame(options.initialFen);
    this.engineOptions = options.engineOptions ?? DEFAULT_ENGINE_OPTIONS;
    this.clock = new GameClock(options.timeControl, options.now);
    this.humanSide = options.humanSide ?? "w";
  }

  get finished() {
    return (
      this.game.chess.isGameOver() ||
      this.stopped ||
      this.clock.flagged !== null ||
      this.resigned !== null
    );
  }
  get outcome(): GameOutcome | null {
    if (this.stopped) return { reason: "stopped", winner: null, result: "*" };
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
    return this.stopped ? "Match arrêté · Aucun résultat attribué"
      : this.paused ? "Match en pause"
      : this.resigned
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
    if (this.isMatch && this.matchPlayers && !this.finished) {
      await this.startMatch(this.matchPlayers);
      return;
    }
    if (this.mode && this.mode !== "match" && this.factory && !this.finished)
      await this.connect(this.mode, this.factory);
  }
  get isMatch() {
    return this.mode === "match";
  }
  snapshotFor(color: Side) {
    return this.isMatch
      ? this.match?.snapshots[color] ?? null
      : color !== this.humanSide ? this.snapshot : null;
  }
  isEnginePlayer(color: Side) {
    return this.isMatch || !!this.mode && color !== this.humanSide;
  }
  async startMatch(players: MatchPlayers) {
    this.startRequested = true;
    this.clock.pause();
    this.premove = null;
    this.game.pending = null;
    this.paused = false;
    this.mode = "match";
    this.matchPlayers = players;
    const generation = ++this.generation;
    const old = this.match;
    const single = this.session;
    this.session = undefined;
    this.snapshot = { state: "connecting", name: "", error: "", log: [], analysis: null };
    this.publish();
    await Promise.allSettled([old?.dispose(), single?.dispose()]);
    if (generation !== this.generation || this.disposed) return;
    const match = new EngineMatch(players, {
      board: () => this.game.chess,
      position: () => this.positionCommand(
        this.game.chess.history({ verbose: true }).map(move => move.lan),
      ),
      budget: () => {
        this.tick();
        if (this.finished) throw new Error("Partie terminée.");
        return this.clock.budget();
      },
      ready: () => {
        if (!this.finished) {
          this.clock.start(this.game.chess.turn());
          this.clock.resume(this.game.chess.turn());
        }
      },
      update: snapshot => {
        if (generation === this.generation) {
          this.snapshot = snapshot;
          this.publish();
        }
      },
      failed: () => {
        if (generation === this.generation) {
          this.clock.pause();
          this.tick();
        }
      },
      play: (uci, name) => {
        this.tick();
        if (generation !== this.generation || this.finished) return;
        const move = this.game.chess.moves({ verbose: true }).find(move => move.lan === uci);
        if (!move) throw new Error(`Coup illégal : ${uci}. Match suspendu.`);
        const before = this.clock.capture();
        this.game.chess.move(move);
        this.clock.completeMove(move.color, this.game.chess.isGameOver());
        this.recordMove(before, name);
        this.publish();
      },
    });
    this.match = match;
    await match.start();
  }
  pauseMatch() {
    if (!this.isMatch || this.finished || this.paused) return;
    this.clock.pause();
    this.tick();
    if (this.finished) return;
    this.paused = true;
    ++this.generation;
    void this.match?.dispose();
    if (this.snapshot) this.snapshot = { ...this.snapshot, state: "closed", analysis: null };
    this.publish();
  }
  stopMatch() {
    if (!this.isMatch || this.finished) return;
    this.clock.pause();
    this.tick();
    if (this.finished) return;
    this.stopped = true;
    this.paused = false;
    ++this.generation;
    void this.match?.dispose();
    if (this.snapshot) this.snapshot = { ...this.snapshot, state: "closed", analysis: null };
    this.publish();
  }
  resign() {
    if (this.isMatch) {
      this.stopMatch();
      return;
    }
    this.tick();
    if (this.finished) return;
    this.resigned = this.mode ? this.humanSide : this.game.chess.turn();
    this.clock.pause();
    this.game.pending = null;
    this.premove = null;
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
    this.premove = null;
    ++this.generation;
    this.clock.pause();
    const session = this.session;
    this.session = undefined;
    this.searching = false;
    await Promise.allSettled([session?.dispose(), this.match?.dispose()]);
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
    this.premove = null;
    ++this.generation;
    const session = this.session;
    this.session = undefined;
    this.searching = false;
    void this.match?.dispose();
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

  get canPremove() {
    return (
      !this.disposed &&
      !this.finished &&
      !!this.mode &&
      !this.isMatch &&
      !this.game.pending &&
      this.game.chess.turn() !== this.humanSide &&
      ["ready", "thinking", "stopping"].includes(this.snapshot?.state ?? "")
    );
  }
  setPremove(from: Key, to: Key) {
    if (
      !this.canPremove ||
      from === to ||
      !/^[a-h][1-8]$/.test(from) ||
      !/^[a-h][1-8]$/.test(to) ||
      this.game.chess.get(from as Square)?.color !== this.humanSide
    )
      return false;
    this.premove = {
      from,
      to,
      ...(this.game.chess.get(from as Square)?.type === "p" &&
      ["1", "8"].includes(to[1])
        ? { promotion: "q" as const }
        : {}),
    };
    this.publish();
    return true;
  }
  cancelPremove() {
    if (!this.premove) return;
    this.premove = null;
    this.publish();
  }
  private playPremove() {
    const queued = this.premove;
    this.premove = null;
    if (!queued) return false;
    this.tick();
    if (this.finished) return false;
    const move = this.game.chess
      .moves({ verbose: true })
      .find(
        (move) =>
          move.from === queued.from &&
          move.to === queued.to &&
          (!move.promotion || move.promotion === "q"),
      );
    // Le coup adverse peut capturer la pièce, barrer son trajet ou donner échec.
    if (!move) return false;
    const before = this.clock.capture();
    this.game.chess.move(move);
    this.clock.completeMove(move.color, this.game.chess.isGameOver());
    this.recordMove(before, "Joueur local");
    return true;
  }

  get canMove() {
    return (
      !this.disposed &&
      !this.isMatch &&
      !this.finished &&
      (!this.mode ||
        (["ready", "pondering"].includes(this.snapshot?.state ?? "") &&
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
    this.premove = null;
    const generation = ++this.generation;
    const old = this.session;
    this.session = undefined;
    this.searching = false;
    this.predicted = null;
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
      this.session = new UciSession(
        engine,
        (snapshot) => {
          if (generation !== this.generation) return;
          this.snapshot = snapshot;
          if (snapshot.state === "error") {
            this.premove = null;
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
        },
        5000,
        this.engineOptions,
      );
      this.session.start();
    } catch (error) {
      if (generation === this.generation)
        this.connectionError(
          error instanceof Error ? error.message : "Connexion impossible.",
        );
    }
  }

  private connectionError(message: string) {
    this.premove = null;
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
    if (this.finished && this.predicted) {
      this.predicted = null;
      const session = this.session;
      this.session = undefined;
      if (this.snapshot)
        this.snapshot = { ...this.snapshot, state: "closed", analysis: null };
      await session?.dispose();
      return;
    }
    if (
      !this.mode ||
      !this.session ||
      !["ready", "pondering"].includes(this.snapshot?.state ?? "") ||
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
    let playedPremove = false;
    try {
      const prediction = this.predicted;
      this.predicted = null;
      let uci: string;
      if (prediction && moves.at(-1) === prediction)
        uci = await session.ponderHit();
      else {
        if (prediction) await session.cancelPonder();
        if (generation !== this.generation || this.game.chess.fen() !== fen)
          return;
        uci = await session.search(
          this.positionCommand(moves),
          () => {
            this.tick();
            if (this.finished) throw new Error("Partie terminée.");
            return this.clock.budget();
          },
          this.game.chess.turn(),
        );
      }
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
      playedPremove = this.playPremove();
      if (!playedPremove) this.startPonder(session);
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
        if (playedPremove) void this.requestEngineMove();
      }
    }
  }

  private positionCommand(moves: string[]) {
    const start =
      this.game.initialFen === DEFAULT_POSITION
        ? "startpos"
        : `fen ${this.game.initialFen}`;
    return `position ${start}${moves.length ? ` moves ${moves.join(" ")}` : ""}`;
  }

  private startPonder(session: UciSession) {
    const predicted = session.ponderMove;
    if (!this.engineOptions.ponder || !predicted || this.finished) return;
    const future = new Chess(this.game.chess.fen());
    const move = future
      .moves({ verbose: true })
      .find(
        (move) => move.from + move.to + (move.promotion ?? "") === predicted,
      );
    if (!move) return;
    future.move(move);
    if (future.isGameOver()) return;
    this.predicted = predicted;
    const moves = this.game.chess
      .history({ verbose: true })
      .map((move) => move.from + move.to + (move.promotion ?? ""));
    session.ponder(
      this.positionCommand([...moves, predicted]),
      () => {
        this.tick();
        if (this.finished) throw new Error("Partie terminée.");
        const budget = this.clock.budget();
        // La position anticipée inclut le coup humain, donc aussi son incrément.
        if (this.game.chess.turn() === this.humanSide) {
          if (this.humanSide === "w") budget.wtime += budget.winc;
          else budget.btime += budget.binc;
        }
        return budget;
      },
      future.turn(),
    );
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
    if (this.isMatch) return false;
    return (
      this.game.pending !== null ||
      (this.mode
        ? this.played.some((entry) => entry.color === this.humanSide)
        : this.played.length > 0)
    );
  }
  get canRedo() {
    return !this.isMatch && !this.game.pending && this.redos.length > 0;
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
    if (this.mode && this.mode !== "match" && this.factory) void this.connect(this.mode, this.factory);
    else {
      this.snapshot = null;
      this.publish();
    }
  }

  exportPgn(): string {
    this.tick();
    // Construire une copie évite de modifier les en-têtes ou l'état de la partie jouée.
    const exported = new Chess(this.game.initialFen);
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
        : this.isEnginePlayer(color)
          ? this.snapshotFor(color)?.name || "Moteur UCI"
          : "Joueur local";
    };
    const result = this.outcome?.result ?? "*";
    const date = `${this.date.getFullYear()}.${String(this.date.getMonth() + 1).padStart(2, "0")}.${String(this.date.getDate()).padStart(2, "0")}`;
    const headers = {
      Event: this.isMatch ? "Match de moteurs" : "Partie amicale",
      Site: "ShallowRed UI",
      Date: date,
      Round: "-",
      White: playerName("w"),
      Black: playerName("b"),
      Result: result,
      TimeControl: this.clock.balanced
        ? `${this.clock.control.initialMs / 1000}+${this.clock.control.incrementMs / 1000}`
        : "?",
      ...(!this.clock.balanced
        ? {
            WhiteTimeControl: `${this.clock.controls.w.initialMs / 1000}+${this.clock.controls.w.incrementMs / 1000}`,
            BlackTimeControl: `${this.clock.controls.b.initialMs / 1000}+${this.clock.controls.b.incrementMs / 1000}`,
          }
        : {}),
      Termination: this.clock.flagged
        ? "time forfeit"
        : this.finished && !this.stopped
          ? "normal"
          : "unterminated",
    };
    for (const [key, value] of Object.entries(headers))
      exported.setHeader(key, value.replace(/["\\\r\n]/g, " ").trim());
    if (this.resigned)
      exported.setComment(
        `Abandon des ${this.resigned === "w" ? "Blancs" : "Noirs"}.`,
      );
    if (this.stopped) exported.setComment("Match arrêté par l’utilisateur, sans résultat attribué.");
    if (this.timeResult)
      exported.setComment(`${this.timeResult}. Résultat non arbitré.`);
    // Le wrapping de commentaires de chess.js 1.4 peut coller un numéro de
    // coup au SAN précédent. Garder le movetext sans césure assure son réimport.
    return exported.pgn();
  }

  reset() {
    this.premove = null;
    this.played = [];
    this.redos = [];
    this.date = new Date();
    this.game.reset();
    this.clock.reset();
    this.timeResult = "";
    this.resigned = null;
    this.stopped = false;
    this.paused = false;
    if (this.isMatch && this.matchPlayers) {
      void this.startMatch(this.matchPlayers);
      return;
    }
    if (this.startRequested && !this.mode) this.clock.start("w");
    // Une nouvelle connexion isole la recherche annulée, sans ambiguïté de bestmove tardif.
    if (this.mode && this.mode !== "match" && this.factory) void this.connect(this.mode, this.factory);
    else this.publish();
  }

  async disconnect() {
    if (this.isMatch) {
      this.stopMatch();
      await this.match?.dispose();
      return;
    }
    this.tick();
    this.clock.pause();
    this.premove = null;
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
