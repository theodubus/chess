import type { Engine } from "../../engine/Engine";
import { boardFromCommand } from "../StudyTree";
import { legalVariation, type ReviewResult } from "../model";
import { mechanismCases as cases } from "./mechanismCases";
import { observeMechanism } from "./mechanisms";
import { extendBranch, relationContrast } from "./relationContrast";
import type { RelationRequest } from "./RelationVerification";

// Réponses simulées partagées par les tests de protocole et de revue. Elles
// vérifient les contrats logiciels, pas la pertinence pédagogique d'un moteur.
const resultFor = (
  fen: string,
  moves: string[],
  score: number,
): ReviewResult => ({
  score: { kind: "cp", value: score },
  depth: 15,
  bestMove: moves[0] ?? null,
  bestSan: null,
  variation: legalVariation(fen, moves),
});
export function scripted(test: (typeof cases)[number], req: RelationRequest) {
  const { context } = req.understanding,
    h = req.understanding.mechanisms[req.mechanismIndex];
  const results = new Map<string, { moves: string[]; score: number }>();
  results.set(context.before.command, {
    moves: [
      context.moves[context.decision].from + context.moves[context.decision].to,
    ],
    score: 0,
  });
  results.set(context.after.command, {
    moves: test.lineUci,
    score: test.actualScore,
  });
  const observation = observeMechanism(
    context,
    h,
    resultFor(context.after.fen, test.lineUci, test.actualScore),
  );
  if (observation.matched) {
    const branch = extendBranch(context, [...observation.prefix, h.capture]);
    results.set(branch.frames.at(-1)!.command, {
      moves: test.lineUci.slice(observation.prefix.length + 1),
      score: test.actualScore,
    });
  }
  const plan = relationContrast(
    context,
    h,
    observation,
    test.alternativeUci ?? null,
  );
  if (plan.setup)
    results.set(plan.setup.after.command, {
      moves: test.alternativeLineUci!,
      score: test.alternativeScore,
    });
  else if (test.alternativeUci) {
    const board = boardFromCommand(context.before.command);
    board.move(test.alternativeUci);
    const command =
      context.before.command +
      (context.before.command.includes(" moves ") ? " " : " moves ") +
      test.alternativeUci;
    results.set(command, {
      moves: test.alternativeLineUci!,
      score: test.alternativeScore,
    });
  }
  if (plan.branch)
    results.set(plan.branch.frames.at(-1)!.command, {
      moves: test.alternativeLineUci!.slice(plan.prefix.length),
      score: test.alternativeScore,
    });
  return { results, plan };
}
export class ScriptEngine implements Engine {
  listener: (line: string) => void = () => {};
  command = "";
  commands: string[] = [];
  disposed = false;
  hold = false;
  constructor(
    private answers: Map<string, { moves: string[]; score: number }>,
    private drift: (budget: number, score: number) => number = (_, s) => s,
  ) {}
  onLine(listener: (line: string) => void) {
    this.listener = listener;
    return () => {
      this.listener = () => {};
    };
  }
  async dispose() {
    this.disposed = true;
  }
  send(command: string) {
    this.commands.push(command);
    if (command === "uci") this.listener("uciok");
    if (command === "isready") this.listener("readyok");
    if (command.startsWith("position ")) this.command = command;
    if (command.startsWith("go ") && !this.hold) {
      const answer = this.answers.get(this.command);
      if (!answer) throw new Error(`Question inattendue ${this.command}`);
      const board = boardFromCommand(this.command),
        score =
          this.drift(Number(command.split(" ").at(-1)), answer.score) *
          (board.turn() === "w" ? 1 : -1);
      this.listener(
        `info depth 15 score cp ${score} pv ${answer.moves.join(" ")}`,
      );
      this.listener(`bestmove ${answer.moves[0]}`);
    }
  }
}
