import { expect, it } from "vitest";
import { createWasi, WasiExit } from "./wasi";

/** Une mémoire et ses vecteurs d'entrée-sortie, posés comme le ferait Rust. */
function setup(now = () => 1234.5678) {
  const lines: string[] = [];
  const errors: string[] = [];
  const wasi = createWasi({
    onLine: (line) => lines.push(line),
    onError: (text) => errors.push(text),
    now,
  });
  const memory = new WebAssembly.Memory({ initial: 1 });
  wasi.bind(memory);
  const view = new DataView(memory.buffer);
  const imports = wasi.imports.wasi_snapshot_preview1 as unknown as Record<
    string,
    (...args: unknown[]) => number
  >;
  // Un vecteur unique en 0 qui pointe vers 64 octets à l'adresse 100.
  const write = (fd: number, bytes: Uint8Array) => {
    new Uint8Array(memory.buffer, 100, bytes.length).set(bytes);
    view.setUint32(0, 100, true);
    view.setUint32(4, bytes.length, true);
    return imports.fd_write(fd, 0, 1, 8);
  };
  const read = (capacity: number) => {
    view.setUint32(0, 100, true);
    view.setUint32(4, capacity, true);
    const status = imports.fd_read(0, 0, 1, 8);
    const count = view.getUint32(8, true);
    return {
      status,
      text: new TextDecoder().decode(
        new Uint8Array(memory.buffer, 100, count),
      ),
    };
  };
  return { wasi, imports, view, lines, errors, write, read };
}

it("rend les lignes entières, même coupées entre deux écritures", () => {
  const { write, lines } = setup();
  const encoded = new TextEncoder().encode("info string évaluation\nbestmove e2");
  // Coupé au milieu du « é » : deux octets UTF-8.
  expect(write(1, encoded.slice(0, 13))).toBe(0);
  write(1, encoded.slice(13));
  expect(lines).toEqual(["info string évaluation"]);
  write(1, new TextEncoder().encode("e4\n"));
  expect(lines).toEqual(["info string évaluation", "bestmove e2e4"]);
});

it("sépare la sortie d'erreur, où tombe un message de panique", () => {
  const { write, lines, errors } = setup();
  write(2, new TextEncoder().encode("panicked at src/lib.rs"));
  expect(lines).toEqual([]);
  expect(errors.join("")).toBe("panicked at src/lib.rs");
});

it("sert l'entrée standard depuis la file, puis une fin de flux", () => {
  const { wasi, read } = setup();
  wasi.push("position startpos");
  wasi.push("go depth 1");
  expect(read(10)).toEqual({ status: 0, text: "position s" });
  expect(read(64)).toEqual({ status: 0, text: "tartpos\ngo depth 1\n" });
  expect(read(64)).toEqual({ status: 0, text: "" });
});

it("donne l'horloge monotone en nanosecondes", () => {
  const { imports, view } = setup();
  expect(imports.clock_time_get(1, 0n, 16)).toBe(0);
  expect(view.getBigUint64(16, true)).toBe(1_234_568_000n);
  expect(imports.clock_time_get(7, 0n, 16)).toBe(28);
});

it("refuse les descripteurs inconnus et transforme proc_exit en exception", () => {
  const { imports, write } = setup();
  expect(write(3, new Uint8Array(1))).toBe(8);
  expect(imports.fd_read(5, 0, 0, 8)).toBe(8);
  expect(() => imports.proc_exit(101)).toThrow(WasiExit);
});
