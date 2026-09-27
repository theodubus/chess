import { once } from "node:events";
import { createServer } from "node:net";
import { get } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { startApplication } from "./start.mjs";
import {
  connectDevelopmentEngine,
  listAnalysisEngines,
  analysisEngineFactory,
} from "../src/engine/DevelopmentEngine";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllGlobals();
});
const fixture = fileURLToPath(new URL("./fixture-probe.mjs", import.meta.url));
const options = {
  command: process.execPath,
  args: [fixture],
  port: 5173,
  registryFile: null,
};

beforeEach(async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  options.port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
});

it("sert le front et le moteur sur la même adresse, sur un port différent de 5173", async () => {
  app = await startApplication(options);
  expect(await (await fetch(app.url)).text()).toContain('<div id="root">');
  vi.stubGlobal("window", { location: { href: app.url } });
  vi.stubGlobal(
    "WebSocket",
    class extends WebSocket {
      constructor(url) {
        super(url, { origin: app.url });
      }
    },
  );
  expect(await listAnalysisEngines()).toContainEqual(
    expect.objectContaining({ id: "default" }),
  );
  for (const factory of [
    connectDevelopmentEngine,
    analysisEngineFactory("default"),
  ]) {
    const engine = await factory(() => {});
    const ready = new Promise((resolve) =>
      engine.onLine((line) => {
        if (line === "readyok") resolve();
      }),
    );
    engine.send("isready");
    await ready;
    await engine.dispose();
  }
  expect(
    (
      await fetch(`${app.url}/engine/engines`, {
        headers: { Origin: "https://example.com" },
      })
    ).status,
  ).toBe(403);
  const foreignHost = await new Promise((resolve, reject) => {
    get(
      `${app.url}/engine/engines`,
      { headers: { Host: "example.com" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    ).on("error", reject);
  });
  expect(foreignHost).toBe(403);
  await connectDevelopmentEngine(() => {});
  const url = app.url;
  await app.close();
  await expect(fetch(url)).rejects.toThrow();
}, 20000);

it("refuse un moteur absent ou invalide avant de démarrer le front", async () => {
  await expect(
    startApplication({ ...options, command: "/absent/shallowred" }),
  ).rejects.toThrow("Moteur absent");
  await expect(
    startApplication({ ...options, args: [fixture, "no-score"] }),
  ).rejects.toThrow("évaluation");
});

it("signale un port occupé et nettoie le pont au lieu de changer silencieusement d’adresse", async () => {
  const occupied = createServer();
  occupied.listen(0, "127.0.0.1");
  await once(occupied, "listening");
  try {
    await expect(
      startApplication({ ...options, port: occupied.address().port }),
    ).rejects.toThrow("déjà occupé");
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  // Une tentative ratée n'empêche pas le lancement suivant.
  app = await startApplication(options);
  expect((await fetch(`${app.url}/engine/engines`)).status).toBe(200);
}, 20000);
