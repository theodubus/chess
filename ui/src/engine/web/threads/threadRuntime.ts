/**
 * Ce que fait chaque Worker du moteur à fils, quel que soit l'hôte —
 * navigateur (`threadWorker.ts`) ou Node (`dev/wasm-thread-worker.mjs`).
 *
 * # Pourquoi la page crée tous les Workers d'avance
 *
 * Un Worker créé par un autre ne démarre qu'une fois que son créateur rend
 * la main à sa boucle d'événements. Or les fils du moteur ne la rendent
 * jamais : le fil UCI dort sur son entrée standard, un fil de recherche
 * calcule. Créer un Worker au moment où le moteur lance un fil
 * (`wasi.thread-spawn`) le laisserait donc à jamais en attente.
 *
 * La page, elle, n'est jamais bloquée : elle crée un **pool** de Workers
 * (`ThreadSlots`), qui dorment chacun sur un emplacement de mémoire partagée.
 * Lancer un fil, c'est réserver un emplacement libre, y écrire l'identifiant
 * et l'argument du fil, et le réveiller — sans un message, donc sans la
 * boucle d'événements de personne. Un fil terminé rend son emplacement : le
 * pool sert d'un coup à l'autre.
 *
 * Écrit sans syntaxe propre à TypeScript hors des types, pour que Node le
 * charge tel quel.
 */
import { SharedInput } from "./sharedInput.ts";
import { threadedImports, WasiExit } from "./threadedWasi.ts";

const NOT_READY = 0;
const IDLE = 1;
const CLAIMED = 2;
const REQUESTED = 3;
const RUNNING = 4;
const SLOT_INTS = 4;
const HEADER_INTS = 4;

/** Le plus de fils que le pool peut porter : Threads plus le fil de recherche. */
export const MAX_SLOTS = 64;

/** Les emplacements du pool, en mémoire partagée. */
export class ThreadSlots {
  readonly buffer: SharedArrayBuffer;
  private readonly ints: Int32Array;

  constructor(buffer?: SharedArrayBuffer) {
    this.buffer =
      buffer ??
      new SharedArrayBuffer((HEADER_INTS + MAX_SLOTS * SLOT_INTS) * 4);
    this.ints = new Int32Array(this.buffer);
  }

  private state(slot: number) {
    return HEADER_INTS + slot * SLOT_INTS;
  }

  /** Côté fil du moteur : réserve un Worker libre et lance le fil. */
  spawn(startArg: number) {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const at = this.state(slot);
      if (Atomics.compareExchange(this.ints, at, IDLE, CLAIMED) !== IDLE)
        continue;
      // Identifiants à partir de 1 : wasi-libc tient zéro pour « aucun ».
      const tid = Atomics.add(this.ints, 0, 1) + 1;
      Atomics.store(this.ints, at + 1, tid);
      Atomics.store(this.ints, at + 2, startArg);
      Atomics.store(this.ints, at + 3, 0);
      Atomics.store(this.ints, at, REQUESTED);
      Atomics.notify(this.ints, at);
      return tid;
    }
    // Pool épuisé : le moteur le reçoit comme un échec de création de fil.
    return -1;
  }

  /** Côté Worker du pool : se déclare prêt, puis attend un fil. */
  ready(slot: number) {
    Atomics.store(this.ints, this.state(slot), IDLE);
  }

  /** Bloque jusqu'à ce qu'un fil soit demandé ; rend `[tid, argument]`. */
  next(slot: number): [number, number] {
    const at = this.state(slot);
    let state = Atomics.load(this.ints, at);
    while (state !== REQUESTED) {
      Atomics.wait(this.ints, at, state);
      state = Atomics.load(this.ints, at);
    }
    Atomics.store(this.ints, at, RUNNING);
    return [Atomics.load(this.ints, at + 1), Atomics.load(this.ints, at + 2)];
  }

  release(slot: number) {
    Atomics.store(this.ints, this.state(slot), IDLE);
  }

  /** Côté page : combien d'emplacements ont un Worker prêt. */
  readyCount() {
    let count = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++)
      if (Atomics.load(this.ints, this.state(slot)) !== NOT_READY) count++;
    return count;
  }
}

export type WorkerInit = {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  slots: SharedArrayBuffer;
} & ({ role: "uci"; stdin: SharedArrayBuffer } | { role: "pool"; slot: number });

/** Ce qu'un Worker envoie à la page. */
export type WorkerSignal =
  | { kind: "ready" }
  | { kind: "line"; line: string }
  | { kind: "error"; error: string }
  | { kind: "exit"; code: number };

function describe(error: unknown, stderr: string) {
  const detail = stderr.trim() || (error instanceof Error ? error.message : String(error));
  return `Le moteur web s’est arrêté : ${detail}`;
}

/**
 * Exécute le rôle reçu. Ne rend jamais la main pour un Worker du pool, ni
 * pour le fil UCI avant `quit` : c'est voulu, ils dorment en mémoire
 * partagée et non dans leur boucle d'événements.
 */
export function runWorker(init: WorkerInit, send: (signal: WorkerSignal) => void) {
  const slots = new ThreadSlots(init.slots);
  const instantiate = (stdin?: SharedInput) => {
    let stderr = "";
    const instance = new WebAssembly.Instance(
      init.module,
      threadedImports({
        memory: init.memory,
        stdin,
        onLine: (line) => send({ kind: "line", line }),
        onError: (text) => {
          stderr += text;
        },
        spawn: (startArg) => slots.spawn(startArg),
      }),
    );
    return { exports: instance.exports, stderr: () => stderr };
  };

  if (init.role === "uci") {
    const { exports, stderr } = instantiate(new SharedInput(init.stdin));
    try {
      (exports._start as () => void)();
      send({ kind: "exit", code: 0 });
    } catch (error) {
      if (error instanceof WasiExit) send({ kind: "exit", code: error.code });
      else send({ kind: "error", error: describe(error, stderr()) });
    }
    return;
  }

  slots.ready(init.slot);
  send({ kind: "ready" });
  for (;;) {
    const [tid, startArg] = slots.next(init.slot);
    // Une instance par fil, sur la même mémoire : l'état propre au fil — sa
    // pile, ses variables locales au fil — est posé par `wasi_thread_start`.
    const { exports, stderr } = instantiate();
    try {
      (exports.wasi_thread_start as (tid: number, arg: number) => void)(
        tid,
        startArg,
      );
    } catch (error) {
      if (!(error instanceof WasiExit)) {
        send({ kind: "error", error: describe(error, stderr()) });
        return;
      }
    }
    slots.release(init.slot);
  }
}
