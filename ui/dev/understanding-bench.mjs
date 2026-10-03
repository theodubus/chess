import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { compare: { type: "string" }, output: { type: "string" } } });
const server = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
try {
  const [{ corpus, corpusInput }, { externalCorpus }, { understandDecision }] = await Promise.all([
    server.ssrLoadModule("/src/review/understanding/corpus.ts"),
    server.ssrLoadModule("/src/review/understanding/externalCorpus.ts"),
    server.ssrLoadModule("/src/review/understanding/prototype.ts"),
  ]);
  const rows = [];
  for (const test of [...corpus, ...externalCorpus]) {
    const { position, result } = corpusInput(test), started = performance.now();
    const understanding = understandDecision(position, result);
    rows.push({ id: test.id, elapsedMs: performance.now() - started,
      hash: createHash("sha256").update(JSON.stringify(understanding)).digest("hex") });
  }
  const report = { rows, totalMs: rows.reduce((total, r) => total + r.elapsedMs, 0) };
  if (values.compare) {
    const baseline = JSON.parse(await readFile(resolve(root, values.compare), "utf8"));
    // Comparer aussi les identités retirées : un corpus réduit ne doit pas
    // passer pour une optimisation qui conserve tous les faits.
    report.changed = [...new Set([...rows, ...baseline.rows].map((r) => r.id))]
      .filter((id) => rows.find((r) => r.id === id)?.hash !== baseline.rows.find((r) => r.id === id)?.hash);
    report.beforeMs = baseline.totalMs;
    if (report.changed.length) process.exitCode = 1;
  }
  if (values.output) await writeFile(resolve(root, values.output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, rows: report.rows.map((r) => ({ id: r.id, ms: Math.round(r.elapsedMs) })) }, null, 2));
} finally { await server.close(); }
