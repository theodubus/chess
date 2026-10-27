import { type Engine, validateCommand } from "../Engine";

/** Ce que `createWebEngine` demande d'un Worker — un faux dans les tests. */
export type WorkerLike = {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

/**
 * Un moteur UCI hébergé dans un Web Worker, recherche comprise.
 *
 * Le moteur cherche sur le fil du Worker, qui ne lit donc aucun message tant
 * qu'une recherche tourne. Deux commandes UCI exigent pourtant une réponse
 * PENDANT la recherche, et ce transport les sert lui-même :
 *
 * - `isready` reçoit `readyok` aussitôt — le protocole l'exige même en
 *   pleine recherche ;
 * - `stop` remplace le Worker par un neuf, et rend le premier coup de la
 *   dernière variante annoncée : c'est le coup de la dernière itération
 *   achevée. La table de transposition est perdue avec l'ancien Worker.
 *
 * `ponderhit` n'a pas d'équivalent : le pilote n'annonce pas le ponder, et
 * l'interface ne le propose pas. Elle n'envoie d'ailleurs `stop` que pour
 * annuler un ponder : l'émulation existe pour qu'un autre client UCI reste
 * servi correctement, pas pour l'interface d'aujourd'hui.
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
