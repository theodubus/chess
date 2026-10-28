import { expect, it } from "vitest";
import { SharedInput } from "./sharedInput.ts";
import { MAX_SLOTS, ThreadSlots } from "./threadRuntime.ts";
import { importedMemoryLimits } from "./wasmMemory.ts";
import { allocateSharedMemory } from "./threadedEngine.ts";

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

it("l'entrée partagée rend les octets dans l'ordre, y compris à travers le bord de l'anneau", () => {
  const input = SharedInput.create(16);
  const target = new Uint8Array(new SharedArrayBuffer(16));
  input.write(encode("go depth 3\n"));
  expect(decode(target.slice(0, input.read(target)))).toBe("go depth 3\n");
  // L'anneau a avancé de 11 octets : la suite le traverse.
  input.write(encode("isready\n"));
  const small = new Uint8Array(new SharedArrayBuffer(5));
  expect(decode(small.slice(0, input.read(small)))).toBe("isrea");
  expect(decode(small.slice(0, input.read(small)))).toBe("dy\n");
});

it("l'entrée partagée refuse plutôt que d'écraser ce que le moteur n'a pas lu", () => {
  const input = SharedInput.create(8);
  input.write(encode("abcdef"));
  expect(() => input.write(encode("ghi"))).toThrow("saturée");
});

it("un fil ne se lance que sur un Worker prêt, et le Worker rendu sert au suivant", () => {
  const slots = new ThreadSlots();
  expect(slots.spawn(1234)).toBe(-1);
  slots.ready(0);
  slots.ready(1);
  expect(slots.readyCount()).toBe(2);
  const first = slots.spawn(1000);
  const second = slots.spawn(2000);
  expect([first, second]).toEqual([1, 2]);
  // Les deux sont pris : le pool est épuisé.
  expect(slots.spawn(3000)).toBe(-1);
  // Ce que chaque Worker lit est ce qu'on lui a demandé.
  expect(slots.next(0)).toEqual([1, 1000]);
  expect(slots.next(1)).toEqual([2, 2000]);
  slots.release(0);
  expect(slots.spawn(4000)).toBe(3);
  expect(slots.next(0)).toEqual([3, 4000]);
  expect(MAX_SLOTS).toBeGreaterThan(8);
});

it("lit les limites de la mémoire importée dans le binaire", () => {
  // Un module minimal qui importe `env.memory`, partagée, 53 à 16 384 pages.
  const module = Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    2, 18, 1, 3, 101, 110, 118, 6, 109, 101, 109, 111, 114, 121, 2, 3, 53, 128, 128, 1,
  ]);
  expect(new WebAssembly.Module(module)).toBeInstanceOf(WebAssembly.Module);
  expect(importedMemoryLimits(module)).toEqual({
    initial: 53,
    maximum: 16384,
    shared: true,
  });
  expect(() =>
    importedMemoryLimits(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0])),
  ).toThrow("aucune mémoire");
});

it("la mémoire partagée prend le plus grand maximum accordé, sans dépasser celui du module", () => {
  const memory = allocateSharedMemory(53, 4096);
  expect(memory.buffer).toBeInstanceOf(SharedArrayBuffer);
  expect(memory.buffer.byteLength).toBe(53 * 65536);
  // Au-delà de son maximum déclaré, un module refuserait la mémoire : 256 Mio
  // (4 096 pages) ici, même si le navigateur accorderait plus.
  expect(() => memory.grow(4096 - 53 + 1)).toThrow();
});
