// Un Worker du moteur à fils dans Node : le pendant de
// `src/engine/web/threads/threadWorker.ts`, pour `dev/wasm-check.mjs`.
import { parentPort } from "node:worker_threads";
import { runWorker } from "../src/engine/web/threads/threadRuntime.ts";

parentPort.once("message", (init) =>
  runWorker(init, (signal) => parentPort.postMessage(signal)),
);
