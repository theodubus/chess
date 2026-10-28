/**
 * WASI (preview 1) pour le binaire du moteur compilé en
 * `wasm32-wasip1-threads` : `engine/src/main.rs` tel quel, sa boucle UCI et
 * ses fils de recherche.
 *
 * Chaque fil du moteur est une instance du module dans son propre Worker,
 * sur la même mémoire partagée ; chacune reçoit ces fonctions. Ce que la
 * version sans fils (`../wasi.ts`) n'a pas besoin de faire :
 *
 * - **bloquer** : l'entrée standard (`SharedInput`) et `poll_oneoff`, par
 *   lequel passe `thread::sleep`, endorment le fil par `Atomics.wait` ;
 * - **créer des fils** : `wasi.thread-spawn`, confié à l'hôte ;
 * - **une horloge commune** : `performance.now()` part de la naissance de
 *   CHAQUE Worker, et une échéance posée par un fil est lue par un autre —
 *   au `go ponder`, la couche UCI la pose, le fil de recherche la lit.
 *
 * Écrit sans syntaxe propre à TypeScript hors des types, pour que Node le
 * charge tel quel (`dev/wasm-check.mjs`).
 */
import type { SharedInput } from "./sharedInput";

const SUCCESS = 0;
const EBADF = 8;
const EINVAL = 28;
const ENOTCAPABLE = 76;
const FILETYPE_CHARACTER_DEVICE = 2;
const ARGV = ["shallowred"];

/** Levée par `proc_exit` : le moteur s'est arrêté, après `quit`. */
export class WasiExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`Le moteur s’est arrêté (code ${code}).`);
    this.code = code;
  }
}

export type ThreadHost = {
  memory: WebAssembly.Memory;
  /** L'entrée standard ; seul le fil UCI la lit. */
  stdin?: SharedInput;
  /** Une ligne complète écrite par ce fil sur sa sortie standard. */
  onLine(line: string): void;
  /** Ce que ce fil écrit sur sa sortie d'erreur : un message de panique. */
  onError(text: string): void;
  /** Démarre un fil ; rend son identifiant, ou un nombre négatif. */
  spawn(startArg: number): number;
};

/** Millisecondes depuis l'époque, à la résolution de `performance.now`. */
export function sharedNow() {
  return performance.timeOrigin + performance.now();
}

