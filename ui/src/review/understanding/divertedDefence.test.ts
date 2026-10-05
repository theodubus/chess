import { expect, it } from "vitest";
import { corpusInput, type CorpusCase } from "./corpus";
import { decisionContext } from "./context";
import { divertedDefence, divertedDefenceSeed, divertedDefenceWork } from "./divertedDefence";
import { captureRelations } from "./relations";

// Suites exécutées avant inscription. Hypothèse structurelle seulement ; aucun
// score moteur ni bilan gagnant attendu n'est inventé pour ces positions.
const examples: CorpusCase[] = [
  { id: "white", fen: "7k/5q2/8/2Q5/8/8/1b6/R2R3K w - - 0 1", played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Kh2"] },
  { id: "black", fen: "r2r3k/1B6/8/8/2q5/8/5Q2/7K b - - 0 1", played: "Qd4", line: ["Qxd4+", "Rxd4", "Bxa8", "Kh7"] },
  { id: "pre-existing", fen: "7k/5q2/8/8/2Q5/8/1b6/R2R3K w - - 0 1", played: "Qd5", line: ["Qxd5+", "Rxd5", "Bxa1", "Kh2"] },
  { id: "still-defends", fen: "7k/q7/8/4b3/2QR4/8/8/3Q3K w - - 0 1", played: "Qca4", line: ["Qxa4", "Qxa4", "Bxd4", "Qxd4+"] },
].map((c) => ({ prefix: [], family: "recapture-diverts-defender", origin: "constructed", notes: "Faits légaux, pas de verdict pédagogique.", expected: {}, forbiddenClaims: ["forced-recapture", "winning-exchange", "unique-best"], ...c }));
const context = (id = "white") => { const input = corpusInput(examples.find((c) => c.id === id)!); return decisionContext(input.position, input.result); };
it.each(["white", "black"])("compose les deux attaquants et le même défenseur dans le camp %s", (id) => {
  const c = context(id), h = divertedDefence(c)!;
  expect(h).toMatchObject({ kind: "recapture-diverts-defender", role: "allows-loss", status: "hypothesis" });
  expect(h.firstAttackerId).not.toBe(h.secondAttackerId); expect(h.exposedId).not.toBe(h.victimId);
  expect(h.before.recaptures.some((r) => r.defenderId === h.defenderId)).toBe(true);
  expect(h.after.recaptures.some((r) => r.defenderId === h.defenderId)).toBe(false);
  expect(h.after.balanceAfterBestRecapture - h.before.balanceAfterBestRecapture).toBe(3);
  expect(h.defenderFrom).toBe(id === "white" ? "d1" : "d8"); expect(h.defenderTo).toBe(id === "white" ? "d5" : "d4");
  expect(h.unverified).toContain("total-balance"); expect(h.unverified).toContain("engine-reply");
});
it("une exposition préexistante ne devient pas une nouvelle cause du déplacement", () => {
  const c = context("pre-existing"); expect(divertedDefenceSeed(c)).not.toBeNull(); expect(divertedDefence(c)).toBeNull();
});
it("déplacer le défenseur ne suffit pas quand sa reprise reste légale", () => {
  const c = context("still-defends"), seed = divertedDefenceSeed(c)!;
  expect(seed).not.toBeNull();
  const captures = captureRelations(c.frames[c.decision + 3], "b").captures;
  expect(captures.find((r) => r.move === seed.secondCapture)?.recaptures.some((r) => r.defenderId === seed.defenderId)).toBe(true);
  expect(divertedDefence(c)).toBeNull();
});
it("une PV tronquée n'invente ni seconde prise ni surcharge", () => {
  const test = examples[0], input = corpusInput({ ...test, line: test.line.slice(0, 2) }), c = decisionContext(input.position, input.result);
  expect(divertedDefenceSeed(c)).toBeNull(); expect(divertedDefence(c)).toBeNull();
});
it("les primitives sont coopératives et gardent les faits sans phrases causales", () => {
  const work = divertedDefenceWork(context()); let step = work.next(), count = 0;
  while (!step.done) { expect(step.value).toBe("relations"); count++; step = work.next(); }
  expect(count).toBeGreaterThan(3); expect(step.value).not.toBeNull(); expect("summary" in step.value!).toBe(false);
});
