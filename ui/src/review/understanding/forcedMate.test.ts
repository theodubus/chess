import { expect, it } from "vitest";
import { boardFromCommand } from "../StudyTree";
import { decisionContext, opposite, uci } from "./context";
import { forcedMateProof, forcedMateWork, mateWitness, proveMate, validMateStrategy } from "./forcedMate";
import { mateConsequenceInput } from "./mateConsequenceTestEngine";

function input(id: string) {
  const { source } = mateConsequenceInput(id), context = decisionContext(source.position, source.result);
  return { command: context.after.command, winner: opposite(context.before.turn), hint: context.moves.slice(context.decision + 1).map(uci) };
}
it.each(["fools-mate", "reverse-fools-mate"])("prouve le mat immédiat avec le bon camp : %s", (id) => {
  const { command, winner, hint } = input(id), proof = forcedMateProof(command, winner, 1, hint);
  expect(proof).toMatchObject({ status: "proved", reason: "all-defences-covered", winner, strategy: { plies: 1 } });
  expect(validMateStrategy(proof, command)).toBe(true);
  expect(mateWitness(proof.strategy!, hint)).toEqual({ moves: hint, origins: ["engine-line"] });
});
it.each(["quiet-mate", "two-defences", "legals-mate"])("couvre aussi les préparations calmes et le mat après une prise de dame : %s", (id) => {
  const { command, winner, hint } = input(id), proof = forcedMateProof(command, winner, 3, hint);
  expect(proof).toMatchObject({ status: "proved", strategy: { plies: 3 } });
  expect(validMateStrategy(proof, command)).toBe(true);
  expect(mateWitness(proof.strategy!, hint).moves).toEqual(hint);
  expect(forcedMateProof(command, winner, 1, hint).status).toBe("refuted");
});
it("couvre toutes les défenses, y compris un coup de pion sans échec ni prise", () => {
  const { command, winner, hint } = input("two-defences"), proof = forcedMateProof(command, winner, 3, hint);
  const replies = proof.strategy!.branches[0].next;
  expect(replies.branches.map((b) => b.move).sort()).toEqual(["a8a7", "a6a5"].sort());
  const pawn = mateWitness(proof.strategy!, ["a1b2", "a6a5", "b2b7"]);
  expect(pawn.moves).toEqual(["a1b2", "a6a5", "b2b7"]);
  const board = boardFromCommand(command); pawn.moves.forEach((m) => board.move(m)); expect(board.isCheckmate()).toBe(true);
  const missing = structuredClone(proof); missing.strategy!.branches[0].next.branches.pop();
  expect(validMateStrategy(missing, command)).toBe(false);
});
it("complète une PV tronquée avec des coups de règles, sans les attribuer au moteur", () => {
  const { command, winner, hint } = input("quiet-mate"), proof = forcedMateProof(command, winner, 3, hint.slice(0, 1));
  expect(mateWitness(proof.strategy!, hint.slice(0, 1))).toEqual({ moves: hint, origins: ["engine-line", "rules", "rules"] });
});
it("une ligne de menace ne suffit pas si le roi ne peut pas être maté dans cet horizon", () => {
  const { command, winner, hint } = input("unforced-line");
  expect(forcedMateProof(command, winner, 1, hint)).toMatchObject({ status: "refuted", reason: "defence-outside-horizon", strategy: null });
});
it("une limite de calcul garde l'inconnu et une annulation ne livre aucune preuve", async () => {
  const { command, winner, hint } = input("two-defences");
  expect(forcedMateProof(command, winner, 3, hint, 2)).toMatchObject({ status: "incomplete", reason: "node-limit", strategy: null });
  const abort = new AbortController(); abort.abort();
  expect(await proveMate(command, winner, 3, hint, abort.signal)).toBeNull();
  const work = forcedMateWork(command, winner, 3, hint);
  expect(work.next()).toEqual({ value: "mate", done: false }); work.return(undefined as never);
});
it("refuse une stratégie altérée ou liée à une position sans historique", () => {
  const { command, winner, hint } = input("fools-mate"), proof = forcedMateProof(command, winner, 1, hint);
  expect(validMateStrategy(proof, `position fen ${boardFromCommand(command).fen()}`)).toBe(false);
  const altered = structuredClone(proof); altered.strategy!.branches[0].next.fen = altered.strategy!.fen;
  expect(validMateStrategy(altered, command)).toBe(false);
});
it("conserve la nulle par répétition de l'historique et cède pendant une preuve annulée", async () => {
  const command = "position startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8";
  expect(boardFromCommand(command).isThreefoldRepetition()).toBe(true);
  expect(forcedMateProof(command, "w", 3)).toMatchObject({ status: "refuted", nodes: 1 });
  const { command: active, winner, hint } = input("unforced-line"), abort = new AbortController();
  const pending = proveMate(active, winner, 5, hint, abort.signal);
  setTimeout(() => abort.abort(), 0);
  expect(await pending).toBeNull();
});
