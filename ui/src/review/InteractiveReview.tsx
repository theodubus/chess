import { useEffect, useState } from "react";
import type { Color, Key } from "@lichess-org/chessground/types";
import type { GameReview } from "./GameReview";
import { StudyTree } from "./StudyTree";
import { BranchAnalysis } from "./BranchAnalysis";
import { badMove, notablePositions, moveSummary } from "./study";
import { estimatedLoss } from "./model";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import { scoreLabel } from "../engine/analysis";
import Board from "../Board";
import EvaluationBar from "../EvaluationBar";
import EvaluationChart from "./EvaluationChart";
import MoveNavigation from "../MoveNavigation";
import Dialog from "../Dialog";
import AnnotationBadge from "./AnnotationBadge";
import { annotationPlacement } from "./annotationPlacement";
import { unclassifiedReason } from "./unclassifiedReason";
import { useMoveKeys } from "../useMoveKeys";

type Branch = {
  tree: StudyTree;
  node: number;
  origin: number;
  retry: boolean;
  retryNode?: number;
  revealed: boolean;
};

export default function InteractiveReview({
  review,
  selected,
  onSelect,
  engineId,
  orientation,
  showEvaluation,
  showAnnotations,
  active,
  side,
  treeCache: trees,
}: {
  review: GameReview;
  selected: number;
  onSelect: (index: number) => void;
  engineId: string;
  orientation: Color;
  showEvaluation: boolean;
  showAnnotations: boolean;
  active: boolean;
  side: "w" | "b" | "both";
  treeCache: Map<number, StudyTree>;
}) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [live] = useState(() => new BranchAnalysis());
  const [, render] = useState(0);
  const [pane, setPane] = useState<"details" | "moves">("details");
  const [walkTarget, setWalkTarget] = useState<number | null>(null);
  const [promotion, setPromotion] = useState<{ from: Key; to: Key } | null>(
    null,
  );
  const [retrySearch, setRetrySearch] = useState(0);
  useEffect(() => live.subscribe(() => render((value) => value + 1)), [live]);
  const tree = branch?.tree,
    node = branch?.node,
    origin = branch?.origin;
  useEffect(() => {
    if (!active || !tree || node === undefined || origin === undefined) return;
    const timer = setTimeout(
      () =>
        void live.analyse(
          tree,
          node,
          analysisEngineFactory(engineId),
          review.results[origin],
          origin > 0 ? review.results[origin - 1] : null,
          origin > 0 ? review.positions[origin - 1] : undefined,
        ),
      180,
    );
    return () => {
      clearTimeout(timer);
      void live.stop();
    };
  }, [active, tree, node, origin, engineId, live, review, retrySearch]);
  useEffect(() => {
    if (walkTarget === null || !active) return;
    const timer = setTimeout(() => {
      if (selected >= walkTarget) setWalkTarget(null);
      else onSelect(selected + 1);
    }, 180);
    return () => clearTimeout(timer);
  }, [walkTarget, selected, active, onSelect]);
  const position = review.positions[selected];
  const annotations = review.annotations;
  const playedPosition = selected > 0 ? review.positions[selected - 1] : null;
  const moments = notablePositions(annotations, review.positions, side);
  const nextMoment = moments.find((index) => index > selected);
  const previousMoment = moments.filter((index) => index < selected).at(-1);
  const displayedTree = branch?.tree ?? new StudyTree(position);
  const board = displayedTree.board(branch?.node ?? 0);
  const path = branch?.tree.path(branch.node) ?? [];
  const matching =
    !!branch && live.tree === branch.tree && live.node === branch.node;
  const liveResult = matching ? live.result : null;
  const liveState = matching ? live.state : "idle";
  const blind =
    !!branch?.retry && branch.node === branch.retryNode && !branch.revealed;
  const canPlay =
    active && walkTarget === null && !promotion && !board.isGameOver();
  const score = branch
    ? (liveResult?.score ?? (matching ? live.info?.score : null) ?? null)
    : (review.results[selected]?.score ?? null);
  const annotation = branch
    ? matching
      ? live.annotation
      : null
    : selected > 0
      ? annotations[selected - 1]
      : null;
  const provisional = branch
    ? liveState !== "complete"
    : review.state !== "complete";
  const uci = branch
    ? branch.tree.nodes[branch.node].uci
    : playedPosition?.played;
  const placement = uci
    ? annotationPlacement(board.fen(), uci.slice(2, 4), orientation)
    : null;
  const emphasis =
    !branch &&
    badMove(annotation) &&
    !!playedPosition &&
    (side === "both" || playedPosition.turn === side);
  const hasPlayed = branch ? branch.node > 0 : selected > 0;
  const before = branch
    ? matching
      ? live.before
      : null
    : selected > 0
      ? review.results[selected - 1]
      : review.results[0];
  const target = branch?.retry
    ? (live.resultFor(branch.tree, branch.retryNode ?? 0) ??
      (branch.retryNode === 0 ? review.results[branch.origin] : null))
    : null;
  const loss = hasPlayed
    ? estimatedLoss(
        before?.score ?? null,
        score,
        branch && path.length
          ? branch.tree.board(branch.tree.nodes[branch.node].parent!).turn()
          : (playedPosition?.turn ?? position.turn),
      )
    : null;

  function navigate(index: number) {
    setWalkTarget(null);
    setBranch(null);
    setPromotion(null);
    onSelect(index);
  }
  function cachedTree(index: number) {
    let tree = trees.get(index);
    if (!tree) {
      tree = new StudyTree(review.positions[index]);
      trees.set(index, tree);
    }
    return tree;
  }
  function jumpBranch(direction: number) {
    if (!branch || !direction || (blind && direction > 0)) return;
    const current = branch.tree.nodes[branch.node];
    const next = direction < 0 ? current.parent : current.children[0];
    if (next !== null && next !== undefined) {
      setPromotion(null);
      setBranch({ ...branch, node: next });
    }
  }
  useMoveKeys(
    active && walkTarget === null && !promotion,
    branch ? path.length : selected,
    branch
      ? path.length + (branch.tree.nodes[branch.node].children.length ? 1 : 0)
      : review.positions.length - 1,
    (index) => (branch ? jumpBranch(index - path.length) : navigate(index)),
  );
  function retry() {
    setWalkTarget(null);
    setPromotion(null);
    setPane("details");
    // Le retry porte sur le coup visible, qu'il soit humain, adverse ou alternatif.
    if (branch && branch.node !== 0) {
      const parent = branch.tree.nodes[branch.node].parent!;
      setBranch({
        ...branch,
        node: parent,
        retryNode: parent,
        retry: true,
        revealed: false,
      });
    } else {
      const index = Math.max(0, selected - 1);
      setBranch({
        tree: cachedTree(index),
        node: 0,
        origin: index,
        retry: true,
        retryNode: 0,
        revealed: false,
      });
    }
  }
  function play(from: Key, to: Key, piece?: string) {
    const moves = board
      .moves({ verbose: true })
      .filter((move) => move.from === from && move.to === to);
    if (!moves.length) return;
    if (!piece && moves.some((move) => move.promotion)) {
      setPromotion({ from, to });
      return;
    }
    const current = branch ?? {
      tree: cachedTree(selected),
      node: 0,
      origin: selected,
      retry: false,
      revealed: false,
    };
    const next = current.tree.play(current.node, from, to, piece);
    setWalkTarget(null);
    setPane("details");
    setBranch({ ...current, node: next });
    setPromotion(null);
  }
  function recommended(index: number) {
    const from = branch
      ? (branch.tree.nodes[branch.node].parent ?? branch.node)
      : Math.max(0, selected - 1);
    const tree = branch?.tree ?? cachedTree(from);
    let node = branch ? from : 0;
    for (const move of before?.variation.slice(0, index + 1) ?? []) {
      const legal = tree
        .board(node)
        .moves({ verbose: true })
        .find(
          (item) =>
            item.from === move.from &&
            item.to === move.to &&
            item.after === move.fen,
        );
      if (!legal) return;
      node = tree.play(node, legal.from, legal.to, legal.promotion);
    }
    setBranch({
      tree,
      node,
      origin: branch?.origin ?? from,
      retry: false,
      revealed: false,
    });
  }
  const pending = branch && liveState !== "complete" && liveState !== "error";
  return (
    <section
      className="workspace review-workspace learning-workspace"
      aria-label="Analyse interactive"
    >
      <div className="board-column">
        <p className="review-position">
          {branch
            ? blind
              ? "À vous de trouver le meilleur coup"
              : `${branch.retry && path.length === 1 ? "Votre tentative" : "Variante"} · ${branch.node ? branch.tree.nodes[branch.node].label : branch.tree.root.label}`
            : position.label}
        </p>
        <div
          className={`board-with-evaluation ${showEvaluation ? "show-evaluation" : ""}`}
        >
          {showEvaluation && (
            <EvaluationBar
              score={blind ? null : score}
              orientation={orientation}
            />
          )}
          <Board
            fen={board.fen()}
            orientation={orientation}
            turn={board.turn() === "w" ? "white" : "black"}
            check={board.isCheck()}
            destinations={
              canPlay
                ? displayedTree.destinations(branch?.node ?? 0)
                : new Map()
            }
            onMove={canPlay ? (from, to) => play(from, to) : undefined}
            lastMove={
              uci ? [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key] : []
            }
          >
            {!blind && showAnnotations && annotation && placement && (
              <span
                className="board-annotation"
                data-corner={placement.corner}
                style={{
                  left: `${placement.column * 12.5}%`,
                  top: `${placement.row * 12.5}%`,
                }}
              >
                <AnnotationBadge
                  annotation={annotation}
                  provisional={provisional}
                  compact
                />
              </span>
            )}
          </Board>
        </div>
        {branch ? (
          <>
            <div className="study-navigation">
              <button
                className="secondary"
                aria-label="Variante précédente"
                disabled={!branch.node}
                onClick={() => jumpBranch(-1)}
              >
                ←
              </button>
              <span>{path.length} demi-coup(s)</span>
              <button
                className="secondary"
                aria-label="Variante suivante"
                disabled={
                  blind || !branch.tree.nodes[branch.node].children.length
                }
                onClick={() => jumpBranch(1)}
              >
                →
              </button>
            </div>
            <button
              className="text-button wide return-position"
              onClick={() => navigate(selected)}
            >
              Revenir à la partie
            </button>
          </>
        ) : (
          <>
            <MoveNavigation
              selected={selected}
              total={review.positions.length - 1}
              onSelect={navigate}
            />
            <div className="study-moments">
              <button
                className="secondary"
                disabled={previousMoment === undefined}
                onClick={() => navigate(previousMoment!)}
              >
                Moment précédent
              </button>
              {walkTarget !== null ? (
                <button
                  className="secondary"
                  onClick={() => setWalkTarget(null)}
                >
                  Arrêter le défilement
                </button>
              ) : (
                <button
                  disabled={selected === review.positions.length - 1}
                  onClick={() =>
                    setWalkTarget(nextMoment ?? review.positions.length - 1)
                  }
                >
                  {nextMoment === undefined
                    ? "Aller à la fin"
                    : "Prochain moment clé"}
                </button>
              )}
            </div>
          </>
        )}
        {!blind && showEvaluation && (
          <div className="desktop-chart">
            <EvaluationChart
              positions={review.positions}
              results={review.results}
              selected={selected}
              onSelect={navigate}
            />
          </div>
        )}
      </div>
      <aside className="review-sidebar study-details">
        <nav className="pane-tabs" aria-label="Panneaux de la revue">
          <button
            className="text-button"
            aria-pressed={pane === "details"}
            onClick={() => setPane("details")}
          >
            Analyse
          </button>
          <button
            className="text-button"
            aria-pressed={pane === "moves"}
            onClick={() => setPane("moves")}
          >
            Coups
          </button>
        </nav>
        {pane === "moves" ? (
          <div className="review-moves" aria-label="Positions de la partie">
            {review.positions.map((item, index) => (
              <button
                className="secondary"
                key={index}
                aria-pressed={!branch && index === selected}
                onClick={() => navigate(index)}
              >
                {item.label}
                {showAnnotations && index > 0 && (
                  <AnnotationBadge
                    annotation={annotations[index - 1]}
                    provisional={review.state !== "complete"}
                    compact
                  />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="review-details">
            <h2>
              {blind
                ? "À vous de jouer"
                : branch
                  ? "Votre variante"
                  : selected === 0
                    ? "Revivez la partie"
                    : position.label}
            </h2>
            {blind ? (
              <p className="hint">
                Retrouvez une bonne décision pour les{" "}
                {board.turn() === "w" ? "Blancs" : "Noirs"}. L’évaluation et la
                solution sont masquées pendant votre réflexion.
              </p>
            ) : (
              <>
                {showAnnotations && annotation && (
                  <div
                    className="move-assessment"
                    aria-label="Classification du coup joué"
                  >
                    <AnnotationBadge
                      annotation={annotation}
                      provisional={provisional}
                    />
                    <p>{moveSummary(annotation)}</p>
                  </div>
                )}
                {branch && (
                  <div className="study-evaluation" role="status">
                    {showEvaluation && (
                      <strong>
                        Évaluation de cette variante : {scoreLabel(score)}
                      </strong>
                    )}
                    <span>
                      {pending
                        ? "Calcul et vérification du coup…"
                        : liveState === "error"
                          ? "Évaluation indisponible"
                          : `Profondeur ${liveResult?.depth ?? "—"}`}
                    </span>
                    {board.isGameOver() && (
                      <strong>
                        {board.isCheckmate()
                          ? "Échec et mat."
                          : "Position nulle."}
                      </strong>
                    )}
                  </div>
                )}
                {showAnnotations &&
                  !annotation &&
                  (branch ? branch.node > 0 : playedPosition) && (
                    <p className="hint">
                      {branch
                        ? pending
                          ? "Le moteur compare votre coup aux possibilités de la position…"
                          : "Les évaluations restent insuffisantes ou contradictoires pour classer ce coup."
                        : unclassifiedReason(
                            playedPosition!,
                            before ?? null,
                            review.results[selected],
                            review.state,
                          )}
                    </p>
                  )}
                {branch?.retry &&
                  branch.tree.nodes[branch.node].parent ===
                    branch.retryNode && (
                    <div
                      className={`retry-feedback ${annotation && !badMove(annotation) ? "success" : ""}`}
                      role="status"
                    >
                      <p>
                        {branch.revealed
                          ? "Solution du moteur affichée."
                          : pending
                            ? "Le moteur évalue votre tentative…"
                            : annotation && !badMove(annotation)
                              ? board.isCheckmate()
                                ? "Bonne décision : échec et mat."
                                : "Bonne décision ! Vous pouvez poursuivre cette variante."
                              : "Vous pouvez retenter ce coup ou explorer sa suite."}
                      </p>
                    </div>
                  )}
              </>
            )}
            {matching && live.error && (
              <div role="alert">
                <p className="connection-error">{live.error}</p>
                <button
                  className="secondary"
                  onClick={() => setRetrySearch((value) => value + 1)}
                >
                  Réessayer l’évaluation
                </button>
              </div>
            )}
            {(branch
              ? branch.node !== 0 &&
                !blind &&
                !(
                  branch.retry &&
                  branch.tree.nodes[branch.node].parent === branch.retryNode
                )
              : selected > 0) && (
              <div className={emphasis ? "retry-invitation" : ""}>
                {emphasis && (
                  <p>
                    Une meilleure possibilité était disponible. Retrouvez-la sur
                    le plateau.
                  </p>
                )}
                <button
                  className={emphasis ? "wide" : "secondary wide"}
                  onClick={retry}
                >
                  Réessayer ce coup
                </button>
              </div>
            )}
            {branch?.retry &&
              (blind ||
                branch.tree.nodes[branch.node].parent === branch.retryNode) && (
                <>
                  {branch.node !== branch.retryNode && (
                    <button
                      className="secondary wide"
                      onClick={() =>
                        setBranch({
                          ...branch,
                          node: branch.retryNode ?? 0,
                          revealed: false,
                        })
                      }
                    >
                      Retenter sans la solution
                    </button>
                  )}
                  <button
                    className="secondary wide"
                    disabled={!target?.bestMove}
                    onClick={() => {
                      const move = target!.bestMove!;
                      const node = branch.tree.play(
                        branch.retryNode ?? 0,
                        move.slice(0, 2),
                        move.slice(2, 4),
                        move[4],
                      );
                      setBranch({ ...branch, node, revealed: true });
                    }}
                  >
                    Voir la solution
                  </button>
                </>
              )}
            {branch && (
              <button
                className="wide"
                onClick={() => {
                  navigate(selected);
                  if (selected < review.positions.length - 1)
                    setWalkTarget(nextMoment ?? review.positions.length - 1);
                }}
              >
                Continuer la revue
              </button>
            )}
            {!blind && (
              <>
                {branch ? (
                  <>
                    <div
                      className="study-line"
                      aria-label="Coups de la variante"
                    >
                      <button
                        className="secondary"
                        onClick={() => setBranch({ ...branch, node: 0 })}
                      >
                        Départ
                      </button>
                      {path.map((item) => (
                        <button
                          className="secondary"
                          key={item.id}
                          aria-pressed={item.id === branch.node}
                          onClick={() =>
                            setBranch({ ...branch, node: item.id })
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {!!branch.tree.nodes[branch.node].children.length && (
                      <div className="study-branches">
                        <h3>Suites déjà explorées</h3>
                        {branch.tree.nodes[branch.node].children.map((id) => (
                          <button
                            className="secondary"
                            key={id}
                            onClick={() => setBranch({ ...branch, node: id })}
                          >
                            {branch.tree.nodes[id].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!!trees.get(selected)?.nodes[0].children.length && (
                      <div className="study-branches">
                        <h3>Vos variantes</h3>
                        {trees.get(selected)!.nodes[0].children.map((id) => (
                          <button
                            className="secondary"
                            key={id}
                            onClick={() =>
                              setBranch({
                                tree: cachedTree(selected),
                                node: id,
                                origin: selected,
                                retry: false,
                                revealed: false,
                              })
                            }
                          >
                            {trees.get(selected)!.nodes[id].label}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="hint">
                      Jouez directement sur l’échiquier pour essayer une autre
                      suite. Les moments clés retiennent{" "}
                      {side === "both"
                        ? "les coups des deux camps"
                        : `vos coups avec les ${side === "w" ? "Blancs" : "Noirs"}`}
                      . Chaque coup reste accessible avec ← → ou &lt; &gt;.
                    </p>
                  </>
                )}
                <details className="position-details" open={!branch}>
                  <summary>Détails et meilleure suite</summary>
                  <dl>
                    {(branch ? branch.node > 0 : playedPosition) && (
                      <div>
                        <dt>Coup joué</dt>
                        <dd>
                          {branch
                            ? branch.tree.position(
                                branch.tree.nodes[branch.node].parent!,
                                uci ?? null,
                              ).playedSan
                            : playedPosition?.playedSan}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Meilleur coup proposé</dt>
                      <dd>{before?.bestSan ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Profondeur atteinte</dt>
                      <dd>{before?.depth ?? "—"}</dd>
                    </div>
                    {showEvaluation && (
                      <>
                        {hasPlayed && (
                          <div>
                            <dt>Avant le coup</dt>
                            <dd>{scoreLabel(before?.score ?? null)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>
                            {hasPlayed
                              ? "Après le coup joué"
                              : "Évaluation de la position"}
                          </dt>
                          <dd>{scoreLabel(score)}</dd>
                        </div>
                        {loss !== null && (
                          <div>
                            <dt>Perte estimée</dt>
                            <dd>
                              {loss.toLocaleString("fr-FR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              pion(s)
                            </dd>
                          </div>
                        )}
                      </>
                    )}
                  </dl>
                  <div className="variation-moves">
                    {before?.variation.map((move, index) => (
                      <button
                        className="secondary"
                        key={index}
                        onClick={() => recommended(index)}
                      >
                        {move.label}
                      </button>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
        )}
      </aside>
      {!blind && showEvaluation && (
        <div className="mobile-chart">
          <EvaluationChart
            positions={review.positions}
            results={review.results}
            selected={selected}
            onSelect={navigate}
          />
        </div>
      )}
      {promotion && (
        <Dialog title="Choisir la promotion" onClose={() => setPromotion(null)}>
          <div className="choice-row">
            {(
              [
                ["q", "Dame"],
                ["r", "Tour"],
                ["b", "Fou"],
                ["n", "Cavalier"],
              ] as const
            ).map(([piece, label]) => (
              <button
                key={piece}
                onClick={() => play(promotion.from, promotion.to, piece)}
              >
                {label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </section>
  );
}
