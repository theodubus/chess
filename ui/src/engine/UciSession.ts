import {
  DEFAULT_ENGINE_OPTIONS,
  readEngineOption,
  validateEngineOptions,
  type EngineOptions,
  type EngineCapabilities,
} from "./options";
import type { ClockBudget } from "../GameClock";
import {
  parseSearchInfo,
  parsePrincipalVariation,
  type SearchInfo,
  type Side,
} from "./analysis";
import type { Engine } from "./Engine";

export type SearchLimit = number | (() => ClockBudget);

export type SessionState =
  | "connecting"
  | "ready"
  | "thinking"
  | "pondering"
  | "stopping"
  | "error"
  | "closed";
export type LogEntry = { direction: "in" | "out"; line: string };
export type SessionSnapshot = {
  state: SessionState;
  name: string;
  error: string;
  log: LogEntry[];
  analysis: SearchInfo | null;
};

export class UciSession {
  private snapshot: SessionSnapshot = {
    state: "connecting",
    name: "",
    error: "",
    log: [],
    analysis: null,
  };
  private phase: "idle" | "uci" | "ready" | "position" | "search" = "idle";
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe: () => void;
  private pending?: {
    resolve: (move: string) => void;
    reject: (error: Error) => void;
    limit: SearchLimit;
    turn: Side;
    pondering: boolean;
    discard: boolean;
  };
  readonly capabilities: EngineCapabilities = { ponder: false, threads: null };
  ponderMove: string | null = null;
  private ponderResult?: Promise<string>;
  private exactAnalysis: SearchInfo | null = null;

  constructor(
    private engine: Engine,
    private update: (snapshot: SessionSnapshot) => void,
    private timeout = 5000,
    private options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
  ) {
    this.unsubscribe = engine.onLine((line) => this.receive(line));
  }

  start() {
    if (this.phase !== "idle" || this.snapshot.state !== "connecting") return;
    this.phase = "uci";
    this.armTimeout();
    this.send("uci");
  }

  search(
    position: string,
    limit: SearchLimit = 500,
    turn: Side = "w",
  ): Promise<string> {
    return this.beginSearch(position, limit, turn, false);
  }

  ponder(position: string, limit: SearchLimit, turn: Side) {
    if (!this.options.ponder || !this.capabilities.ponder) return;
    this.ponderResult = this.beginSearch(position, limit, turn, true);
    // Une erreur pendant le tour humain est publiée, sans promesse non traitée.
    void this.ponderResult.catch(() => {});
  }

  ponderHit(): Promise<string> {
    if (!this.pending?.pondering || !this.ponderResult)
      return Promise.reject(new Error("Aucune réflexion anticipée en cours."));
    this.pending.pondering = false;
    this.snapshot.analysis = null;
    this.snapshot.state = "thinking";
    if (this.phase === "search") {
      this.armSearchTimeout();
      this.send("ponderhit");
    }
    this.publish();
    return this.ponderResult;
  }

  async cancelPonder() {
    if (!this.pending?.pondering || !this.ponderResult) return;
    this.pending.discard = true;
    this.snapshot.state = "stopping";
    this.armTimeout();
    if (this.phase === "search") this.send("stop");
    // Si isready est encore en vol, readyok annule sans envoyer go.
    await this.ponderResult;
    this.ponderResult = undefined;
  }

  private beginSearch(
    position: string,
    limit: SearchLimit,
    turn: Side,
    pondering: boolean,
  ): Promise<string> {
    if (this.snapshot.state !== "ready" || this.pending)
      return Promise.reject(new Error("Le moteur n’est pas disponible."));
    return new Promise((resolve, reject) => {
      this.pending = {
        resolve,
        reject,
        limit,
        turn,
        pondering,
        discard: false,
      };
      this.ponderMove = null;
      // Conserver l’évaluation de la partie, sans afficher celle du coup supposé.
      if (!pondering) this.snapshot.analysis = null;
      this.exactAnalysis = null;
      this.phase = "position";
      this.snapshot.state = pondering ? "pondering" : "thinking";
      this.armTimeout();
      this.send(position);
      // Cette barrière permet de recevoir un rejet de position avant de lancer go.
      this.send("isready");
    });
  }

  private armSearchTimeout() {
    if (!this.pending) return;
    const limit = this.pending.limit;
    const budget =
      typeof limit === "number"
        ? limit
        : limit()[this.pending.turn === "w" ? "wtime" : "btime"];
    this.armTimeout(this.timeout + budget);
  }

  private finishSearch(move: string) {
    clearTimeout(this.timer);
    const pending = this.pending!;
    this.pending = undefined;
    this.phase = "idle";
    this.snapshot.state = "ready";
    this.publish();
    pending.resolve(move);
  }

