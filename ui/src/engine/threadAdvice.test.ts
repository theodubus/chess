import { expect, it } from "vitest";
import { logicalCores, threadAdvice } from "./threadAdvice";
const options = { threads: 1, ponder: false };

it("réserve une marge pour l’UI contre un humain, même avec ponder", () => {
  expect(threadAdvice(8, options).limit).toBe(7);
  expect(threadAdvice(8, { ...options, ponder: true }).limit).toBe(7);
  expect(threadAdvice(1, options).limit).toBe(1);
});
it("ne partage pas artificiellement les cœurs entre deux recherches qui alternent", () => {
  expect(threadAdvice(8, options, { threads: 7, ponder: false })).toMatchObject({ limit: 7, shared: false });
});
it("partage les ressources dès qu’un des deux moteurs pondère et tient compte de l’autre réglage", () => {
  for (const [ourPonder, theirPonder] of [[true, false], [false, true], [true, true]]) {
    const current = { ...options, ponder: ourPonder };
    expect(threadAdvice(8, current, { ...options, ponder: theirPonder })).toMatchObject({ limit: 3, shared: true });
    expect(threadAdvice(8, current, { threads: 6, ponder: theirPonder }).limit).toBe(1);
  }
});
it("garde un conseil utilisable sur un petit appareil ou avec des valeurs absentes", () => {
  for (const value of [undefined, NaN, 0, -1, 1.5]) expect(logicalCores(value)).toBe(1);
  for (const cores of [1, 2, 3]) expect(threadAdvice(cores, { ...options, ponder: true }, options).limit).toBe(1);
  expect(threadAdvice(8, { ...options, ponder: true }, { ...options, threads: NaN }).limit).toBe(3);
});
