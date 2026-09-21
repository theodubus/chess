import { type Engine, validateCommand } from "./Engine";

export type AnalysisEngineChoice = { id: string; label: string };
export const DEFAULT_ANALYSIS_ENGINE: AnalysisEngineChoice = {
  id: "default",
  label: "ShallowRed",
};

/** La découverte des moteurs fait partie de l'adaptateur local, pas des composants. */
export async function listAnalysisEngines(): Promise<AnalysisEngineChoice[]> {
  const response = await fetch("http://127.0.0.1:8787/engines", {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(
      "Liste des moteurs indisponible. Relancez le pont avec sa configuration.",
    );
  const choices: unknown = await response.json();
  if (
    !Array.isArray(choices) ||
    !choices.length ||
    choices.some(
      (choice) =>
        !choice ||
        typeof choice.id !== "string" ||
        typeof choice.label !== "string",
    )
  )
    throw new Error("La liste des moteurs reçue est invalide.");
  return choices;
}

export function analysisEngineFactory(id: string) {
  return (onFailure: (message: string) => void) =>
    connectDevelopmentEngine(
      onFailure,
      `ws://127.0.0.1:8787/?engine=${encodeURIComponent(id)}`,
    );
}

export async function addAnalysisEngine(
  path: string,
): Promise<AnalysisEngineChoice> {
  const response = await fetch("http://127.0.0.1:8787/engines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Moteur refusé.");
  if (typeof result.id !== "string" || typeof result.label !== "string")
    throw new Error("Réponse du pont invalide.");
  return result;
}

/** Le WebSocket reste confiné à cet adaptateur de développement. */
export async function connectDevelopmentEngine(
  onFailure: (message: string) => void,
  url = "ws://127.0.0.1:8787",
): Promise<Engine> {
  const socket = new WebSocket(url);
  const listeners = new Set<(line: string) => void>();
  let disposed = false;
  let opened = false;
  socket.addEventListener("message", (event) => {
    if (!disposed && typeof event.data === "string") {
      for (const line of event.data.split(/\r?\n/).filter(Boolean)) {
        for (const listener of listeners) listener(line);
      }
    }
  });
  socket.addEventListener("close", (event) => {
    if (opened && !disposed)
      onFailure(event.reason || "Connexion au moteur interrompue.");
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => fail("Le pont local ne répond pas."), 5000);
    function fail(message: string) {
      clearTimeout(timer);
      disposed = true;
      socket.close();
      reject(new Error(message));
    }
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        opened = true;
        resolve();
      },
      { once: true },
    );
    socket.addEventListener("error", () => {
      if (!opened)
        fail("Pont local inaccessible. Lancez npm run engine:bridge.");
      else if (!disposed) onFailure("Erreur de connexion au moteur.");
    });
    socket.addEventListener(
      "close",
      () => {
        if (!opened) fail("Le pont a fermé la connexion.");
      },
      { once: true },
    );
  });

  return {
    send(command) {
      validateCommand(command);
      if (disposed || socket.readyState !== WebSocket.OPEN)
        throw new Error("Moteur déconnecté.");
      socket.send(command);
    },
    onLine(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      if (socket.readyState === WebSocket.CLOSED) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          socket.close();
          resolve();
        }, 1500);
        socket.addEventListener(
          "close",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        if (socket.readyState === WebSocket.OPEN) socket.send("quit");
        else socket.close();
      });
    },
  };
}
