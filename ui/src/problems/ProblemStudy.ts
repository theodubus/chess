import type { EngineFactory } from "../GameController";
import { LiveStudy } from "../review/LiveStudy";
import { StudyTree } from "../review/StudyTree";
import { legalVariation, type ReviewResult, type VariationMove } from "../review/model";
import type { ChessProblem } from "./importProblem";

/** Une suite active : changer une réponse garde son préfixe et remplace toute sa fin. */
export class ProblemStudy {
  readonly live = new LiveStudy();
  tree: StudyTree;
  nodes: number[] = [];
  selected = 0;
  solution: ReviewResult | null = null;
  result: ReviewResult | null = null;
  searchRoot = 0;
  chosenReplies: number[] = [];
  running = false;
  private solutionNodes: number[] = [];
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(readonly problem: ChessProblem) {
    this.tree = new StudyTree(problem.position);
    this.live.subscribe(() => this.publish());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private publish() { for (const listener of this.listeners) listener(); }
  get node() { return this.selected ? this.nodes[this.selected - 1] : 0; }
  get board() { return this.tree.board(this.node); }
  get isVariant() { return this.chosenReplies.length > 0; }
  get canReply() {
    return !!this.solution && !this.running && this.board.turn() !== this.problem.position.turn && !this.board.isGameOver();
  }
  get canChangePrevious() {
    return !!this.solution && this.selected > 0 && this.board.turn() === this.problem.position.turn;
  }
  get line(): VariationMove[] {
    return this.nodes.map(id => {
      const node = this.tree.nodes[id];
      return { label: node.label, fen: node.fen, from: node.uci!.slice(0, 2), to: node.uci!.slice(2, 4) };
    });
  }
  select(index: number) {
    this.selected = Math.max(0, Math.min(index, this.nodes.length));
    this.publish();
  }
  async stop() {
    ++this.generation;
    this.running = false;
    await this.live.stop();
  }
  reset() {
    void this.stop();
    this.tree = new StudyTree(this.problem.position);
    this.nodes = []; this.solutionNodes = []; this.chosenReplies = [];
    this.solution = null; this.result = null; this.selected = 0; this.searchRoot = 0;
    this.publish();
  }
  restoreSolution() {
    if (!this.solution) return;
    void this.stop();
    this.nodes = [...this.solutionNodes]; this.chosenReplies = [];
    this.searchRoot = 0; this.result = this.solution;
    this.selected = Math.min(this.selected, this.nodes.length);
    this.publish();
  }
  async solve(factory: EngineFactory, budget: number) {
    this.reset();
    await this.search(0, [], factory, budget);
  }
  async recalculate(factory: EngineFactory, budget: number) {
    if (!this.isVariant) return this.solve(factory, budget);
    const prefix = this.nodes.slice(0, this.nodes.indexOf(this.searchRoot) + 1);
    this.nodes = prefix; this.selected = Math.min(this.selected, prefix.length);
    await this.search(this.searchRoot, prefix, factory, budget);
  }
  async reply(from: string, to: string, promotion: string | undefined, factory: EngineFactory, budget: number) {
    if (!this.canReply) throw new Error("Placez-vous avant une réponse adverse pour la modifier.");
    // StudyTree vérifie la légalité et garde les promotions et l'historique PGN.
    const next = this.tree.play(this.node, from, to, promotion);
    if (next === this.nodes[this.selected]) { this.select(this.selected + 1); return; }
    const prefix = [...this.nodes.slice(0, this.selected), next];
    this.chosenReplies = [...this.chosenReplies.filter(id => prefix.includes(id)), next];
    this.nodes = prefix; this.selected = prefix.length;
    await this.search(next, prefix, factory, budget);
  }
  private appendResult(parent: number, result: ReviewResult) {
    let node = parent;
    const nodes: number[] = [];
    const board = this.tree.board(parent);
    const line = result.variation.length ? result.variation : result.bestMove ? legalVariation(board.fen(), [result.bestMove]) : [];
    for (const entry of line) {
      const position = this.tree.board(node);
      if (position.isGameOver()) break;
      const move = position.moves({ verbose: true }).find(move => move.from === entry.from && move.to === entry.to && move.after === entry.fen);
      if (!move) break;
      node = this.tree.play(node, move.from, move.to, move.promotion);
      nodes.push(node);
    }
    return nodes;
  }
  private async search(node: number, prefix: number[], factory: EngineFactory, budget: number) {
    const generation = ++this.generation;
    this.searchRoot = node; this.result = null; this.running = true;
    this.publish();
    await this.live.analyse(this.tree.command(node), factory, budget, { completeMateLine: true });
    if (generation !== this.generation) return;
    this.running = false;
    if (this.live.state === "complete" && this.live.result) {
      this.result = this.live.result;
      this.nodes = [...prefix, ...this.appendResult(node, this.result)];
      if (!node) { this.solution = this.result; this.solutionNodes = [...this.nodes]; }
    }
    this.publish();
  }
}
