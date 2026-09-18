import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  realpathSync,
  statSync,
  accessSync,
  constants,
} from "node:fs";
import { resolve, dirname, isAbsolute, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { probeEngine } from "./probe-engine.mjs";
import { WebSocketServer, WebSocket } from "ws";

/** Pont réservé au développement ; le binaire est choisi au lancement. */
export function startBridge({
  command,
  args = [],
  engines = [],
  registryFile,
  port = 8787,
  origins = ["http://localhost:5173", "http://127.0.0.1:5173"],
}) {
  const registry = new Map([
    [
      "default",
      {
        id: "default",
        label: /shallowred/i.test(basename(command))
          ? "ShallowRed"
          : basename(command),
        command,
        args,
      },
    ],
  ]);
  if (!Array.isArray(engines))
    throw new Error("La liste des moteurs doit être un tableau.");
  for (const engine of engines) {
    if (
      !engine ||
      typeof engine.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(engine.id) ||
      registry.has(engine.id) ||
      typeof engine.label !== "string" ||
      !engine.label.trim() ||
      engine.label.length > 100 ||
      typeof engine.command !== "string" ||
      !engine.command.trim() ||
      (engine.args !== undefined &&
        (!Array.isArray(engine.args) ||
          engine.args.some((arg) => typeof arg !== "string")))
    )
      throw new Error(
        "Configuration de moteur invalide : id unique, label, command et args facultatifs requis.",
      );
    registry.set(engine.id, { ...engine, args: engine.args ?? [] });
  }
  const saved =
    registryFile && existsSync(registryFile)
      ? JSON.parse(readFileSync(registryFile, "utf8"))
      : [];
  if (
    !Array.isArray(saved) ||
    saved.some(
      (engine) =>
        !engine ||
        typeof engine.id !== "string" ||
        engine.id === "default" ||
        typeof engine.command !== "string" ||
        typeof engine.label !== "string",
    )
  )
    throw new Error("Le registre des moteurs ajoutés est invalide.");
  for (const engine of saved)
    if (!registry.has(engine.id))
      registry.set(engine.id, { ...engine, args: [] });
  let registering = false;
  const probeController = new AbortController();
  const http = createServer(async (request, response) => {
    if (!origins.includes(request.headers.origin)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS" && request.url === "/engines") {
      response.setHeader("Access-Control-Allow-Methods", "GET, POST");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.writeHead(204).end();
      return;
    }
    if (request.method === "POST" && request.url === "/engines") {
      if (request.headers["content-type"] !== "application/json") {
        response
          .writeHead(415)
          .end(JSON.stringify({ error: "Format JSON requis." }));
        return;
      }
      if (registering) {
        response
          .writeHead(409)
          .end(
            JSON.stringify({
              error: "Un moteur est déjà en cours de vérification.",
            }),
          );
        return;
      }
      registering = true;
      try {
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 8192)
            throw new Error("Formulaire trop volumineux.");
        }
        const data = JSON.parse(body);
        if (
          typeof data.path !== "string" ||
          !isAbsolute(data.path) ||
          data.path.includes("\0")
        )
          throw new Error(
            "Indiquez le chemin absolu du binaire sur cet ordinateur.",
          );
        let path;
        try {
          path = realpathSync(data.path);
          if (!statSync(path).isFile()) throw new Error();
          accessSync(path, constants.X_OK);
        } catch {
          throw new Error("Ce fichier est absent ou n’est pas exécutable.");
        }
        const label = await probeEngine(path, {
          signal: probeController.signal,
        });
        const existing = [...registry.values()].find((engine) => {
          try {
            return realpathSync(engine.command) === path && !engine.args.length;
          } catch {
            return false;
          }
        });
        if (existing) {
          existing.label = label;
          response.end(
            JSON.stringify({ id: existing.id, label, existing: true }),
          );
          return;
        }
        const entry = { id: randomUUID(), label, command: path };
        const next = [...saved, entry];
        if (registryFile) {
          const temporary = `${registryFile}.${randomUUID()}.tmp`;
          writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", {
            mode: 0o600,
          });
          renameSync(temporary, registryFile);
        }
        saved.push(entry);
        registry.set(entry.id, { ...entry, args: [] });
        response.writeHead(201).end(JSON.stringify({ id: entry.id, label }));
      } catch (error) {
        response
          .writeHead(400)
          .end(JSON.stringify({ error: error.message || "Moteur refusé." }));
      } finally {
        registering = false;
      }
      return;
    }
    if (request.method !== "GET" || request.url !== "/engines") {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    // Les chemins et arguments restent privés au pont ; le navigateur choisit un identifiant.
    response.end(
      JSON.stringify(
        [...registry.values()].map(({ id, label }) => ({ id, label })),
      ),
    );
  });
  const server = new WebSocketServer({
    server: http,
    maxPayload: 16384,
    // Une page tierce ne doit pas pouvoir lancer des processus locaux.
    verifyClient: ({ origin }) => origins.includes(origin),
  });
  const children = new Set();
  server.on("connection", (socket, request) => {
    const id =
      new URL(request.url, "http://127.0.0.1").searchParams.get("engine") ??
      "default";
    const selected = registry.get(id);
    if (!selected) {
      socket.close(
        1008,
        "Moteur non configure. Actualisez la liste des moteurs.",
      );
      return;
    }
    const child = spawn(selected.command, selected.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    children.add(child);
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let stopping = false;
    let killTimer;
    function stop() {
      if (stopping) return;
      stopping = true;
      if (child.exitCode === null && child.pid) {
        if (!child.stdin.destroyed) child.stdin.end("quit\n");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      }
    }
    child.on("error", () =>
      socket.close(1011, "Impossible de lancer le binaire du moteur."),
    );
    child.stdin.on("error", () =>
      socket.close(1011, "Entree du moteur fermee."),
    );
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.on("close", () => {
      clearTimeout(killTimer);
      children.delete(child);
      lines.close();
      socket.close(1000, "Moteur termine.");
    });
    lines.on("line", (line) => {
      if (line.startsWith("id name ") && line.slice(8).trim())
        selected.label = line.slice(8).trim().slice(0, 100);
      if (socket.readyState === WebSocket.OPEN) socket.send(line);
    });
    socket.on("message", (data, binary) => {
      const commandLine = data.toString();
      if (binary || !commandLine.trim() || /[\r\n\0]/.test(commandLine)) {
        socket.close(1008, "Une commande UCI par message.");
        return;
      }
      if (commandLine === "quit") stop();
      else if (!stopping && !child.stdin.destroyed)
        child.stdin.write(`${commandLine}\n`);
    });
    socket.on("close", stop);
    socket.on("error", stop);
  });
  http.on("error", (error) => server.emit("error", error));
  http.listen(port, "127.0.0.1");
  return {
    server,
    async close() {
      probeController.abort();
      const exits = [...children].map(
        (child) => new Promise((resolve) => child.once("close", resolve)),
      );
      for (const socket of server.clients) socket.terminate();
      await Promise.all(exits);
      await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => http.close(resolve));
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf("--engines");
  let engines = [];
  if (configIndex !== -1) {
    try {
      if (!args[configIndex + 1])
        throw new Error("Chemin de configuration manquant.");
      const config = resolve(args[configIndex + 1]);
      engines = JSON.parse(readFileSync(config, "utf8"));
      if (!Array.isArray(engines))
        throw new Error("Le fichier doit contenir un tableau de moteurs.");
      engines = engines.map((engine) => ({
        ...engine,
        command:
          typeof engine.command === "string" &&
          !isAbsolute(engine.command) &&
          /[\\/]/.test(engine.command)
            ? resolve(dirname(config), engine.command)
            : engine.command,
      }));
      args.splice(configIndex, 2);
    } catch (error) {
      console.error(`Configuration : ${error.message}`);
      process.exit(1);
    }
  }
  const command = args.shift() || process.env.CHESS_ENGINE;
  if (!command) {
    console.error(
      "Usage : npm run engine:bridge -- /chemin/vers/shallowred [--engines moteurs.json]",
    );
    process.exitCode = 1;
  } else {
    const bridge = startBridge({
      command,
      args,
      engines,
      registryFile: fileURLToPath(
        new URL("./engines.local.json", import.meta.url),
      ),
    });
    bridge.server.on("listening", () =>
      console.log("Pont UCI : ws://127.0.0.1:8787"),
    );
    bridge.server.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        void bridge.close();
      });
  }
}
