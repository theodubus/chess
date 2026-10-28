/**
 * Un Worker du moteur à fils, dans le navigateur : le fil UCI ou un Worker
 * du pool, selon ce que la page lui envoie (`threadRuntime.ts`).
 */
import { runWorker, type WorkerInit, type WorkerSignal } from "./threadRuntime.ts";

// Le tsconfig de l'application charge les types du DOM, pas ceux d'un
// Worker : on ne nomme que ce dont on se sert.
const scope = self as unknown as {
  postMessage(message: WorkerSignal): void;
  onmessage: ((event: MessageEvent<WorkerInit>) => void) | null;
};

scope.onmessage = (event) => {
  scope.onmessage = null;
  runWorker(event.data, (signal) => scope.postMessage(signal));
};
