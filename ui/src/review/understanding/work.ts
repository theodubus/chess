/** Le calcul local n'est pas un transport moteur : aucune commande UCI, aucun
 * Worker. Les mêmes étapes se drainent en synchrone ou entre deux rendus. */
export type WorkPhase = "context" | "possibilities" | "relations" | "tactics" | "mate";
export type Work<T> = Generator<WorkPhase, T, void>;
export function finishWork<T>(work: Work<T>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}
