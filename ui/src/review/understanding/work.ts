/** Le calcul local n'est pas un transport moteur : aucune commande UCI, aucun
 * Worker. Les mêmes étapes se drainent en synchrone ou entre deux rendus. */
export type WorkPhase = "context" | "possibilities" | "relations" | "tactics" | "mate";
export type Work<T> = Generator<WorkPhase, T, void>;
export function finishWork<T>(work: Work<T>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}
/** Chaque famille cède entre primitives et abandonne son générateur lors d'une
 * navigation. Une primitive reste indivisible ; la tranche n'est pas une garantie. */
export async function completeWork<T>(work: Work<T>, signal: AbortSignal): Promise<T | null> {
  try {
    while (!signal.aborted) {
      const start = performance.now();
      do {
        const step = work.next();
        if (signal.aborted) return null;
        if (step.done) return step.value;
      } while (performance.now() - start < 8);
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, 0);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
    return null;
  } finally { work.return(undefined as never); }
}
