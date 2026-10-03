import type { PedagogicalDraft } from "./draftModel";

/** Données de relecture seulement : le produit n'importe pas cet aperçu. */
export type PreviewExample = {
  id: string;
  label: string;
  source: string;
  origin: "constructed" | "published";
  engine: string;
  engineName: string;
  engineHash: string;
  beforeFen: string;
  afterFen: string;
  state: string;
  reason: string;
  error: string | null;
  elapsedMs: number;
  searches: number;
  draft: PedagogicalDraft | null;
};
export type PreviewDocument = {
  schema: 1;
  generatedAt: string;
  publishable: false;
  independentSample: false;
  examples: PreviewExample[];
};
