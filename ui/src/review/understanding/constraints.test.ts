import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { corpus, corpusInput, type CorpusCase } from "./corpus";
import { decisionContext } from "./context";
import { shortMateProof, tacticalConstraints, tacticalFrame } from "./constraints";
import { externalCorpus } from "./externalCorpus";

const contextFor = (test: CorpusCase) => {
  const { position, result } = corpusInput(test);
  return decisionContext(position, result);
};
const fixture = (fen: string, played: string, line: string[] = []) => contextFor({
  id: "constructed", family: "constraints", origin: "constructed", notes: "",
  fen, prefix: [], played, line, expected: {}, forbiddenClaims: [],
});
const original = (id: string) => contextFor(corpus.find((c) => c.id === id)!);

it.each([
  ["r3k3/8/8/3N4/8/8/8/7K w - - 0 1", "Nc7+", "w:n:d5", "b:k:e8", "b:r:a8"],
  ["7k/8/8/8/3n4/8/8/R3K3 b - - 0 1", "Nc2+", "b:n:d4", "w:k:e1", "w:r:a1"],
])("fourchette avec échec, sans capture artificielle du roi : %s", (fen, played, attacker, king, rook) => {
  const c = tacticalConstraints(fixture(fen, played));
  const h = c.hypotheses.find((h) => h.kind === "double-threat")!;
  expect(h).toMatchObject({ attackerId: attacker, targetIds: [king, rook].sort(), status: "hypothesis" });
  const fact = c.after.doubleAttacks.find((a) => a.attacker.id === attacker)!;
  expect(fact.targets.find((t) => t.piece.id === king)).toMatchObject({ check: true, captures: [] });
  expect(fact.targets.find((t) => t.piece.id === rook)!.captures).toBeNull();
  expect(c.after.unavailable).toContain(c.before.frame.turn);
  expect(h.unverified).toContain("best-defence");
});
it("après une vraie réponse au check, la capture de la tour redevient vérifiable", () => {
  const c = tacticalConstraints(original("fork"));
  expect(boardFromCommand(c.reply!.frame.command).moves({ verbose: true }).map((m) => m.lan)).toContain("c7a8");
  // Après Kd7 il ne reste qu'une cible : la fourchette passée n'est pas recréée.
  expect(c.reply!.doubleAttacks.some((a) => a.attacker.id === "w:n:d5")).toBe(false);
  expect(c.hypotheses.filter((h) => h.kind === "double-threat")).toHaveLength(1);
});
it("une double attaque géométrique d'un cavalier cloué n'a pas deux captures légales", () => {
  const c = tacticalConstraints(fixture("4k3/8/4n3/8/3Q1R2/8/8/K3R3 w - - 0 1", "Kb1"));
  const attack = c.after.doubleAttacks.find((a) => a.attacker.square === "e6")!;
  expect(attack.targets.filter((t) => ["d4", "f4"].includes(t.piece.square)).map((t) => t.captures)).toEqual([[], []]);
  expect(c.hypotheses).toEqual([]);
});
it("la double menace de Na4 garde les identités et les deux captures conditionnelles", () => {
  const c = tacticalConstraints(contextFor(externalCorpus.find((c) => c.id === "byrne-22")!));
  const h = c.hypotheses.find((h) => h.kind === "double-threat")!;
  expect(h).toMatchObject({ attackerId: "b:n:b8", targetIds: ["w:n:b1", "w:q:d1"] });
  const a = c.after.doubleAttacks.find((a) => a.attacker.id === h.attackerId)!;
  expect(a.targets.find((t) => t.piece.square === "c5")!.captures).toEqual(["a4c5"]);
  expect(a.targets.find((t) => t.piece.square === "c3")!.captures).toEqual(["a4c3"]);
  expect(c.shortMate).toBeNull();
});
it("une double attaque légale ne garantit pas que l'attaquant survive", () => {
  const c = tacticalConstraints(contextFor(externalCorpus.find((c) => c.id === "morphy-25")!));
  expect(c.hypotheses.some((h) => h.kind === "double-threat")).toBe(true);
  expect(c.reply!.frame.pieces.some((p) => p.id === "w:r:a1")).toBe(false);
  expect(c.hypotheses[0].unverified).toContain("compensation");
});
it.each([
  ["8/3kp3/2n5/3P4/8/8/8/5B1K w - - 0 1", "Bb5", "c6", "d7"],
  ["5b1k/8/8/8/3p4/2N5/3KP3/8 b - - 0 1", "Bb4", "c3", "d2"],
])("le clouage absolu relie explicitement pièce et roi : %s", (fen, played, shield, king) => {
  const c = tacticalConstraints(fixture(fen, played));
  const pin = c.after.pins.find((p) => p.shield.square === shield)!;
  expect(pin).toMatchObject({ kind: "absolute", rear: { square: king, type: "k" }, legalMoves: [] });
  expect(c.hypotheses.find((h) => h.kind === "pin")?.targetIds).toEqual([pin.shield.id, pin.rear.id].sort());
});
it("une pièce clouée peut encore se déplacer sur le rayon et prendre l'attaquant", () => {
  const c = tacticalConstraints(fixture("4k3/4r3/8/8/8/8/K7/3R4 w - - 0 1", "Re1"));
  const pin = c.after.pins.find((p) => p.shield.square === "e7")!;
  expect(pin.legalMoves).toContain("e7e1");
  expect(pin.legalMoves!.every((m) => m.slice(2, 3) === "e")).toBe(true);
  expect(pin.legalMoves!.length).toBeGreaterThan(1);
});
it("un deuxième obstacle empêche de déclarer un clouage absolu", () => {
  const c = tacticalConstraints(fixture("4k3/4r3/4n3/8/8/8/K7/3R4 w - - 0 1", "Re1"));
  expect(c.after.pins.some((p) => p.kind === "absolute")).toBe(false);
  expect(c.hypotheses).toEqual([]);
});
it("l'alignement avec une dame n'interdit pas de déplacer le cavalier", () => {
  const c = tacticalConstraints(fixture("3q3k/8/3n4/8/8/8/8/K2R4 w - - 0 1", "Rd2"));
  expect(c.after.pins[0]).toMatchObject({ kind: "relative-alignment", rear: { type: "q" } });
  expect(c.after.pins[0].legalMoves).toContain("d6e4");
  expect(c.hypotheses.some((h) => h.kind === "pin")).toBe(false);
});
it("un clouage préexistant reste un fait, pas une nouvelle cause attribuée à Kb1", () => {
  const c = tacticalConstraints(original("pinned-capturer"));
  expect(c.before.pins[0].shield.id).toBe("b:n:e7");
  expect(c.after.pins[0].shield.id).toBe("b:n:e7");
  expect(c.hypotheses).toEqual([]);
});
it("un mat conditionnel après Qh5 n'est pas un mat forcé contre toutes les réponses", () => {
  const c = tacticalConstraints(original("mate-threat"));
  expect(c.hypotheses).toContainEqual(expect.objectContaining({ kind: "mate-threat", attackerId: "w:q:d1" }));
  expect(c.after.mates).toContainEqual({ attackerId: "w:q:d1", kingId: "b:k:e8", move: "h5f7", scope: "geometric-turn-probe" });
  expect(c.shortMate).toMatchObject({ status: "refuted" });
  const board = boardFromCommand(c.after.frame.command);
  board.move(c.shortMate!.counterexample!);
  expect(board.moves().some((m) => m.endsWith("#"))).toBe(false);
  board.undo(); board.move("g6");
  expect(board.moves().some((m) => m.endsWith("#"))).toBe(false);
});
it("la menace préexistante ne redevient pas nouvelle après a6", () => {
  const base = corpus.find((c) => c.id === "mate-threat")!;
  const c = tacticalConstraints(contextFor({ ...base, prefix: [...base.prefix, "Qh5"], played: "a6", line: ["Qxf7#"] }));
  expect(c.before.mates.some((m) => m.move === "h5f7")).toBe(true);
  expect(c.after.mates.some((m) => m.move === "h5f7")).toBe(true);
  expect(c.hypotheses.some((h) => h.kind === "mate-threat")).toBe(false);
});
it("la déviation garde la réponse obligatoire, le bloqueur et le mat, sans la longue partie", () => {
  const context = contextFor(externalCorpus.find((c) => c.id === "morphy-31")!);
  const c = tacticalConstraints(context);
  expect(c.shortMate).toMatchObject({ status: "proved", replies: [{ move: "d7b8", mates: ["d1d8"] }] });
  const h = c.hypotheses.find((h) => h.kind === "deflection-mate")!;
  expect(h).toMatchObject({ attackerId: "w:r:h1", targetIds: ["b:k:e8", "b:n:g8"], fact: { blockerId: "b:n:g8", mate: "d1d8" } });
  const board = boardFromCommand(context.after.command);
  expect(board.moves()).toEqual(["Nxb8"]);
  board.move(c.shortMate!.replies[0].move);
  board.move(c.shortMate!.replies[0].mates[0]);
  expect(board.isCheckmate()).toBe(true);
});
it("sans continuation fournie, la déviation est démontrable par les règles", () => {
  const { position } = corpusInput(externalCorpus.find((c) => c.id === "morphy-31")!);
  const c = tacticalConstraints(decisionContext(position));
  expect(c.reply).toBeNull();
  expect(c.hypotheses.some((h) => h.kind === "deflection-mate")).toBe(true);
});
it("la déviation avec couleurs inversées garde le bon camp gagnant", () => {
  const context = fixture("2kr4/ppp2ppp/1q6/4p3/4P1b1/4Q3/P2N1PPP/4KB1R b K - 0 16", "Qb1+", ["Nxb1", "Rd1#"]);
  const c = tacticalConstraints(context);
  expect(c.shortMate).toMatchObject({ status: "proved", replies: [{ move: "d2b1", mates: ["d8d1"] }] });
  expect(c.hypotheses.find((h) => h.kind === "deflection-mate")).toMatchObject({ role: "creates-opportunity", attackerId: "b:r:d8", targetIds: ["w:k:e1", "w:n:d2"] });
});
it("une preuve interrompue par son plafond n'est jamais une preuve universelle", () => {
  const context = contextFor(externalCorpus.find((c) => c.id === "morphy-31")!);
  expect(shortMateProof(context.after, 1)).toMatchObject({ status: "budget-exhausted", examinedMoves: 1 });
  expect(() => shortMateProof(context.after, 0)).toThrow("Plafond");
});
it("une fin de partie n'engendre pas une preuve vacuement vraie", () => {
  const context = contextFor(externalCorpus.find((c) => c.id === "morphy-31")!);
  expect(new Chess(context.frames.at(-1)!.fen).isCheckmate()).toBe(true);
  expect(shortMateProof(context.frames.at(-1)!).status).toBe("unavailable");
  expect(tacticalFrame(context.frames.at(-1)!).mates).toEqual([]);
});
it("une promotion garde l'identité du pion dans la double attaque", () => {
  const c = tacticalConstraints(fixture("7k/1P6/8/8/8/8/7r/K7 w - - 0 1", "b8=Q+"));
  expect(c.hypotheses.find((h) => h.kind === "double-threat")).toMatchObject({ attackerId: "w:p:b7", targetIds: ["b:k:h8", "b:r:h2"] });
});
it("l'interdiction d'une prise en passant avec deux obstacles n'est pas inventée comme un clouage simple", () => {
  const c = fixture("7k/8/8/r4pPK/8/8/8/8 w - f6 0 1", "g6");
  expect(boardFromCommand(c.before.command).moves()).not.toContain("gxf6");
  expect(tacticalFrame(c.before).pins).toEqual([]);
});
it("ne cherche pas une raison dans un motif qui apparaît plusieurs coups après la décision", () => {
  const base = corpus.find((c) => c.id === "mate-threat")!;
  const c = tacticalConstraints(contextFor({ ...base, prefix: ["e4", "e5"], played: "Bc4", line: ["Nc6", "Qh5", "a6", "Qxf7#"] }));
  expect(c.hypotheses).toEqual([]);
});
