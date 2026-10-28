// Le moteur web répond-il exactement comme le binaire ?
//
// Joue le même scénario UCI contre le binaire natif et contre chaque module
// WebAssembly, et exige des transcriptions identiques — mêmes nœuds, mêmes
// scores, mêmes variantes, mêmes coups — au temps et au débit près. Une
// recherche à un fil et à profondeur fixe est déterministe au nœud près
// (CLAUDE.md de la racine) : tout écart dit que le pilote `ui/wasm`, sa copie
// de la couche UCI ou la compilation en WebAssembly ont dévié du moteur.
//
//   node dev/wasm-check.mjs [binaire natif] [module.wasm …]
//
// Par défaut : `target/release/shallowred` et les trois modules que
// `dev/build-wasm.mjs` dépose dans `src/engine/web/`. Le module à fils —
// le binaire du moteur lui-même, sa boucle UCI comprise — se reconnaît à
// son import `wasi.thread-spawn` ; il tourne ici dans des worker_threads,
// et à un fil il doit rendre la même transcription. Il annonce en plus les
// mêmes options que le binaire, et l'on y éprouve ce que lui seul sait
// faire : plusieurs fils, le ponder, `stop`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { Chess } from "chess.js";
import { createWasi } from "../src/engine/web/wasi.ts";
import { startThreadedEngine } from "../src/engine/web/threads/threadedEngine.ts";
import { importedMemoryLimits } from "../src/engine/web/threads/wasmMemory.ts";

const root = (path) => fileURLToPath(new URL(path, import.meta.url));
const [native = root("../../target/release/shallowred"), ...modules] =
  process.argv.slice(2);
if (!modules.length)
  modules.push(
    root("../src/engine/web/shallowred.wasm"),
    root("../src/engine/web/shallowred-simd.wasm"),
    root("../src/engine/web/shallowred-threads.wasm"),
  );

const KIWIPETE =
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";
const MATED = "6k1/5ppp/8/8/8/8/5PPP/3r2K1 w - - 0 1";
const STALEMATE = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
const PROMOTION = "8/P7/8/8/8/8/6k1/4K3 w - - 0 1";

// Ce que le scénario prétend de ses positions, vérifié par chess.js plutôt
// que par un échiquier mental (ui/CLAUDE.md).
const after = (fen, moves) => {
  const game = new Chess(fen);
  for (const move of moves) game.move(move);
  return game;
};
assert.deepEqual(
  new Chess(MATE_IN_ONE).moves().filter((move) => move.endsWith("#")),
  ["Rd8#"],
);
assert.ok(new Chess(MATED).isCheckmate());
assert.ok(new Chess(STALEMATE).isStalemate());
assert.ok(new Chess(PROMOTION).moves().includes("a8=Q+"));
assert.ok(after(KIWIPETE, ["O-O", "O-O-O"]).fen().startsWith("2kr3r/"));
assert.throws(() => after(new Chess().fen(), ["e2e5"]));

const scenario = [
  "ucinewgame",
  "position startpos",
  "go depth 12",
  "position startpos moves e2e4 c7c5 g1f3 d7d6",
  "go depth 13",
  // Le roque, à l'entrée comme à la sortie : la notation roi-prend-tour de
  // cozy-chess ne doit jamais franchir la frontière.
  `position fen ${KIWIPETE}`,
  "go depth 9",
  `position fen ${KIWIPETE} moves e1g1 e8c8`,
  "go depth 8",
  `position fen ${MATE_IN_ONE}`,
  "go depth 6",
  `position fen ${MATED}`,
  "go depth 4",
  `position fen ${STALEMATE}`,
  "go depth 4",
  `position fen ${PROMOTION}`,
  "go depth 10",
  "position startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1",
  "go depth 10",
  // Rejetée entière : le moteur garde la position précédente.
  "position startpos moves e2e4 e2e5",
  "go depth 6",
  "setoption name Hash value 8",
  "ucinewgame",
  "position startpos moves d2d4",
  "go nodes 30000",
  "go perft 3",
];

const normalise = (line) =>
  line.replace(/ time \d+/, "").replace(/ nps \d+/, "");
const finished = (command, line) =>
  /\bperft\b/.test(command)
    ? line.startsWith("Nodes searched")
    : line.startsWith("bestmove");

/**
 * Le scénario joué contre un moteur qui répond de façon asynchrone — le
 * binaire, ou le module à fils : chaque `go` attend son `bestmove`, chaque
 * autre commande est suivie d'`isready`, pour qu'aucune ne coupe la
 * précédente.
 */
async function asyncTranscript(write, next, label) {
  write("uci");
  const identification = [];
  for (;;) {
    const line = await next();
    identification.push(line);
    if (line === "uciok") break;
  }
  const transcript = [];
  for (const command of scenario) {
    const isGo = command.startsWith("go");
    write(command);
    if (!isGo) write("isready");
    const output = [];
    for (;;) {
      const value = await next();
      if (value === undefined)
        throw new Error(`${label} s'est arrêté après « ${command} ».`);
      if (!isGo && value === "readyok") break;
      output.push(normalise(value));
      if (isGo && finished(command, value)) break;
    }
    transcript.push({ command, output });
  }
  return { identification, transcript };
}

