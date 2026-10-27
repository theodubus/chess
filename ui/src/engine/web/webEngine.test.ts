import { expect, it } from "vitest";
import { createWebEngine, type WorkerLike } from "./webEngine";

/** Un Worker dont on lit ce qu'il reçoit et à qui on fait dire des lignes. */
class FakeWorker implements WorkerLike {
  received: unknown[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: unknown) {
    this.received.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  say(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  lines() {
    return this.received.map((message) => (message as { line: string }).line);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const failures: string[] = [];
  const engine = createWebEngine(
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    (message) => failures.push(message),
  );
  const heard: string[] = [];
  engine.onLine((line) => heard.push(line));
  return { engine, workers, failures, heard };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it("relaie les commandes au Worker et ses lignes à l'interface", () => {
  const { engine, workers, heard } = setup();
  engine.send("uci");
  workers[0].say({ line: "uciok" });
  expect(workers[0].lines()).toEqual(["uci"]);
  expect(heard).toEqual(["uciok"]);
});

it("répond readyok pendant une recherche, que le Worker ne lirait qu'après", async () => {
  const { engine, workers, heard } = setup();
  engine.send("go movetime 1000");
  engine.send("isready");
  expect(workers[0].lines()).toEqual(["go movetime 1000"]);
  expect(heard).toEqual([]);
  await settle();
  expect(heard).toEqual(["readyok"]);
  workers[0].say({ line: "bestmove e2e4" });
  engine.send("isready");
  expect(workers[0].lines()).toEqual(["go movetime 1000", "isready"]);
});

it("stop remplace le Worker et rend le coup de la dernière variante", async () => {
  const { engine, workers, heard } = setup();
  engine.send("setoption name Hash value 16");
  engine.send("position startpos moves e2e4");
  engine.send("go movetime 10000");
  workers[0].say({ line: "info depth 5 score cp 20 nodes 900 pv c7c5 g1f3" });
  workers[0].say({ line: "info depth 6 score cp 25 nodes 2000 pv e7e5 g1f3" });
  engine.send("stop");
  expect(workers[0].terminated).toBe(true);
  expect(workers[1].lines()).toEqual([
    "setoption name Hash value 16",
    "position startpos moves e2e4",
  ]);
  await settle();
  expect(heard.at(-1)).toBe("bestmove e7e5");
  // Le Worker remplacé ne parle plus à personne.
  workers[0].say({ line: "bestmove c7c5" });
  expect(heard.filter((line) => line.startsWith("bestmove"))).toEqual([
    "bestmove e7e5",
  ]);
});

it("stop avant toute variante attend la première", async () => {
  const { engine, workers, heard } = setup();
  engine.send("go movetime 10000");
  engine.send("stop");
  expect(workers).toHaveLength(1);
  workers[0].say({ line: "info depth 1 score cp 30 nodes 20 pv d2d4" });
  expect(workers).toHaveLength(2);
  await settle();
  expect(heard).toEqual([
    "info depth 1 score cp 30 nodes 20 pv d2d4",
    "bestmove d2d4",
  ]);
});

it("stop et ponderhit hors recherche ne font rien", () => {
  const { engine, workers, heard } = setup();
  engine.send("stop");
  engine.send("ponderhit");
  expect(workers).toHaveLength(1);
  expect(workers[0].lines()).toEqual([]);
  expect(heard).toEqual([]);
});

it("une recherche finie n'est plus arrêtée, et ucinewgame oublie la position", async () => {
  const { engine, workers } = setup();
  engine.send("position startpos moves e2e4");
  engine.send("ucinewgame");
  engine.send("go depth 3");
  workers[0].say({ line: "info depth 1 score cp 30 nodes 20 pv d2d4" });
  workers[0].say({ line: "bestmove d2d4" });
  engine.send("stop");
  expect(workers).toHaveLength(1);
  engine.send("go movetime 5000");
  workers[0].say({ line: "info depth 1 score cp 30 nodes 20 pv g1f3" });
  engine.send("stop");
  expect(workers[1].lines()).toEqual([]);
});

it("go perft ne compte pas comme une recherche à arrêter", () => {
  const { engine, workers } = setup();
  engine.send("go perft 4");
  engine.send("isready");
  expect(workers[0].lines()).toEqual(["go perft 4", "isready"]);
});

it("une panique du moteur coupe la session et le dit", () => {
  const { engine, workers, failures } = setup();
  workers[0].say({ error: "Le moteur web s’est arrêté : panique" });
  expect(failures).toEqual(["Le moteur web s’est arrêté : panique"]);
  expect(workers[0].terminated).toBe(true);
  expect(() => engine.send("isready")).toThrow("Moteur déconnecté.");
});

it("quit et dispose libèrent le Worker", async () => {
  const { engine, workers } = setup();
  engine.send("quit");
  expect(workers[0].terminated).toBe(true);
  await engine.dispose();
  expect(() => engine.send("uci")).toThrow("Moteur déconnecté.");
});
