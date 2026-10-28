/** Seule frontière entre l'interface et un moteur UCI. */
export interface Engine {
  send(command: string): void;
  onLine(listener: (line: string) => void): () => void;
  dispose(): Promise<void>;
}

export function validateCommand(command: string) {
  if (!command.trim() || /[\r\n\0]/.test(command)) {
    throw new Error('Une commande UCI doit tenir sur une seule ligne.');
  }
}

/**
 * Ce qu'un transport ne permet pas, dit à l'utilisateur ; `null` quand il
 * permet tout. Le transport le déclare avec ses fonctions de connexion, pour
 * qu'en changer reste le remplacement d'un seul fichier.
 */
export type TransportLimitations = {
  /** Bandeau affiché en permanence. */
  notice: string;
  /** Où trouver la version complète. */
  href: string;
  /** Pourquoi la réflexion pendant le tour adverse n'est pas proposée. */
  ponder?: string;
  /** Ce qui la distingue de celle du moteur installé, quand elle l'est. */
  ponderNote?: string;
  /** Pourquoi un seul cœur. */
  threads?: string;
  /** Pourquoi on ne peut ni choisir ni ajouter un autre moteur. */
  engines: string;
};
