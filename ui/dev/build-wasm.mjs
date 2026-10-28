// Construit les trois modules du moteur web et les dépose là où
// `src/engine/WebEngine.ts` les importe.
//
// - `shallowred.wasm` et `shallowred-simd.wasm` : le pilote `ui/wasm`, sur un
//   fil, pour le repli. Deux, comme les deux binaires natifs : le SIMD de
//   WebAssembly va environ deux fois plus vite, mais Safari ne le connaît
//   que depuis la version 16.4.
// - `shallowred-threads.wasm` : le BINAIRE du moteur lui-même
//   (`engine/src/main.rs`), compilé pour `wasm32-wasip1-threads` — sa boucle
//   UCI, son ponder, ses fils. Rien n'y est écrit pour le web.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const crate = fileURLToPath(new URL("../wasm/", import.meta.url));
const destination = fileURLToPath(new URL("../src/engine/web/", import.meta.url));
const SIMD = "-C target-feature=+simd128";

function cargo(cwd, args, rustflags) {
  execFileSync("cargo", ["build", "--locked", "--release", ...args], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, RUSTFLAGS: rustflags },
  });
}

mkdirSync(destination, { recursive: true });
for (const { file, flags } of [
  { file: "shallowred.wasm", flags: "" },
  { file: "shallowred-simd.wasm", flags: SIMD },
]) {
  const targetDir = `target/${file.replace(".wasm", "")}`;
  cargo(crate, ["--target", "wasm32-wasip1", "--target-dir", targetDir], flags);
  copyFileSync(
    `${crate}${targetDir}/wasm32-wasip1/release/shallowred_web.wasm`,
    `${destination}${file}`,
  );
  console.log(`${file} prêt.`);
}

cargo(
  repository,
  ["--target", "wasm32-wasip1-threads", "-p", "shallowred", "--bin", "shallowred"],
  SIMD,
);
copyFileSync(
  `${repository}target/wasm32-wasip1-threads/release/shallowred.wasm`,
  `${destination}shallowred-threads.wasm`,
);
console.log("shallowred-threads.wasm prêt.");