  private publish() {
    this.update({ ...this.snapshot, log: [...this.snapshot.log] });
  }
  private log(direction: LogEntry["direction"], line: string) {
    this.snapshot.log = [...this.snapshot.log.slice(-199), { direction, line }];
    this.publish();
  }
  private send(command: string) {
    if (this.snapshot.state === "error" || this.snapshot.state === "closed")
      return;
    this.log("out", command);
    try {
      this.engine.send(command);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Commande refusée.");
    }
  }
  private armTimeout(delay = this.timeout) {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.fail("Délai de réponse UCI dépassé."),
      delay,
    );
  }
  private receive(line: string) {
    if (this.snapshot.state === "closed" || this.snapshot.state === "error")
      return;
    if (this.phase === "uci") readEngineOption(line, this.capabilities);
    if (line.startsWith("id name ")) this.snapshot.name = line.slice(8);
    if (
      this.phase === "search" &&
      this.pending &&
      !this.pending.pondering &&
      !this.pending.discard
    ) {
      const info = parseSearchInfo(line, this.pending.turn);
      const pv = parsePrincipalVariation(line);
      if (info || pv) {
        const previous = this.snapshot.analysis;
        const next: SearchInfo = {
          depth: null,
          score: null,
          ...previous,
          ...info,
        };
        if (info?.depth !== undefined && info.depth !== previous?.depth)
          delete next.pv;
        if (pv) next.pv = pv;
        this.snapshot.analysis = next;
        if (info?.score && !info.score.bound && pv)
          this.exactAnalysis = { ...next };
      }
    }
    this.log("in", line);
    if (
      line.startsWith("info string ") &&
      /position ignorée|invalid position|illegal move/i.test(line)
    ) {
      this.fail(`Le moteur a refusé la position : ${line.slice(12)}`);
    } else if (line === "uciok" && this.phase === "uci") {
      try {
        validateEngineOptions(this.options, this.capabilities);
      } catch (error) {
        this.fail((error as Error).message);
        return;
      }
      this.phase = "ready";
      this.armTimeout();
      if (this.capabilities.threads)
        this.send(`setoption name Threads value ${this.options.threads}`);
      if (this.capabilities.ponder)
        this.send(`setoption name Ponder value ${this.options.ponder}`);
      this.send("ucinewgame");
      this.send("isready");
    } else if (line === "readyok" && this.phase === "ready") {
      clearTimeout(this.timer);
      this.phase = "idle";
      this.snapshot.state = "ready";
      this.publish();
    } else if (
      line === "readyok" &&
      this.phase === "position" &&
      this.pending
    ) {
      if (this.pending.discard) {
        this.finishSearch("");
        return;
      }
      this.phase = "search";
      try {
        const limit = this.pending.limit;
        const prefix = this.pending.pondering ? "go ponder" : "go";
        if (this.pending.pondering) clearTimeout(this.timer);
        if (typeof limit === "number") {
          if (!this.pending.pondering) this.armTimeout(this.timeout + limit);
          this.send(`${prefix} movetime ${limit}`);
        } else {
          // Le temps est relu après readyok, pour inclure l'attente du moteur.
          const { wtime, btime, winc, binc } = limit();
          if (!this.pending.pondering)
            this.armTimeout(
              this.timeout + (this.pending.turn === "w" ? wtime : btime),
            );
          this.send(
            `${prefix} wtime ${wtime} btime ${btime} winc ${winc} binc ${binc}`,
          );
        }
      } catch (error) {
        this.fail(
          error instanceof Error ? error.message : "Pendule indisponible.",
        );
      }
    } else if (
      line.startsWith("bestmove") &&
      this.phase === "search" &&
      this.pending
    ) {
      if (this.pending.discard) {
        this.finishSearch("");
        return;
      }
      if (this.pending.pondering) {
        this.fail("Le moteur a joué avant la fin du tour adverse.");
        return;
      }
      const match =
        /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?|0000|\(none\))(?: ponder ([a-h][1-8][a-h][1-8][qrbn]?))?$/.exec(
          line,
        );
      if (!match) {
        this.fail("Le moteur a renvoyé un coup UCI mal formé.");
        return;
      }
      this.ponderMove = match[2] ?? null;
      // Une itération interrompue peut finir sur une simple borne. Garder
      // l'itération exacte précédente uniquement si elle recommande le même coup.
      if (
        this.snapshot.analysis?.score?.bound &&
        this.exactAnalysis?.pv?.[0] === match[1]
      )
        this.snapshot.analysis = this.exactAnalysis;
      this.finishSearch(match[1]);
    }
  }
  fail(message: string) {
    if (this.snapshot.state === "closed" || this.snapshot.state === "error")
      return;
    clearTimeout(this.timer);
    this.snapshot.state = "error";
    this.snapshot.analysis = null;
    this.snapshot.error = message;
    this.pending?.reject(new Error(message));
    this.pending = undefined;
    this.publish();
    this.unsubscribe();
    void this.engine.dispose();
  }
  async dispose() {
    if (this.snapshot.state === "closed") return;
    clearTimeout(this.timer);
    this.snapshot.state = "closed";
    this.snapshot.analysis = null;
    this.pending?.reject(new Error("Connexion fermée."));
    this.pending = undefined;
    this.unsubscribe();
    await this.engine.dispose();
  }
}
