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
import {
  startThreadedEngine,
  type ThreadWorker,
} from "./web/threads/threadedEngine.ts";
import { importedMemoryLimits } from "./web/threads/wasmMemory.ts";
import standardModule from "./web/shallowred.wasm?url";
import simdModule from "./web/shallowred-simd.wasm?url";
import threadsModule from "./web/shallowred-threads.wasm?url";

const REPOSITORY = "https://github.com/theodubus/chess";
const ENGINES =
  "Seul ShallowRed est disponible dans la version web : une page ne peut pas lancer un programme installé.";

/**
 * La voie à fils : le binaire du moteur lui-même, avec sa boucle UCI. Ponder
 * et cœurs y sont ceux du moteur ; seuls manquent l'AVX2 et la vitesse du
 * natif.
 */
const THREADED: TransportLimitations = {
  notice:
    "Version web : ShallowRed tourne dans votre navigateur, sans les instructions AVX2 du moteur installé, et y joue un peu moins fort.",
  href: REPOSITORY,
  engines: ENGINES,
};

/** Le repli, sans mémoire partagée : un seul fil, le ponder par tranches. */
const SINGLE: TransportLimitations = {
  notice:
    "Version web : ShallowRed tourne dans votre navigateur, sur un seul cœur, et y joue moins fort que le moteur installé.",
  href: REPOSITORY,
  ponderNote:
    "Dans ce navigateur, la version web réfléchit pendant votre tour par tranches de 150 ms : moins efficace que le moteur installé, et sa réponse peut attendre jusqu’à 150 ms.",
  threads:
    "Un seul cœur dans ce navigateur : il ne donne pas à la page la mémoire partagée qu’exigent plusieurs fils.",
  engines: ENGINES,
};

// Le plus petit module qui emploie une instruction SIMD : un navigateur qui
// ne la connaît pas refuse de le valider. Safari ne l'accepte que depuis
// la version 16.4 ; les autres, depuis 2021.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);
const SIMD = WebAssembly.validate(SIMD_PROBE);

/**
 * La voie à fils exige une page isolée — `crossOriginIsolated`, que le
 * service worker de la version web obtient (`pages/coi-sw.js`) — et le
 * SIMD, avec lequel ce module est compilé.
 */
let threaded =
  SIMD &&
  typeof SharedArrayBuffer === "function" &&
  typeof crossOriginIsolated === "boolean" &&
  crossOriginIsolated;

/**
 * Ce que la version web ne permet pas. Une liaison vivante : si la voie à
 * fils échoue au démarrage, le repli prend le relais et les mentions avec
 * lui, au rendu suivant.
 */
export let TRANSPORT_LIMITATIONS: TransportLimitations = threaded
  ? THREADED
  : SINGLE;

export type AnalysisEngineChoice = { id: string; label: string };
export const DEFAULT_ANALYSIS_ENGINE: AnalysisEngineChoice = {
  id: "default",
  label: "ShallowRed",
};

/** Un module, téléchargé et compilé une fois par page. */
function loader(url: () => string) {
  let loaded: Promise<{ bytes: Uint8Array; module: WebAssembly.Module }> | undefined;
  return () => {
    loaded ??= (async () => {
      const response = await fetch(url());
      if (!response.ok)
        throw new Error(`Moteur web introuvable (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, module: await WebAssembly.compile(bytes) };
    })();
    // Un échec ne doit pas condamner les tentatives suivantes.
    loaded.catch(() => {
      loaded = undefined;
    });
    return loaded;
  };
}

// Les deux modules du repli cherchent le même arbre ; le SIMD le parcourt
// environ deux fois plus vite.
const loadSingle = loader(() => (SIMD ? simdModule : standardModule));
const loadThreaded = loader(() => threadsModule);

function spawnWorker(module: WebAssembly.Module): WorkerLike {
  const worker = new Worker(new URL("./web/worker.ts", import.meta.url), {
    type: "module",
  });
  worker.postMessage({ module });
  return worker;
}

function threadWorker() {
  return new Worker(new URL("./web/threads/threadWorker.ts", import.meta.url), {
    type: "module",
  }) as unknown as ThreadWorker;
}

export async function connectDevelopmentEngine(
  onFailure: (message: string) => void,
  // Le pont local choisit un moteur par adresse ; il n'y en a qu'un ici.
  _url?: string,
): Promise<Engine> {
  void _url;
  if (threaded) {
    try {
      const { bytes, module } = await loadThreaded();
      return await startThreadedEngine({
        module,
        memory: importedMemoryLimits(bytes),
        createWorker: threadWorker,
        onFailure,
      });
    } catch (error) {
      // Le repli marche partout : mieux vaut un moteur à un fil qu'aucun.
      console.warn("Moteur web à plusieurs fils indisponible :", error);
      threaded = false;
      TRANSPORT_LIMITATIONS = SINGLE;
    }
  }
  let module: WebAssembly.Module;
  try {
    module = (await loadSingle()).module;
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
