/**
 * Le moteur à fils, côté page : le binaire du moteur compilé en
 * `wasm32-wasip1-threads`, sa propre boucle UCI comprise. Ponder, `stop`
 * et `Threads` y fonctionnent comme dans le binaire, parce que c'est le
 * même code — seule la page a changé d'hôte.
 *
 * La page possède tout : la mémoire partagée, l'entrée standard, le fil UCI
 * et le pool de Workers où les fils du moteur s'exécutent
 * (`threadRuntime.ts`). Elle n'est jamais bloquée, ce qui lui permet de
 * créer des Workers à tout moment — avant de transmettre `setoption name
 * Threads`, elle agrandit le pool.
 *
 * Écrit sans syntaxe propre à TypeScript hors des types, pour que Node le
 * charge tel quel (`dev/wasm-check.mjs`).
 */
import { type Engine, validateCommand } from "../../Engine.ts";
import { SharedInput } from "./sharedInput.ts";
import {
  MAX_SLOTS,
  ThreadSlots,
  type WorkerInit,
  type WorkerSignal,
} from "./threadRuntime.ts";

export type ThreadWorker = {
  postMessage(message: WorkerInit): void;
  onmessage: ((event: { data: WorkerSignal }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): unknown;
};

export type ThreadedOptions = {
  module: WebAssembly.Module;
  /** Pages de 64 Kio : le minimum que le module déclare, et son maximum. */
  memory: { initial: number; maximum: number };
  createWorker(): ThreadWorker;
  onFailure(message: string): void;
  /** Délai pour la poignée de main `uci` → `uciok`. */
  timeoutMs?: number;
};

const PAGE = 64 * 1024;
const MIB = 1024 * 1024;
const encoder = new TextEncoder();

/**
 * Une mémoire partagée, au plus grand maximum que le navigateur accorde.
 *
 * Le module déclare 1 Gio ; un téléphone en refuse parfois autant d'espace
 * réservé. Un maximum plus petit reste valide — la table par défaut et les
 * piles des fils tiennent largement dans 256 Mio.
 */
export function allocateSharedMemory(initial: number, maximum: number) {
  for (const mebibytes of [1024, 512, 256]) {
    const pages = Math.min(maximum, (mebibytes * MIB) / PAGE);
    if (pages < initial) continue;
    try {
      return new WebAssembly.Memory({ initial, maximum: pages, shared: true });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  throw new Error("Le navigateur refuse la mémoire partagée du moteur.");
}

/** Démarre le moteur ; rejette si la poignée de main échoue. */
export async function startThreadedEngine(
  options: ThreadedOptions,
): Promise<Engine> {
  const memory = allocateSharedMemory(
    options.memory.initial,
    options.memory.maximum,
  );
  const slots = new ThreadSlots();
  const stdin = SharedInput.create();
  const workers: ThreadWorker[] = [];
  const listeners = new Set<(line: string) => void>();
  const readyWaiters: (() => void)[] = [];
  let poolSize = 0;
  let disposed = false;
  let started = false;
  let rejectStart: (error: Error) => void = () => {};

  function terminateAll() {
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  }

  function fail(message: string) {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    terminateAll();
    if (started) options.onFailure(message);
    else rejectStart(new Error(message));
  }

  function receive(signal: WorkerSignal) {
    if (disposed) return;
    if (signal.kind === "line")
      for (const listener of [...listeners]) listener(signal.line);
    else if (signal.kind === "ready")
      for (const waiter of readyWaiters.splice(0)) waiter();
    else if (signal.kind === "error") fail(signal.error);
    // `exit` suit `quit` : la page a déjà tout libéré.
  }

  function spawnWorker(init: WorkerInit) {
    const worker = options.createWorker();
    worker.onmessage = (event) => receive(event.data);
    worker.onerror = (event) =>
      fail(event.message || "Un fil du moteur web n’a pas pu démarrer.");
    worker.postMessage(init);
    workers.push(worker);
  }

  /** Agrandit le pool à `size` Workers prêts. */
  async function ensurePool(size: number) {
    const target = Math.min(size, MAX_SLOTS);
    while (poolSize < target) {
      spawnWorker({
        role: "pool",
        slot: poolSize,
        module: options.module,
        memory,
        slots: slots.buffer,
      });
      poolSize++;
    }
    while (!disposed && slots.readyCount() < target)
      await new Promise<void>((resolve) => readyWaiters.push(resolve));
  }

  function write(command: string) {
    stdin.write(encoder.encode(`${command}\n`));
  }

  // L'ordre des commandes est celui de `send`, même quand l'une attend
  // l'agrandissement du pool.
  let queue = Promise.resolve();

  const startup = new Promise<void>((resolve, reject) => {
    rejectStart = reject;
    const timer = setTimeout(
      () => fail("Le moteur web à plusieurs fils ne répond pas."),
      options.timeoutMs ?? 15000,
    );
    const handshake = (line: string) => {
      if (line !== "uciok") return;
      clearTimeout(timer);
      listeners.delete(handshake);
      resolve();
    };
    listeners.add(handshake);
  });

  // Deux Workers d'avance : le fil de recherche que lance chaque `go`, et
  // un de réserve. `Threads` en demande davantage avant son `setoption`.
  await ensurePool(2);
  spawnWorker({
    role: "uci",
    module: options.module,
    memory,
    slots: slots.buffer,
    stdin: stdin.buffer,
  });
  write("uci");
  await startup;
  started = true;

  return {
    send(command) {
      validateCommand(command);
      if (disposed) throw new Error("Moteur déconnecté.");
      const threads =
        /^setoption\s+name\s+threads\s+value\s+(\d+)\s*$/i.exec(command);
      if (threads) {
        // Le fil de recherche en plus des auxiliaires ; au-delà du pool,
        // le réglage est ramené à ce qu'il peut porter.
        const wanted = Math.min(Number(threads[1]), MAX_SLOTS - 1);
        queue = queue
          .then(() => ensurePool(wanted + 1))
          .then(() => write(`setoption name Threads value ${wanted}`))
          .catch((error: Error) => fail(error.message));
        return;
      }
      queue = queue
        .then(() => write(command))
        .catch((error: Error) => fail(error.message));
    },
    onLine(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async dispose() {
      if (disposed) return;
      try {
        write("quit");
      } catch {
        // Une entrée saturée n'empêche pas de tout libérer.
      }
      disposed = true;
      listeners.clear();
      terminateAll();
    },
  };
}
