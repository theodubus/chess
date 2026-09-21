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