async function nativeTranscript() {
  const child = spawn(native, [], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const result = await asyncTranscript(
    (command) => child.stdin.write(`${command}\n`),
    async () => (await lines.next()).value,
    "Le binaire",
  );
  child.stdin.end("quit\n");
  return result;
}

/** Un Worker du moteur à fils dans Node, sous l'interface d'un Worker web. */
function nodeWorker() {
  const worker = new Worker(new URL("./wasm-thread-worker.mjs", import.meta.url));
  const handle = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
  };
  worker.on("message", (data) => handle.onmessage?.({ data }));
  worker.on("error", (error) => handle.onerror?.({ message: error.message }));
  return handle;
}

async function threadedTranscript(path, reference) {
  const bytes = readFileSync(path);
  let failure;
  const engine = await startThreadedEngine({
    module: await WebAssembly.compile(bytes),
    memory: importedMemoryLimits(bytes),
    createWorker: nodeWorker,
    onFailure: (message) => {
      failure = message;
    },
  });
  const queue = [];
  let wake = () => {};
  engine.onLine((line) => {
    queue.push(line);
    wake();
  });
  const next = async (ms = 60000) => {
    const end = Date.now() + ms;
    while (!queue.length) {
      if (failure) throw new Error(failure);
      if (Date.now() > end) return undefined;
      await new Promise((resolve) => {
        wake = resolve;
        setTimeout(resolve, 50);
      });
    }
    return queue.shift();
  };
  const result = await asyncTranscript(
    (command) => engine.send(command),
    next,
    "Le module à fils",
  );
  // Le même moteur : la même annonce, options comprises.
  assert.deepEqual(result.identification, reference.identification);

  const search = async (commands, label) => {
    queue.length = 0;
    for (const command of commands) engine.send(command);
    for (;;) {
      const line = await next(20000);
      assert.ok(line !== undefined, `${label} : pas de coup`);
      if (line.startsWith("bestmove")) return line;
    }
  };
  // Plusieurs fils : la recherche n'est plus déterministe, on n'exige qu'un
  // coup légal (CLAUDE.md de la racine, « Recherche déterministe »).
  const legal = new Chess();
  legal.move("e4");
  for (const threads of [2, 4]) {
    const line = await search(
      [
        `setoption name Threads value ${threads}`,
        "position startpos moves e2e4",
        "go movetime 400",
      ],
      `${threads} fils`,
    );
    const move = line.split(" ")[1];
    assert.ok(
      legal.moves({ verbose: true }).some((m) => m.lan === move),
      `${threads} fils : coup illégal ${move}`,
    );
  }
  // Le ponder : aucun coup avant `ponderhit`, puis un coup.
  queue.length = 0;
  engine.send("setoption name Threads value 1");
  engine.send("position startpos moves e2e4 e7e5");
  engine.send("go ponder wtime 4000 btime 4000");
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.ok(
    !queue.some((line) => line.startsWith("bestmove")),
    "un coup rendu pendant le ponder",
  );
  await search(["ponderhit"], "ponderhit");
  // `stop` interrompt un ponder et une recherche infinie.
  for (const go of ["go ponder wtime 60000 btime 60000", "go infinite"]) {
    queue.length = 0;
    engine.send("position startpos moves d2d4");
    engine.send(go);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const started = performance.now();
    await search(["stop"], `stop après ${go}`);
    assert.ok(performance.now() - started < 1000, `stop trop lent après ${go}`);
  }
  await engine.dispose();
  return result.transcript;
}

async function wasmTranscript(path) {
  let output = [];
  const wasi = createWasi({
    onLine: (line) => output.push(normalise(line)),
    onError: (text) => process.stderr.write(text),
  });
  const { instance } = await WebAssembly.instantiate(
    readFileSync(path),
    wasi.imports,
  );
  wasi.bind(instance.exports.memory);
  const run = (command) => {
    output = [];
    wasi.push(command);
    instance.exports.uci_input();
    return output;
  };
  // L'annonce diffère par construction : la version web ne propose ni le
  // ponder, ni plusieurs fils, ni EvalFile.
  const identification = run("uci");
  assert.equal(identification.at(-1), "uciok");
  assert.deepEqual(
    identification.filter((line) => line.startsWith("option ")).map(
      (line) => line.split(" ")[2],
    ),
    ["Hash"],
  );
  const transcript = scenario.map((command) => ({
    command,
    output: run(command),
  }));
  // Une recherche à la pendule n'est pas déterministe : on n'en exige qu'un
  // coup, rendu à temps.
  const started = performance.now();
  const timed = run("go wtime 2000 btime 2000 winc 20 binc 20").at(-1);
  assert.match(timed, /^bestmove [a-h][1-8][a-h][1-8]/);
  assert.ok(performance.now() - started < 2000, "pendule dépassée");
  return transcript;
}

const reference = await nativeTranscript();
for (const path of modules) {
  const threaded = WebAssembly.Module.imports(
    new WebAssembly.Module(readFileSync(path)),
  ).some((entry) => entry.module === "wasi" && entry.name === "thread-spawn");
  const transcript = threaded
    ? await threadedTranscript(path, reference)
    : await wasmTranscript(path);
  for (const [index, { command, output }] of reference.transcript.entries()) {
    assert.deepEqual(
      transcript[index].output,
      output,
      `${path} : « ${command} » diffère du binaire`,
    );
  }
  const searches = reference.transcript
    .flatMap(({ output }) => output)
    .filter((line) => line.startsWith("bestmove")).length;
  console.log(
    `${path.split("/").at(-1)} : ${scenario.length} commandes, ${searches} recherches, transcription identique au binaire${threaded ? " ; plusieurs fils, ponder et stop éprouvés" : ""}.`,
  );
}
// Les Workers du module à fils sont terminés ; rien d'autre ne retient Node.
process.exit(0);
