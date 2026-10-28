import { type Engine, validateCommand } from "../Engine";

/** Ce que `createWebEngine` demande d'un Worker — un faux dans les tests. */
export type WorkerLike = {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

/** La durée d'une tranche de ponder, en millisecondes. */
export const PONDER_SLICE_MS = 150;

/**
 * Un moteur UCI hébergé dans un Web Worker, recherche comprise : le repli
 * de la version web, quand la page n'a pas la mémoire partagée qu'exige le
 * moteur à fils (`threads/`).
 *
 * Le moteur cherche sur le fil du Worker, qui ne lit donc aucun message tant
 * qu'une recherche tourne. Trois commandes UCI exigent pourtant une réponse
 * PENDANT la recherche, et ce transport les sert lui-même :
 *
 * - `isready` reçoit `readyok` aussitôt — le protocole l'exige même en
 *   pleine recherche ;
 * - `stop` remplace le Worker par un neuf, et rend le premier coup de la
 *   dernière variante annoncée : c'est le coup de la dernière itération
 *   achevée. La table de transposition est perdue avec l'ancien Worker ;
 * - **le ponder, par tranches**. `go ponder …` devient une suite de
 *   `go movetime 150` sur la position pariée, dans le même Worker : chaque
 *   tranche repart de la profondeur 1 mais retrouve en quelques
 *   millisecondes, par la table, ce que les précédentes ont établi. Entre
 *   deux tranches, le Worker relit ses messages. `ponderhit` attend la fin
 *   de la tranche puis lance la vraie recherche — le `go` d'origine, sans
 *   `ponder`, table chaude ; `stop` attend la fin de la tranche et rend son
 *   coup. Le pilote n'annonce pas le ponder : ce transport le fait à sa
 *   place, puisque c'est lui qui le sert. Moins bon que le ponder du moteur
 *   — une itération plus longue qu'une tranche ne s'achève jamais —, et
 *   l'interface le dit.
 */
export function createWebEngine(
  spawn: () => WorkerLike,
  onFailure: (message: string) => void,
): Engine {
  const listeners = new Set<(line: string) => void>();
  // Ce qu'un Worker neuf doit recevoir pour reprendre où l'ancien en était.
  const options: string[] = [];
  let position: string | null = null;
  let disposed = false;
  let searching = false;
  let stopRequested = false;
  let lastMove: string | null = null;
  // Le ponder en cours : le `go` à lancer après `ponderhit`, et ce que
  // l'interface a demandé depuis. `rested` : les tranches ont cessé — la
  // position est finie, ou un mat est trouvé — et gardent leur dernier coup.
  let ponder: {
    go: string;
    then: "slice" | "hit" | "stop";
    mate: boolean;
    rested: string | null;
  } | null = null;
  let worker = attach(spawn());

  function emit(line: string) {
    for (const listener of [...listeners]) listener(line);
  }

  // Les réponses fabriquées ici partent après le retour de `send`, comme
  // une vraie réponse du Worker : un client ne doit pas les recevoir pendant
  // qu'il est encore en train d'envoyer.
  function emitLater(line: string) {
    queueMicrotask(() => {
      if (!disposed) emit(line);
    });
  }

  function attach(next: WorkerLike) {
    next.onmessage = (event) => receive(next, event.data);
    next.onerror = (event) => {
      if (next !== worker) return;
      event.preventDefault();
      fail(event.message || "Le moteur web n’a pas pu démarrer.");
    };
    return next;
  }

  function fail(message: string) {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    worker.terminate();
    onFailure(message);
  }

  function receive(source: WorkerLike, data: unknown) {
    // Un Worker remplacé peut encore avoir des messages en vol.
    if (disposed || source !== worker || !data || typeof data !== "object")
      return;
    if ("error" in data && typeof data.error === "string") {
      fail(data.error);
      return;
    }
    if (!("line" in data) || typeof data.line !== "string") return;
    const line = data.line;
    if (line === "uciok") emit("option name Ponder type check default false");
    if (ponder) {
      sliced(line);
      return;
    }
    if (line.startsWith("bestmove")) {
      searching = false;
      stopRequested = false;
    } else if (searching && line.startsWith("info ")) {
      const move = / pv (\S+)/.exec(line)?.[1];
      if (move) lastMove = move;
    }
    emit(line);
    if (stopRequested && lastMove) interrupt();
  }

  /** Une ligne du Worker pendant le ponder par tranches. */
  function sliced(line: string) {
    if (!ponder) return;
    if (!line.startsWith("bestmove")) {
      if (/ score mate /.test(line)) ponder.mate = true;
      // Les lignes d'une tranche décrivent la position pariée : l'interface
      // les ignore tant qu'elle pondère, comme avec le binaire.
      emit(line);
      return;
    }
    // Le coup d'une tranche n'est jamais rendu à l'interface : il ne répond
    // qu'à `stop`.
    if (ponder.then === "hit") {
      const go = ponder.go;
      ponder = null;
      lastMove = null;
      worker.postMessage({ line: go });
    } else if (ponder.then === "stop") {
      ponder = null;
      searching = false;
      emit(line);
    } else if (ponder.mate || line === "bestmove 0000") {
      ponder.rested = line;
    } else {
      worker.postMessage({ line: `go movetime ${PONDER_SLICE_MS}` });
    }
  }

  /** `ponderhit` ou `stop` pendant le ponder par tranches. */
  function endPonder(word: "ponderhit" | "stop") {
    if (!ponder) return;
    ponder.then = word === "ponderhit" ? "hit" : "stop";
    // Plus de tranche en cours : la réponse ne l'attend pas.
    if (ponder.rested) sliced(ponder.rested);
  }

  function interrupt() {
    worker.terminate();
    worker = attach(spawn());
    for (const option of options) worker.postMessage({ line: option });
    if (position) worker.postMessage({ line: position });
    searching = false;
    stopRequested = false;
    emitLater(`bestmove ${lastMove}`);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    worker.terminate();
  }

  return {
    send(command) {
      validateCommand(command);
      if (disposed) throw new Error("Moteur déconnecté.");
      const word = command.trim().split(/\s+/)[0];
      if (word === "quit") {
        void dispose();
        return;
      }
      if (word === "stop" || word === "ponderhit") {
        if (ponder) {
          endPonder(word);
          return;
        }
        // Aucune variante encore : la première itération arrive en quelques
        // millisecondes, et `receive` arrêtera alors.
        if (word === "stop" && searching) {
          if (lastMove) interrupt();
          else stopRequested = true;
        }
        return;
      }
      if (word === "isready" && searching) {
        emitLater("readyok");
        return;
      }
      if (word === "setoption") options.push(command);
      if (word === "position") position = command;
      if (word === "ucinewgame") position = null;
      if (word === "go" && !/\bperft\b/.test(command)) {
        searching = true;
        lastMove = null;
        const tokens = command.trim().split(/\s+/);
        if (tokens.includes("ponder")) {
          ponder = {
            go: tokens.filter((token) => token !== "ponder").join(" "),
            then: "slice",
            mate: false,
            rested: null,
          };
          worker.postMessage({ line: `go movetime ${PONDER_SLICE_MS}` });
          return;
        }
      }
      worker.postMessage({ line: command });
    },
    onLine(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose,
  };
}
