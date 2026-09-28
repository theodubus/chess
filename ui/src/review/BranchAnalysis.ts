import type { EngineFactory } from "../GameController";
import { LiveStudy } from "./LiveStudy";
import { StudyTree } from "./StudyTree";
import {
  classifyMove,
  moveFacts,
  withMoveFacts,
  verificationPositions,
  type Annotation,
} from "./annotations";
import type { ReviewPosition, ReviewResult } from "./model";
import type { SearchInfo } from "../engine/analysis";

type Cached = { results: Map<number, ReviewResult>; verified: Set<number> };

/** Le cache appartient à un moteur et à une revue, jamais à la seule FEN. */
export class BranchAnalysis {
  private cache = new WeakMap<StudyTree, Cached>();
  private search = new LiveStudy();
  private generation = 0;
  private listeners = new Set<() => void>();
  tree: StudyTree | null = null;
  node = 0;
  state: "idle" | "running" | "complete" | "error" = "idle";
  result: ReviewResult | null = null;
  before: ReviewResult | null = null;
  annotation: Annotation | null = null;
  info: SearchInfo | null = null;
  error = "";
  resultFor(tree: StudyTree, node: number) {
    return this.cache.get(tree)?.results.get(node) ?? null;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish() {
    for (const listener of this.listeners) listener();
  }
  async stop() {
    ++this.generation;
    this.state = "idle";
    await this.search.stop();
  }
  async analyse(
    tree: StudyTree,
    node: number,
    factory: EngineFactory,
    root: ReviewResult | null,
    previous: ReviewResult | null,
    previousPosition?: ReviewPosition,
  ) {
    const stopping = this.stop();
    const generation = this.generation;
    this.tree = tree;
    this.node = node;
    this.state = "running";
    this.error = "";
    this.info = null;
    const cached = this.cache.get(tree) ?? {
      results: new Map(),
      verified: new Set<number>(),
    };
    this.cache.set(tree, cached);
    if (root && !cached.results.has(0)) cached.results.set(0, root);
    const parent = tree.nodes[node].parent;
    const grandparent = parent === null ? null : tree.nodes[parent].parent;
    const positions =
      parent === null
        ? []
        : [
            ...(parent === 0 && previousPosition
              ? [previousPosition]
              : grandparent !== null
                ? [tree.position(grandparent, tree.nodes[parent].uci)]
                : []),
            tree.position(parent, tree.nodes[node].uci),
            tree.position(node),
          ];
    const index = positions.length - 2;
    const assess = () => {
      this.result = cached.results.get(node) ?? null;
      this.before =
        parent === null ? null : (cached.results.get(parent) ?? null);
      const results = [
        ...(index === 1
          ? [
              parent === 0
                ? previous
                : (cached.results.get(grandparent!) ?? null),
            ]
          : []),
        this.before,
        this.result,
      ];
      this.annotation =
        parent === null
          ? null
          : withMoveFacts(
              classifyMove(
                positions,
                results,
                index,
                cached.verified.has(parent) && cached.verified.has(node),
              ),
              moveFacts(positions[index]),
            );
      this.publish();
      return results;
    };
    assess();
    const current = () => generation === this.generation;
    const evaluate = async (id: number, budget: number) => {
      const unsubscribe = this.search.subscribe(() => {
        if (current() && id === node) {
          this.info = this.search.info;
          this.publish();
        }
      });
      try {
        await this.search.analyse(tree.command(id), factory, budget);
        if (!current()) return;
        if (this.search.state === "error") throw new Error(this.search.error);
        if (!this.search.result) throw new Error("Évaluation indisponible.");
        cached.results.set(id, this.search.result);
        assess();
      } finally {
        unsubscribe();
      }
    };
    try {
      await stopping;
      if (!current()) return;
      // La position affichée est calculée d'abord ; le coup précédent est ensuite
      // comparé, même si l'utilisateur a joué avant la fin de son évaluation.
      for (const id of [node, ...(parent === null ? [] : [parent])]) {
        if (!cached.results.has(id)) await evaluate(id, 1500);
        if (!current()) return;
      }
      if (
        parent !== null &&
        (!cached.verified.has(parent) || !cached.verified.has(node)) &&
        (!this.annotation ||
          verificationPositions(positions, assess()).length > 0)
      ) {
        for (const id of [parent, node]) {
          await evaluate(id, 3000);
          if (!current()) return;
          cached.verified.add(id);
        }
      }
      assess();
      this.state = "complete";
      this.publish();
    } catch (error) {
      if (current()) {
        this.state = "error";
        this.error =
          error instanceof Error ? error.message : "Analyse indisponible.";
        this.publish();
      }
    }
  }
}
