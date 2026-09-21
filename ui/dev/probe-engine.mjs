import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";

/** Tester le protocole et quelques recherches, pas la force ni la sûreté du programme. */
export async function probeEngine(
  command,
  { args = [], timeout = 5000, signal } = {},
) {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let name = "",
    stage = "uci",
    pending,
    timer,
    volume = 0;
  let failure;
  const fail = (message) => {
    failure = new Error(message);
    pending?.reject(failure);
  };
  const abort = () => fail("Vérification annulée.");
  const overall = setTimeout(
    () => fail("La vérification du moteur a dépassé 20 secondes."),
    20000,
  );
  signal?.addEventListener("abort", abort, { once: true });
  child.on("error", () =>
    fail(
      "Impossible de lancer ce programme. Vérifiez le chemin et les droits d’exécution.",
    ),
  );
  child.on("close", () => {
    if (stage !== "done")
      fail("Le programme s’est arrêté avant la fin des tests UCI.");
  });
  child.stdin.on("error", () => fail("Le programme a fermé son entrée UCI."));
  child.stderr.on("data", (data) => {
    volume += data.length;
    if (volume > 1024 * 1024) fail("Le programme produit trop de données.");
  });
  child.stdout.on("data", (data) => {
    volume += data.length;
    if (volume > 1024 * 1024) fail("Le programme produit trop de données.");
  });
  let handler = () => {};
  lines.on("line", (line) => {
    if (volume > 1024 * 1024) {
      fail("Le programme produit trop de données.");
      return;
    }
    if (line.startsWith("id name ")) name = line.slice(8).trim().slice(0, 100);
    handler(line);
  });
  async function exchange(commands, receive) {
    if (failure) throw failure;
    if (signal?.aborted) throw new Error("Vérification annulée.");
    await new Promise((resolve, reject) => {
      pending = { resolve, reject };
      timer = setTimeout(
        () =>
          fail(
            "Le programme ne répond pas au protocole UCI dans le délai imparti.",
          ),
        timeout,
      );
      handler = (line) => {
        try {
          if (receive(line)) resolve();
        } catch (error) {
          reject(error);
        }
      };
      child.stdin.write(commands.join("\n") + "\n");
    }).finally(() => {
      clearTimeout(timer);
      pending = null;
      handler = () => {};
    });
  }
  try {
    await exchange(["uci"], (line) => line === "uciok");
    if (!name)
      throw new Error("Le programme n’annonce aucun nom de moteur UCI.");
    stage = "ready";
    await exchange(["ucinewgame", "isready"], (line) => line === "readyok");
    const black = new Chess();
    black.move("e4");
    const custom = new Chess();
    custom.move("d4");
    custom.move("d5");
    for (const [board, position] of [
      [new Chess(), "position startpos"],
      [black, "position startpos moves e2e4"],
      [custom, `position fen ${custom.fen()}`],
    ]) {
      stage = "search";
      let scored = false;
      await exchange([position, "isready"], (line) => {
        if (/invalid position|illegal move|position ignorée/i.test(line))
          throw new Error("Le moteur refuse une position légale.");
        return line === "readyok";
      });
      await exchange(["go movetime 150"], (line) => {
        if (line.startsWith("info ") && !line.startsWith("info string ")) {
          const score = /\bscore (?:cp|mate) (-?\d+)(?:\s|$)/.exec(line);
          if (score && Number.isSafeInteger(Number(score[1]))) scored = true;
          const pv = line.split(/\bpv\s+/)[1];
          if (pv) {
            const copy = new Chess(board.fen());
            const moves = pv.trim().split(/\s+/);
            if (moves.length > 128)
              throw new Error("Le moteur renvoie une variante trop longue.");
            try {
              for (const move of moves) {
                if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
                  throw new Error();
                copy.move({
                  from: move.slice(0, 2),
                  to: move.slice(2, 4),
                  promotion: move[4],
                });
              }
            } catch {
              throw new Error(
                "Le moteur renvoie une variante illégale ou mal formée.",
              );
            }
          }
        }
        if (!line.startsWith("bestmove")) return false;
        const uci =
          /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)(?: ponder [a-h][1-8][a-h][1-8][qrbn]?)?$/.exec(
            line,
          )?.[1];
        if (
          !board
            .moves({ verbose: true })
            .some(
              (move) => move.from + move.to + (move.promotion ?? "") === uci,
            )
        )
          throw new Error("Le moteur renvoie un coup illégal ou mal formé.");
        if (!scored)
          throw new Error(
            "Le moteur ne fournit pas d’évaluation exploitable pour l’analyse.",
          );
        return true;
      });
    }
    return name;
  } finally {
    stage = "done";
    clearTimeout(overall);
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    lines.close();
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      await new Promise((resolve) => {
        const kill = setTimeout(() => child.kill("SIGKILL"), 500);
        child.once("close", () => {
          clearTimeout(kill);
          resolve();
        });
        if (!child.stdin.destroyed) child.stdin.end("quit\n");
      });
    }
  }
}
