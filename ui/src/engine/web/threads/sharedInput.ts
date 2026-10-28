/**
 * L'entrée standard du moteur à fils : un anneau d'octets en mémoire
 * partagée, un seul écrivain (la page) et un seul lecteur (le fil UCI du
 * moteur).
 *
 * Le fil UCI lit son entrée en bloquant, comme un processus : `Atomics.wait`
 * l'endort jusqu'à ce que la page écrive. C'est ce qui lui permet de lire
 * `ponderhit` ou `stop` pendant qu'un autre fil cherche — exactement ce que
 * le Worker unique de la version sans fils ne pouvait pas faire.
 *
 * Écrit sans syntaxe propre à TypeScript hors des types, pour que Node le
 * charge tel quel (`dev/wasm-check.mjs`).
 */

const WRITTEN = 0;
const READ = 1;
const HEADER_BYTES = 8;

export class SharedInput {
  readonly buffer: SharedArrayBuffer;
  private readonly header: Int32Array;
  private readonly data: Uint8Array;

  constructor(buffer: SharedArrayBuffer) {
    this.buffer = buffer;
    this.header = new Int32Array(buffer, 0, 2);
    this.data = new Uint8Array(buffer, HEADER_BYTES);
  }

  static create(capacity = 64 * 1024) {
    return new SharedInput(new SharedArrayBuffer(HEADER_BYTES + capacity));
  }

  /** Côté page : ne bloque jamais. Une commande UCI tient en quelques octets. */
  write(bytes: Uint8Array) {
    const written = Atomics.load(this.header, WRITTEN);
    const read = Atomics.load(this.header, READ);
    const free = this.data.length - (written - read);
    if (bytes.length > free)
      throw new Error("Entrée du moteur saturée : il ne lit plus ses commandes.");
    for (let index = 0; index < bytes.length; index++)
      this.data[(written + index) % this.data.length] = bytes[index];
    Atomics.store(this.header, WRITTEN, written + bytes.length);
    Atomics.notify(this.header, WRITTEN);
  }

  /** Côté moteur : attend au moins un octet, puis en rend au plus `target.length`. */
  read(target: Uint8Array) {
    let written = Atomics.load(this.header, WRITTEN);
    let read = Atomics.load(this.header, READ);
    while (written === read) {
      Atomics.wait(this.header, WRITTEN, written);
      written = Atomics.load(this.header, WRITTEN);
      read = Atomics.load(this.header, READ);
    }
    const count = Math.min(target.length, written - read);
    for (let index = 0; index < count; index++)
      target[index] = this.data[(read + index) % this.data.length];
    Atomics.store(this.header, READ, read + count);
    return count;
  }
}
