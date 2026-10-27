import type { Engine } from "./Engine";
import { UciSession } from "./UciSession";
import type { EngineCapabilities } from "./options";

/** Connexion courte dédiée à la préparation, annulée quand on quitte le formulaire. */
export async function inspectEngine(
  signal: AbortSignal,
  connect: (onFailure: (message: string) => void) => Promise<Engine>,
) {
  let session: UciSession | undefined;
  const failure = (message: string) => session?.fail(message);
  const engine = await connect(failure);
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
