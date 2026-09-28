import { type Engine, validateCommand } from "./Engine";
import { UciSession } from "./UciSession";
import type { EngineCapabilities } from "./options";

function engineUrl(path: string, websocket = false) {
  const url = new URL(`/engine/${path}`, window.location.href);
  if (websocket) url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export type AnalysisEngineChoice = { id: string; label: string };
export const DEFAULT_ANALYSIS_ENGINE: AnalysisEngineChoice = {
  id: "default",
  label: "ShallowRed",
};

/** La découverte des moteurs fait partie de l'adaptateur local, pas des composants. */
export async function listAnalysisEngines(): Promise<AnalysisEngineChoice[]> {
  const response = await fetch(engineUrl("engines"), {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(
      "Liste des moteurs indisponible. Relancez l’application avec npm --prefix ui run dev.",
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
      engineUrl(`?engine=${encodeURIComponent(id)}`, true),
    );
}

export async function addAnalysisEngine(
  path: string,
): Promise<AnalysisEngineChoice> {
  const response = await fetch(engineUrl("engines"), {
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
  url = engineUrl("", true),
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
        fail(
          "Moteur local inaccessible. Lancez npm --prefix ui run dev puis ouvrez l’adresse affichée dans ce terminal.",
        );
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

/** Connexion courte dédiée à la préparation, annulée quand on quitte le formulaire. */
export async function inspectDevelopmentEngine(signal: AbortSignal) {
  let session: UciSession | undefined;
  const engine = await connectDevelopmentEngine((message) =>
    session?.fail(message),
  );
  if (signal.aborted) {
    await engine.dispose();
    throw new Error("Vérification annulée.");
  }
  try {
    return await new Promise<{
      name: string;
      capabilities: EngineCapabilities;
    }>((resolve, reject) => {
      const cancel = () => session?.fail("Vérification annulée.");
      signal.addEventListener("abort", cancel, { once: true });
      session = new UciSession(engine, (snapshot) => {
        if (snapshot.state === "ready" || snapshot.state === "error")
          signal.removeEventListener("abort", cancel);
        if (snapshot.state === "ready")
          resolve({ name: snapshot.name, capabilities: session!.capabilities });
        if (snapshot.state === "error") reject(new Error(snapshot.error));
      });
      session.start();
    });
  } finally {
    await session?.dispose();
  }
}
