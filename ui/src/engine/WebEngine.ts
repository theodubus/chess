/**
 * Le transport de la version web (GitHub Pages) : ShallowRed compilé en
 * WebAssembly, dans un Web Worker, sans serveur.
 *
 * `vite build --mode pages` substitue ce fichier à `DevelopmentEngine.ts`
 * partout où celui-ci est importé (`vite.config.ts`) : c'est le remplacement
 * d'un seul fichier que prévoit `ui/CLAUDE.md`. Il en expose donc la même
 * API, ce que `transportContract.ts` fait vérifier par TypeScript. Hors de
 * ce mode, rien n'importe ce fichier.
 */
import type { Engine, TransportLimitations } from "./Engine";
import { inspectEngine } from "./inspect";
import { createWebEngine, type WorkerLike } from "./web/webEngine";
import standardModule from "./web/shallowred.wasm?url";
import simdModule from "./web/shallowred-simd.wasm?url";

export const TRANSPORT_LIMITATIONS: TransportLimitations = {
  notice:
    "Version web : ShallowRed tourne dans votre navigateur, sur un seul cœur, et y joue moins fort que le moteur installé.",
  href: "https://github.com/theodubus/chess",
  ponder:
    "Indisponible dans la version web : le moteur n’y réfléchit que pendant son propre tour.",
  threads:
    "Un seul cœur dans la version web : la page ne peut pas donner plusieurs fils de calcul au moteur.",
  engines:
    "Seul ShallowRed est disponible dans la version web : une page ne peut pas lancer un programme installé.",
};

export type AnalysisEngineChoice = { id: string; label: string };
export const DEFAULT_ANALYSIS_ENGINE: AnalysisEngineChoice = {
  id: "default",
  label: "ShallowRed",
};

// Le plus petit module qui emploie une instruction SIMD : un navigateur qui
// ne la connaît pas refuse de le valider. Safari ne l'accepte que depuis
// la version 16.4 ; les autres, depuis 2021.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

let compiled: Promise<WebAssembly.Module> | undefined;

/** Le module, compilé une fois par page et partagé par tous les Workers. */
function compileEngine() {
  compiled ??= (async () => {
    // Les deux modules cherchent le même arbre ; le SIMD le parcourt environ
    // deux fois et demie plus vite.
    const url = WebAssembly.validate(SIMD_PROBE) ? simdModule : standardModule;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Moteur web introuvable (${response.status}).`);
    return WebAssembly.compile(await response.arrayBuffer());
  })();
  // Un échec ne doit pas condamner les tentatives suivantes.
  compiled.catch(() => {
    compiled = undefined;
  });
  return compiled;
}

function spawnWorker(module: WebAssembly.Module): WorkerLike {
  const worker = new Worker(new URL("./web/worker.ts", import.meta.url), {
    type: "module",
  });
  worker.postMessage({ module });
  return worker;
}

export async function connectDevelopmentEngine(
  onFailure: (message: string) => void,
  // Le pont local choisit un moteur par adresse ; il n'y en a qu'un ici.
  _url?: string,
): Promise<Engine> {
  void _url;
  let module: WebAssembly.Module;
  try {
    module = await compileEngine();
  } catch (error) {
    throw new Error(
      `Le moteur web n’a pas pu être chargé : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return createWebEngine(() => spawnWorker(module), onFailure);
}

export async function listAnalysisEngines(): Promise<AnalysisEngineChoice[]> {
  return [DEFAULT_ANALYSIS_ENGINE];
}

export function analysisEngineFactory(id: string) {
  void id;
  return (onFailure: (message: string) => void) =>
    connectDevelopmentEngine(onFailure);
}

export async function addAnalysisEngine(
  path: string,
): Promise<AnalysisEngineChoice> {
  void path;
  throw new Error(TRANSPORT_LIMITATIONS.engines);
}

export function inspectDevelopmentEngine(signal: AbortSignal, id = "default") {
  void id;
  return inspectEngine(signal, connectDevelopmentEngine);
}
