import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { boardFromCommand } from "../review/StudyTree";
import { ProblemStudy } from "./ProblemStudy";
import { importProblem } from "./importProblem";

class ReplyEngine implements Engine {
  commands: string[] = [];
  listener: (line: string) => void = () => {};
  disposed = false;
  constructor(private pv: string[], private delayed = false) {}
  onLine(listener: (line: string) => void) { this.listener = listener; return () => { this.listener = () => {}; }; }
  async dispose() { this.disposed = true; }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("go ") && !this.delayed) this.answer();
  }
  answer() {
    this.listener(`info depth 12 score cp 20 pv ${this.pv.join(" ")}`);
    this.listener(`bestmove ${this.pv[0]}`);
  }
}
const main = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"];
const scandinavian = ["e4d5", "d8d5", "b1c3", "d5d8", "g1f3", "g8f6"];
const afterQa5 = ["d2d4", "g8f6"];
const sicilian = ["g1f3", "d7d6", "d2d4", "c5d4", "f3d4"];
const factory = (pv: string[]) => async () => new ReplyEngine(pv);
const ucis = (study: ProblemStudy) => study.nodes.map(id => study.tree.nodes[id].uci);
async function solved() {
  const study = new ProblemStudy(importProblem(new Chess().fen()));
  await study.solve(factory(main), 1000);
  return study;
}

it("remplace une réponse adverse située au début et reconstruit toute la fin de la suite", async () => {
  const study = await solved(), original = JSON.stringify(study.solution);
  study.select(1);
  const engine = new ReplyEngine(scandinavian);
  await study.reply("d7", "d5", undefined, async () => engine, 3000);
  expect(ucis(study)).toEqual(["e2e4", "d7d5", ...scandinavian]);
  expect(study.selected).toBe(2); expect(study.isVariant).toBe(true);
  expect(engine.commands).toContain(`${study.problem.position.command} moves e2e4 d7d5`);
  expect(engine.commands).toContain("go movetime 3000");
  expect(study.tree.position(study.searchRoot).label).toBe("1… d5");
  expect(JSON.stringify(study.solution)).toBe(original);
  expect(study.result?.bestSan).toBe("exd5");
});

it("conserve les réponses déjà choisies avant une nouvelle modification et oublie celles d'après", async () => {
  const study = await solved(); study.select(1);
  await study.reply("d7", "d5", undefined, factory(scandinavian), 1000);
  study.select(5);
  await study.reply("d5", "a5", undefined, factory(afterQa5), 1000);
  expect(ucis(study)).toEqual(["e2e4", "d7d5", ...scandinavian.slice(0, 3), "d5a5", ...afterQa5]);
  expect(study.chosenReplies.map(id => study.tree.nodes[id].uci)).toEqual(["d7d5", "d5a5"]);
  study.select(1);
  await study.reply("c7", "c5", undefined, factory(sicilian), 1000);
  expect(ucis(study)).toEqual(["e2e4", "c7c5", ...sicilian]);
  expect(study.chosenReplies.map(id => study.tree.nodes[id].uci)).toEqual(["c7c5"]);
});

it("retourne à la solution initiale sans perdre sa variante ni accepter un résultat tardif", async () => {
  const study = await solved(); study.select(1);
  const engine = new ReplyEngine(scandinavian, true);
  const pending = study.reply("d7", "d5", undefined, async () => engine, 1000);
  await vi.waitFor(() => expect(engine.commands).toContain("go movetime 1000"));
  expect(ucis(study)).toEqual(["e2e4", "d7d5"]);
  study.restoreSolution(); engine.answer(); await pending;
  expect(ucis(study)).toEqual(main); expect(study.isVariant).toBe(false);
  expect(study.result).toBe(study.solution); expect(study.selected).toBe(2);
  expect(engine.disposed).toBe(true); expect(study.running).toBe(false);
});

it("refuse de modifier le camp du problème ou de jouer un coup illégal", async () => {
  const study = await solved(), unused = vi.fn(factory(scandinavian));
  await expect(study.reply("d2", "d4", undefined, unused, 1000)).rejects.toThrow("réponse adverse");
  study.select(1);
  await expect(study.reply("e7", "e3", undefined, unused, 1000)).rejects.toThrow();
  expect(ucis(study)).toEqual(main); expect(study.isVariant).toBe(false);
  expect(unused).not.toHaveBeenCalled();
});