export function threadedImports(host: ThreadHost) {
  const encoder = new TextEncoder();
  const decoders = [new TextDecoder(), new TextDecoder()];
  const pending = ["", ""];
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  // La mémoire partagée qui grandit rend un nouvel objet `buffer` : on le
  // relit à chaque accès.
  const view = () => new DataView(host.memory.buffer);
  const bytes = (pointer: number, length: number) =>
    new Uint8Array(host.memory.buffer, pointer, length);

  function emit(stream: 0 | 1, chunk: Uint8Array) {
    pending[stream] += decoders[stream].decode(chunk, { stream: true });
    if (stream === 1) {
      host.onError(pending[1]);
      pending[1] = "";
      return;
    }
    let newline = pending[0].indexOf("\n");
    while (newline >= 0) {
      host.onLine(pending[0].slice(0, newline).replace(/\r$/, ""));
      pending[0] = pending[0].slice(newline + 1);
      newline = pending[0].indexOf("\n");
    }
  }

  const wasi = {
    args_sizes_get(countPointer: number, sizePointer: number) {
      view().setUint32(countPointer, ARGV.length, true);
      view().setUint32(
        sizePointer,
        ARGV.reduce((sum, arg) => sum + encoder.encode(arg).length + 1, 0),
        true,
      );
      return SUCCESS;
    },
    args_get(argvPointer: number, bufferPointer: number) {
      let cursor = bufferPointer;
      ARGV.forEach((arg, index) => {
        view().setUint32(argvPointer + index * 4, cursor, true);
        const encoded = encoder.encode(`${arg}\0`);
        bytes(cursor, encoded.length).set(encoded);
        cursor += encoded.length;
      });
      return SUCCESS;
    },
    environ_sizes_get(countPointer: number, sizePointer: number) {
      view().setUint32(countPointer, 0, true);
      view().setUint32(sizePointer, 0, true);
      return SUCCESS;
    },
    environ_get() {
      return SUCCESS;
    },
    clock_time_get(id: number, _precision: bigint, timePointer: number) {
      // Temps réel et monotone partagent l'origine commune : c'est la
      // condition pour qu'un instant passe d'un fil à l'autre.
      if (id !== 0 && id !== 1) return EINVAL;
      view().setBigUint64(
        timePointer,
        BigInt(Math.round(sharedNow() * 1000)) * 1000n,
        true,
      );
      return SUCCESS;
    },
    fd_read(fd: number, iovs: number, iovsLength: number, readPointer: number) {
      if (fd !== 0 || !host.stdin) return EBADF;
      let read = 0;
      if (iovsLength > 0) {
        const pointer = view().getUint32(iovs, true);
        const length = view().getUint32(iovs + 4, true);
        // Bloque jusqu'à la prochaine commande : c'est une lecture de stdin.
        read = host.stdin.read(bytes(pointer, length));
      }
      view().setUint32(readPointer, read, true);
      return SUCCESS;
    },
    fd_write(
      fd: number,
      iovs: number,
      iovsLength: number,
      writtenPointer: number,
    ) {
      if (fd !== 1 && fd !== 2) return EBADF;
      let written = 0;
      for (let index = 0; index < iovsLength; index++) {
        const pointer = view().getUint32(iovs + index * 8, true);
        const length = view().getUint32(iovs + index * 8 + 4, true);
        // Copie hors de la mémoire partagée : TextDecoder la refuse.
        emit(fd === 1 ? 0 : 1, bytes(pointer, length).slice());
        written += length;
      }
      view().setUint32(writtenPointer, written, true);
      return SUCCESS;
    },
    fd_close() {
      return SUCCESS;
    },
    fd_fdstat_get(fd: number, pointer: number) {
      if (fd > 2) return EBADF;
      view().setUint8(pointer, FILETYPE_CHARACTER_DEVICE);
      view().setUint16(pointer + 2, 0, true);
      view().setBigUint64(pointer + 8, 0xffffffffffffffffn, true);
      view().setBigUint64(pointer + 16, 0xffffffffffffffffn, true);
      return SUCCESS;
    },
    fd_filestat_get(fd: number, pointer: number) {
      if (fd > 2) return EBADF;
      bytes(pointer, 64).fill(0);
      view().setUint8(pointer + 16, FILETYPE_CHARACTER_DEVICE);
      return SUCCESS;
    },
    // Aucun répertoire ouvert : `EvalFile` vers un fichier est refusé, et
    // le moteur le dit par une ligne `info string`.
    fd_prestat_get() {
      return EBADF;
    },
    fd_prestat_dir_name() {
      return EBADF;
    },
    path_open() {
      return ENOTCAPABLE;
    },
    poll_oneoff(
      subscriptions: number,
      events: number,
      count: number,
      eventCount: number,
    ) {
      // Seul `thread::sleep` y recourt : des abonnements à l'horloge. Le
      // moteur dort ainsi en attendant `ponderhit` après une recherche finie.
      let wait = Infinity;
      for (let index = 0; index < count; index++) {
        const base = subscriptions + index * 48;
        if (view().getUint8(base + 8) !== 0) return EINVAL;
        const timeout = Number(view().getBigUint64(base + 24, true)) / 1e6;
        const absolute = (view().getUint16(base + 40, true) & 1) === 1;
        wait = Math.min(wait, absolute ? timeout - sharedNow() : timeout);
      }
      if (wait > 0 && Number.isFinite(wait)) Atomics.wait(sleeper, 0, 0, wait);
      for (let index = 0; index < count; index++) {
        const base = events + index * 32;
        view().setBigUint64(
          base,
          view().getBigUint64(subscriptions + index * 48, true),
          true,
        );
        view().setUint16(base + 8, SUCCESS, true);
        view().setUint8(base + 10, 0);
      }
      view().setUint32(eventCount, count, true);
      return SUCCESS;
    },
    proc_exit(code: number): number {
      throw new WasiExit(code);
    },
    sched_yield() {
      return SUCCESS;
    },
  };

  return {
    env: { memory: host.memory },
    wasi: { "thread-spawn": (startArg: number) => host.spawn(startArg) },
    wasi_snapshot_preview1: wasi,
  };
}
