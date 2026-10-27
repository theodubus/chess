// Construit les deux modules du moteur web (`ui/wasm`) et les dépose là où
// `src/engine/WebEngine.ts` les importe. Deux, comme les deux binaires natifs :
// le SIMD de WebAssembly va environ deux fois et demie plus vite, mais Safari
// ne le connaît que depuis la version 16.4.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const crate = fileURLToPath(new URL("../wasm/", import.meta.url));
const destination = fileURLToPath(new URL("../src/engine/web/", import.meta.url));
const variants = [
  { file: "shallowred.wasm", flags: "" },
  { file: "shallowred-simd.wasm", flags: "-C target-feature=+simd128" },
];

mkdirSync(destination, { recursive: true });
for (const { file, flags } of variants) {
  const targetDir = `target/${file.replace(".wasm", "")}`;
  execFileSync(
    "cargo",
    ["build", "--locked", "--release", "--target", "wasm32-wasip1", "--target-dir", targetDir],
    { cwd: crate, stdio: "inherit", env: { ...process.env, RUSTFLAGS: flags } },
  );
  copyFileSync(
    `${crate}${targetDir}/wasm32-wasip1/release/shallowred_web.wasm`,
    `${destination}${file}`,
  );
  console.log(`${file} prêt.`);
}
