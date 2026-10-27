/**
 * Le Web Worker qui héberge le moteur compilé en WebAssembly.
 *
 * Il reçoit d'abord le module déjà compilé, une seule fois, puis des lignes
 * UCI. Le moteur cherche sur CE fil : pendant une recherche, le Worker ne lit
 * aucun message, et les lignes suivantes attendent dans la file du
 * navigateur. C'est `WebEngine` qui en tient compte, côté page.
 */
import { createWasi } from "./wasi";

type Incoming = { module: WebAssembly.Module } | { line: string };
type Exports = { memory: WebAssembly.Memory; uci_input(): number };
// Le tsconfig de l'application charge les types du DOM, pas ceux d'un
// Worker : on ne nomme que ce dont on se sert.
type WorkerScope = {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
  close(): void;
};

const scope = self as unknown as WorkerScope;
const queue: string[] = [];
let exports: Exports | undefined;
let stopped = false;
let errors = "";

const wasi = createWasi({
  onLine: (line) => scope.postMessage({ line }),
  onError: (text) => {
    errors += text;
  },
});

function fail(error: unknown) {
  stopped = true;
  const reason = error instanceof Error ? error.message : String(error);
  scope.postMessage({
    error: `Le moteur web s’est arrêté : ${errors.trim() || reason}`,
  });
}

function drain() {
  if (!exports || stopped || !queue.length) return;
  for (const line of queue.splice(0)) wasi.push(line);
  try {
    if (exports.uci_input() === 1) {
      stopped = true;
      scope.close();
    }
  } catch (error) {
    // Une panique Rust devient un piège WebAssembly : l'instance n'est plus
    // fiable, on la déclare morte plutôt que de lui envoyer la suite.
    fail(error);
  }
}

scope.onmessage = (event) => {
  const data = event.data;
  if ("line" in data) {
    queue.push(data.line);
    drain();
    return;
  }
  WebAssembly.instantiate(data.module, wasi.imports).then((instance) => {
    exports = instance.exports as unknown as Exports;
    wasi.bind(exports.memory);
    drain();
  }, fail);
};
