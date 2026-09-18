import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { connectDevelopmentEngine } from "../src/engine/DevelopmentEngine";
import { UciSession } from "../src/engine/UciSession";
import { startBridge } from "./bridge.mjs";

let bridge;
afterEach(async () => {
  await bridge?.close();
  vi.unstubAllGlobals();
});

async function connect(
  command = process.execPath,
  origin = "http://localhost:5173",
) {
  bridge = startBridge({
    command,
    args: [fileURLToPath(new URL("./fixture-engine.mjs", import.meta.url))],
    port: 0,
  });
  await once(bridge.server, "listening");
  const socket = new WebSocket(
    `ws://127.0.0.1:${bridge.server.address().port}`,
    { origin },
  );
  await once(socket, "open");
  return socket;
}

it("relaie les lignes fragmentées, initialise le moteur puis quitte proprement", async () => {
  const socket = await connect();
  const lines = [];
  const handshake = new Promise((resolve) =>
    socket.on("message", (data) => {
      const line = data.toString();
      lines.push(line);
      if (line === "uciok") socket.send("isready");
      if (line === "readyok") resolve();
    }),
  );
  socket.send("uci");
  await handshake;
  expect(lines).toEqual(["id name Processus de test", "uciok", "readyok"]);
  const closed = once(socket, "close");
  socket.send("quit");
  expect((await closed)[0]).toBe(1000);
});

it("refuse les commandes multilignes", async () => {
  const socket = await connect();
  const closed = once(socket, "close");
  socket.send("uci\nisready");
  expect((await closed)[0]).toBe(1008);
});

it("ferme avec une erreur si le binaire est absent", async () => {
  const socket = await connect("/chemin/inexistant/chess-engine");
  expect((await once(socket, "close"))[0]).toBe(1011);
});

it("refuse une page extérieure au serveur de développement", async () => {
  await expect(
    connect(process.execPath, "https://example.com"),
  ).rejects.toThrow("401");
});

it("connecte la session via son adaptateur réel et détecte la perte du moteur", async () => {
  bridge = startBridge({
    command: process.execPath,
    args: [fileURLToPath(new URL("./fixture-engine.mjs", import.meta.url))],
    port: 0,
  });
  await once(bridge.server, "listening");
  vi.stubGlobal(
    "WebSocket",
    class extends WebSocket {
      constructor(url) {
        super(url, { origin: "http://localhost:5173" });
      }
    },
  );
  let session;
  const failure = vi.fn((message) => session.fail(message));
  const engine = await connectDevelopmentEngine(
    failure,
    `ws://127.0.0.1:${bridge.server.address().port}`,
  );
  let latest;
  const ready = new Promise((resolve) => {
    session = new UciSession(engine, (snapshot) => {
      latest = snapshot;
      if (snapshot.state === "ready") resolve();
    });
  });
  session.start();
  await ready;
  expect(latest.name).toBe("Processus de test");
  expect(latest.log.map((entry) => entry.line)).toContain("readyok");
  await bridge.close();
  bridge = undefined;
  await vi.waitFor(() => expect(failure).toHaveBeenCalled());
  expect(latest.state).toBe("error");
  await session.dispose();
});

it("expose uniquement les noms autorisés et refuse les origines étrangères", async () => {
  bridge = startBridge({
    command: process.execPath,
    port: 0,
    engines: [
      { id: "second", label: "Second moteur", command: "/private/path/engine" },
    ],
  });
  await once(bridge.server, "listening");
  const url = `http://127.0.0.1:${bridge.server.address().port}/engines`;
  const response = await fetch(url, {
    headers: { Origin: "http://localhost:5173" },
  });
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:5173",
  );
  expect(await response.json()).toEqual([
    { id: "default", label: basename(process.execPath) },
    { id: "second", label: "Second moteur" },
  ]);
  expect(
    (await fetch(url, { headers: { Origin: "https://example.com" } })).status,
  ).toBe(403);
});

it("sélectionne un moteur configuré sans accepter un chemin fourni par le navigateur", async () => {
  bridge = startBridge({
    command: "/chemin/inexistant/default",
    port: 0,
    engines: [
      {
        id: "second",
        label: "Second moteur",
        command: process.execPath,
        args: [fileURLToPath(new URL("./fixture-engine.mjs", import.meta.url))],
      },
    ],
  });
  await once(bridge.server, "listening");
  const url = `ws://127.0.0.1:${bridge.server.address().port}`;
  const socket = new WebSocket(`${url}/?engine=second`, {
    origin: "http://localhost:5173",
  });
  await once(socket, "open");
  const ready = new Promise((resolve) =>
    socket.on("message", (data) => {
      if (data.toString() === "uciok") resolve();
    }),
  );
  socket.send("uci");
  await ready;
  const closed = once(socket, "close");
  socket.send("quit");
  await closed;
  const unknown = new WebSocket(`${url}/?engine=/usr/bin/sh`, {
    origin: "http://localhost:5173",
  });
  const refused = once(unknown, "close");
  expect((await refused)[0]).toBe(1008);
});

it("rejette une configuration ambiguë avant de créer le serveur", () => {
  expect(() =>
    startBridge({
      command: process.execPath,
      port: 0,
      engines: [{ id: "default", label: "Autre", command: process.execPath }],
    }),
  ).toThrow("Configuration");
});
