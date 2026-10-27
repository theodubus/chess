/**
 * Le strict nécessaire de WASI (preview 1) pour faire tourner le pilote
 * `ui/wasm` hors d'un système d'exploitation.
 *
 * Le module n'importe que sept fonctions : l'environnement (vide), l'horloge,
 * l'entrée et la sortie standard, `poll_oneoff` et `proc_exit`. L'entrée
 * standard est une file que l'hôte remplit AVANT d'appeler le module : rien
 * n'y bloque jamais, ce qui est la condition pour tourner dans un Web Worker
 * sans mémoire partagée. Une lecture sur file vide rend zéro octet — une fin
 * de flux, à laquelle le pilote rend la main.
 *
 * Écrit sans syntaxe propre à TypeScript hors des types, pour que Node le
 * charge tel quel (`dev/wasm-check.mjs`).
 */

const SUCCESS = 0;
const EBADF = 8;
const EINVAL = 28;
const ENOSYS = 52;

const CLOCK_REALTIME = 0;
const CLOCK_MONOTONIC = 1;

/** Levée par `proc_exit` : le module a demandé à s'arrêter. */
export class WasiExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`Le module WebAssembly s’est arrêté (code ${code}).`);
    this.code = code;
  }
}

export type WasiHost = {
  /** Une ligne complète écrite par le module, sans son saut de ligne. */
  onLine(line: string): void;
  /** Ce que le module écrit sur sa sortie d'erreur — un message de panique. */
  onError?(text: string): void;
  /** Horloge monotone en millisecondes ; `performance.now` par défaut. */
  now?(): number;
};

export type Wasi = {
  imports: { wasi_snapshot_preview1: Record<string, (...args: never[]) => number> };
  /** À appeler une fois l'instance créée : la mémoire n'existe qu'avec elle. */
  bind(memory: WebAssembly.Memory): void;
  /** Dépose une commande, saut de ligne compris, sur l'entrée standard. */
  push(line: string): void;
};

export function createWasi(host: WasiHost): Wasi {
  const encoder = new TextEncoder();
  const now = host.now ?? (() => performance.now());
  let memory: WebAssembly.Memory | undefined;
  let input = new Uint8Array(0);
  // Une ligne peut arriver en plusieurs écritures : le décodeur garde un
  // caractère UTF-8 coupé, `pending` garde la ligne commencée.
  const decoders = [new TextDecoder(), new TextDecoder()];
  const pending = ["", ""];

  const view = () => {
    if (!memory) throw new Error("Mémoire WebAssembly non liée.");
    return new DataView(memory.buffer);
  };
  const bytes = (pointer: number, length: number) => {
    if (!memory) throw new Error("Mémoire WebAssembly non liée.");
    return new Uint8Array(memory.buffer, pointer, length);
  };

  function emit(stream: 0 | 1, chunk: Uint8Array) {
    pending[stream] += decoders[stream].decode(chunk, { stream: true });
    if (stream === 1) {
      host.onError?.(pending[1]);
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
    environ_sizes_get(countPointer: number, sizePointer: number) {
      view().setUint32(countPointer, 0, true);
      view().setUint32(sizePointer, 0, true);
      return SUCCESS;
    },
    environ_get() {
      return SUCCESS;
    },
    clock_time_get(id: number, _precision: bigint, timePointer: number) {
      const milliseconds =
        id === CLOCK_REALTIME ? Date.now() : id === CLOCK_MONOTONIC ? now() : NaN;
      if (Number.isNaN(milliseconds)) return EINVAL;
      // En nanosecondes ; la microseconde de `performance.now` suffit à une
      // pendule qui compte en millisecondes.
      view().setBigUint64(
        timePointer,
        BigInt(Math.round(milliseconds * 1000)) * 1000n,
        true,
      );
      return SUCCESS;
    },
    fd_read(fd: number, iovs: number, iovsLength: number, readPointer: number) {
      if (fd !== 0) return EBADF;
      let read = 0;
      for (let index = 0; index < iovsLength && input.length; index++) {
        const pointer = view().getUint32(iovs + index * 8, true);
        const length = view().getUint32(iovs + index * 8 + 4, true);
        const chunk = input.subarray(0, length);
        bytes(pointer, chunk.length).set(chunk);
        input = input.subarray(chunk.length);
        read += chunk.length;
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
        // Copie : la mémoire peut grandir, et l'ancienne vue se détacher.
        emit(fd === 1 ? 0 : 1, bytes(pointer, length).slice());
        written += length;
      }
      view().setUint32(writtenPointer, written, true);
      return SUCCESS;
    },
    // Seul `thread::sleep` y recourt, et le moteur ne dort jamais.
    poll_oneoff() {
      return ENOSYS;
    },
    proc_exit(code: number): number {
      throw new WasiExit(code);
    },
  };

  return {
    imports: { wasi_snapshot_preview1: wasi },
    bind(value) {
      memory = value;
    },
    push(line) {
      const added = encoder.encode(`${line}\n`);
      const next = new Uint8Array(input.length + added.length);
      next.set(input);
      next.set(added, input.length);
      input = next;
    },
  };
}
