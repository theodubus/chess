import { createServer } from "vite";
import { once } from "node:events";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startBridge } from "./bridge.mjs";
import { probeEngine } from "./probe-engine.mjs";

const uiRoot = fileURLToPath(new URL("../", import.meta.url));
export const defaultEngine = fileURLToPath(
  new URL(
    `../../target/release/shallowred${process.platform === "win32" ? ".exe" : ""}`,
    import.meta.url,
  ),
);

/** Un propriétaire pour le front, le pont et leur arrêt ; aucun port moteur imposé. */
export async function startApplication({
  command = defaultEngine,
  args = [],
  port = 5173,
  engines = [],
  cacheDir,
  registryFile = fileURLToPath(
    new URL("./engines.local.json", import.meta.url),
  ),
  signal,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Port invalide.");
  try {
    await access(command, constants.X_OK);
  } catch {
    throw new Error(
      `Moteur absent ou non exécutable : ${command}\nCompilez-le depuis la racine avec cargo build --release --bin shallowred, ou indiquez --engine /chemin/du/moteur.`,
    );
  }
  const name = await probeEngine(command, { args, signal });
  if (signal?.aborted) throw new Error("Démarrage annulé.");
  const origins = [];
  const bridge = startBridge({
    command,
    args,
    port: 0,
    origins,
    engines,
    registryFile,
  });
  let front;
  let closing;
  const close = () =>
    (closing ??= (async () => {
      // Terminer les clients moteur avant le proxy évite d'attendre un WebSocket actif.
      await bridge.close();
      // À froid, annuler l’optimiseur avant la fin des transformations peut
      // laisser des imports en attente et empêcher Vite de se fermer.
      if (front?.httpServer?.listening) await front.waitForRequestsIdle();
      await front?.close();
    })());
  try {
    await once(bridge.server, "listening");
    const bridgePort = bridge.server.address().port;
    front = await createServer({
      root: uiRoot,
      cacheDir,
      configFile: resolve(uiRoot, "vite.config.ts"),
      clearScreen: false,
      plugins: [
        {
          name: "local-engine-origin",
          configureServer(server) {
            server.middlewares.use((request, response, next) => {
              if (!request.url?.startsWith("/engine/")) return next();
              // Le proxy ne doit pas transformer une requête d'un autre site en
              // requête de confiance, ni exposer le lancement de programmes au réseau.
              const origin = `http://${request.headers.host}`;
              if (
                !origins.includes(origin) ||
                (request.headers.origin &&
                  !origins.includes(request.headers.origin))
              ) {
                response.writeHead(403).end();
                return;
              }
              // Les GET de même origine n'ont généralement pas d'en-tête Origin.
              if (!request.headers.origin) request.headers.origin = origin;
              next();
            });
          },
        },
      ],
      server: {
        host: "127.0.0.1",
        port,
        strictPort: true,
        open: false,
        proxy: {
          "/engine/": {
            target: `http://127.0.0.1:${bridgePort}`,
            ws: true,
            rewrite: (path) => path.replace(/^\/engine/, ""),
          },
        },
      },
    });
    await front.listen();
    if (signal?.aborted) throw new Error("Démarrage annulé.");
    const actualPort = front.httpServer.address().port;
    origins.push(
      `http://127.0.0.1:${actualPort}`,
      `http://localhost:${actualPort}`,
    );
    return { url: origins[0], name, bridge, front, close };
  } catch (error) {
    await close();
    if (/already in use|EADDRINUSE/.test(error.message))
      throw new Error(
        `Le port ${port} est déjà occupé. Fermez l'ancien front (Ctrl+C), ou choisissez --port ${port + 1}. Aucun second serveur n'a été laissé ouvert.`,
      );
    throw error;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const options = {};
  let config;
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index],
      value = argv[++index];
    if (!value) throw new Error(`Valeur manquante pour ${option}.`);
    if (option === "--engine") options.command = resolve(value);
    else if (option === "--port" && /^\d+$/.test(value))
      options.port = Number(value);
    else if (option === "--engines") config = resolve(value);
    else if (
      option === "--host" &&
      ["127.0.0.1", "localhost"].includes(value)
    ) {
      /* Compatibilité avec l'ancienne commande locale. */
    } else
      throw new Error(
        `Option inconnue : ${option}. Utilisez --engine, --port ou --engines.`,
      );
  }
  if (!options.command && process.env.CHESS_ENGINE)
    options.command = resolve(process.env.CHESS_ENGINE);
  if (config) {
    const entries = JSON.parse(await readFile(config, "utf8"));
    if (!Array.isArray(entries))
      throw new Error("La configuration doit contenir un tableau de moteurs.");
    options.engines = entries.map((engine) => ({
      ...engine,
      command:
        typeof engine.command === "string" &&
        !isAbsolute(engine.command) &&
        /[\\/]/.test(engine.command)
          ? resolve(dirname(config), engine.command)
          : engine.command,
    }));
  }
  const controller = new AbortController();
  let app;
  const stop = () => {
    controller.abort();
    void app?.close();
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
  console.log("Vérification du moteur UCI…");
  app = await startApplication({ ...options, signal: controller.signal });
  if (controller.signal.aborted) {
    await app.close();
    return;
  }
  console.log(
    `\nShallowRed prêt : ${app.url}\nMoteur vérifié : ${app.name}\nFront et moteur démarrés ensemble. Ctrl+C arrête les deux.\n`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(`\nDémarrage impossible : ${error.message}`);
    process.exitCode = 1;
  });
