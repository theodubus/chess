/**
 * `vite build --mode pages` substitue `WebEngine.ts` à `DevelopmentEngine.ts`.
 * Ce type ne compile que si le premier offre tout ce que le second exporte,
 * avec des types compatibles : un export ajouté au pont local et oublié ici
 * casse `npm run typecheck`, pas la version web en production.
 */
import type * as Development from "./DevelopmentEngine";
import type * as Web from "./WebEngine";

type Expect<T extends true> = T;
export type WebTransportMatchesDevelopment = Expect<
  typeof Web extends typeof Development ? true : false
>;