it("jouer la réponse déjà proposée avance dans la suite sans la recalculer", async () => {
  const study = await solved(), unused = vi.fn(factory(scandinavian)); study.select(1);
  await study.reply("e7", "e5", undefined, unused, 1000);
  expect(study.selected).toBe(2); expect(study.isVariant).toBe(false);
  expect(ucis(study)).toEqual(main); expect(unused).not.toHaveBeenCalled();
});

it("conserve l'historique du PGN et les coups du préfixe dans la commande envoyée au moteur", async () => {
  const game = new Chess(); game.move("e4"); game.move("e5");
  const source = importProblem(game.pgn(), "final"), study = new ProblemStudy(source);
  await study.solve(factory(main.slice(2)), 1000); study.select(1);
  const engine = new ReplyEngine(["b1c3", "g8f6"]);
  await study.reply("d7", "d6", undefined, async () => engine, 1000);
  const command = `${source.position.command} g1f3 d7d6`;
  expect(engine.commands).toContain(command);
  expect(boardFromCommand(command).history()).toEqual(["e4", "e5", "Nf3", "d6"]);
  expect(game.history()).toEqual(["e4", "e5"]);
});

it("le camp adverse est bien blanc pour un problème au trait noir", async () => {
  const game = new Chess(); game.move("e4");
  const study = new ProblemStudy(importProblem(game.pgn(), "final"));
  await study.solve(factory(main.slice(1)), 1000);
  expect(study.canReply).toBe(false); study.select(1);
  expect(study.canReply).toBe(true);
  await study.reply("b1", "c3", undefined, factory(["b8c6", "g1f3"]), 1000);
  expect(ucis(study)).toEqual(["e7e5", "b1c3", "b8c6", "g1f3"]);
  expect(study.board.turn()).toBe("b");
});

it("garde la promotion choisie dans la réponse adverse et la continuation", async () => {
  const study = new ProblemStudy(importProblem("7k/8/8/8/8/8/1p6/7K w - - 0 1"));
  await study.solve(factory(["h1h2", "b2b1q", "h2g3"]), 1000); study.select(1);
  await study.reply("b2", "b1", "r", factory(["h2h3"]), 1000);
  expect(ucis(study)).toEqual(["h1h2", "b2b1r", "h2h3"]);
  expect(study.board.get("b1")?.type).toBe("r");
  expect(study.line[1].label).toBe("1… b1=T");
});

it("une réponse qui termine la partie est présentée sans lancer une recherche inutile", async () => {
  const study = new ProblemStudy(importProblem("7k/8/8/8/8/8/1p6/7K w - - 0 1"));
  await study.solve(factory(["h1h2", "b2b1q", "h2g3"]), 1000); study.select(1);
  const unused = vi.fn(factory(["h2h3"]));
  await study.reply("b2", "b1", "n", unused, 1000);
  expect(study.board.isInsufficientMaterial()).toBe(true); expect(ucis(study)).toHaveLength(2);
  expect(study.result?.score).toEqual({ kind: "cp", value: 0 });
  expect(study.result?.bestMove).toBeNull(); expect(unused).not.toHaveBeenCalled();
});

it("changer les réglages remet l'étude à zéro et ignore l'ancienne continuation", async () => {
  const study = await solved(); study.select(1);
  const engine = new ReplyEngine(scandinavian, true);
  const pending = study.reply("d7", "d5", undefined, async () => engine, 1000);
  await vi.waitFor(() => expect(engine.commands).toContain("go movetime 1000"));
  study.reset(); engine.answer(); await pending;
  expect(study.solution).toBeNull(); expect(study.nodes).toEqual([]);
  expect(study.selected).toBe(0); expect(study.running).toBe(false);
  expect(study.chosenReplies).toEqual([]); expect(study.live.state).toBe("idle");
});

it("une erreur conserve le préfixe choisi et permet de relancer cette variante", async () => {
  const study = await solved(); study.select(1);
  await study.reply("d7", "d5", undefined, async () => { throw Error("Connexion refusée"); }, 1000);
  expect(study.live.state).toBe("error"); expect(study.result).toBeNull();
  expect(ucis(study)).toEqual(["e2e4", "d7d5"]);
  await study.recalculate(factory(scandinavian), 1000);
  expect(ucis(study)).toEqual(["e2e4", "d7d5", ...scandinavian]);
  expect(study.live.state).toBe("complete"); expect(study.result?.bestSan).toBe("exd5");
});
