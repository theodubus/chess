import { it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeEngine } from "./probe-engine.mjs";
import { startBridge } from "./bridge.mjs";
const fixture = fileURLToPath(new URL("./fixture-probe.mjs", import.meta.url));
it("valide nom UCI, score et coups légaux dans les trois positions", async () => {
  expect(await probeEngine(process.execPath, { args: [fixture] })).toBe(
    "Test UCI",
  );
});
it("refuse un programme absent, silencieux, sans score ou renvoyant un coup illégal", async () => {
  await expect(probeEngine("/absent/engine")).rejects.toThrow("Impossible");
  await expect(
    probeEngine(process.execPath, { args: [fixture, "silent"], timeout: 200 }),
  ).rejects.toThrow("délai");
  await expect(
    probeEngine(process.execPath, { args: [fixture, "no-score"] }),
  ).rejects.toThrow("évaluation");
  await expect(
    probeEngine(process.execPath, { args: [fixture, "illegal"] }),
  ).rejects.toThrow("illégal");
});
it.skipIf(!process.env.CHESS_STOCKFISH_BINARY)(
  "ajoute un vrai moteur, persiste son nom et refuse les ajouts non autorisés ou invalides",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "chess-registry-"));
    const registryFile = join(directory, "engines.json");
    let bridge = startBridge({
      command: process.env.CHESS_ENGINE_BINARY || process.execPath,
      port: 0,
      registryFile,
    });
    try {
      await once(bridge.server, "listening");
      let url = `http://127.0.0.1:${bridge.server.address().port}/engines`;
      const headers = {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      };
      expect(
        (
          await fetch(url, {
            method: "POST",
            headers: { ...headers, Origin: "https://example.com" },
            body: "{}",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(url, {
            method: "POST",
            headers: { ...headers, "Content-Type": "text/plain" },
            body: "{}",
          })
        ).status,
      ).toBe(415);
      const bad = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ path: "/absent/engine" }),
      });
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toContain("absent");
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ path: process.env.CHESS_STOCKFISH_BINARY }),
      });
      expect(response.status).toBe(201);
      const entry = await response.json();
      expect(entry.label).toMatch(/Stockfish/);
      const saved = JSON.parse(await readFile(registryFile, "utf8"));
      expect(saved).toHaveLength(1);
      const duplicate = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ path: process.env.CHESS_STOCKFISH_BINARY }),
      });
      expect((await duplicate.json()).id).toBe(entry.id);
      await bridge.close();
      bridge = startBridge({
        command: process.execPath,
        port: 0,
        registryFile,
      });
      await once(bridge.server, "listening");
      url = `http://127.0.0.1:${bridge.server.address().port}/engines`;
      const list = await (await fetch(url, { headers })).json();
      expect(list).toContainEqual({ id: entry.id, label: entry.label });
      expect(JSON.stringify(list)).not.toContain(
        process.env.CHESS_STOCKFISH_BINARY,
      );
    } finally {
      await bridge.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  15000,
);
