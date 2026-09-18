import { useEffect, useState } from "react";
import type { Color, Key } from "@lichess-org/chessground/types";
import type { GameReview } from "./GameReview";
import { StudyTree } from "./StudyTree";
import { LiveStudy } from "./LiveStudy";
import { badMove, notablePositions, retryFeedback } from "./study";
import type { ReviewResult } from "./model";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import { scoreLabel } from "../engine/analysis";
import Board from "../Board";
import EvaluationBar from "../EvaluationBar";
import MoveNavigation from "../MoveNavigation";
import Dialog from "../Dialog";
import AnnotationBadge from "./AnnotationBadge";
import { annotationPlacement } from "./annotationPlacement";
import { unclassifiedReason } from "./unclassifiedReason";
import { useMoveKeys } from "../useMoveKeys";

type Branch = {
  tree: StudyTree;
  node: number;
  mode: "explore" | "retry";
  origin: number;
  target: ReviewResult | null;
  revealed: boolean;
};
export default function LearningReview({
  review,
  selected,
  onSelect,
  engineId,
  orientation,
  showEvaluation,
  showAnnotations,
  active,
  initialSide = "both",
  treeCache,
}: {
  review: GameReview;
  selected: number;
  onSelect: (index: number) => void;
  engineId: string;
  orientation: Color;
  showEvaluation: boolean;
  showAnnotations: boolean;
  active: boolean;
  initialSide?: "w" | "b" | "both";
  treeCache?: Map<number, StudyTree>;
}) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [ownTrees] = useState(() => new Map<number, StudyTree>());
  const trees = treeCache ?? ownTrees;
  const [live] = useState(() => new LiveStudy());
  const [, render] = useState(0);
  const [side, setSide] = useState(initialSide);
  const [walkTarget, setWalkTarget] = useState<number | null>(null);
  const [promotion, setPromotion] = useState<{ from: Key; to: Key } | null>(
    null,
  );
  const [retrySearch, setRetrySearch] = useState(0);
  useEffect(() => live.subscribe(() => render((value) => value + 1)), [live]);
  const tree = branch?.tree,
    node = branch?.node;
  useEffect(() => {
    void live.stop();
    if (!active || !tree || node === undefined) return;
    const timer = setTimeout(
      () =>
        void live.analyse(tree.command(node), analysisEngineFactory(engineId)),
      180,
    );
    return () => {
      clearTimeout(timer);
      void live.stop();
    };
  }, [active, tree, node, engineId, live, retrySearch]);
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
  const annotation = selected > 0 ? annotations[selected - 1] : null;
  const playedPosition = selected > 0 ? review.positions[selected - 1] : null;
  const moments = notablePositions(annotations, review.positions);
  const nextMoment = moments.find((index) => index > selected);
  const previousMoment = moments.filter((index) => index < selected).at(-1);
  const displayedTree = branch?.tree ?? new StudyTree(position);
  const board = displayedTree.board(branch?.node ?? 0);
  const path = branch?.tree.path(branch.node) ?? [];
  const matching =
    !!branch && live.command === branch.tree.command(branch.node);
  const liveResult = matching ? live.result : null;
  const liveInfo = matching ? live.info : null;
  const liveState = matching ? live.state : "idle";
  const target =
    branch?.target ??
    (branch?.mode === "retry" && branch.node === 0 ? liveResult : null);
  const blind =
    branch?.mode === "retry" && branch.node === 0 && !branch.revealed;
  const canPlay =
    !!branch &&
    !promotion &&
    !board.isGameOver() &&
    (branch.mode === "explore" || (branch.node === 0 && !!target?.bestMove));
  const liveScore = liveResult?.score ?? liveInfo?.score ?? null;
  const score = branch ? liveScore : (review.results[selected]?.score ?? null);
  const uci = branch
    ? branch.tree.nodes[branch.node].uci
    : playedPosition?.played;
  const placement =
    !branch && uci
      ? annotationPlacement(board.fen(), uci.slice(2, 4), orientation)
      : null;
  const emphasis =
    badMove(annotation) &&
    !!playedPosition &&
    (side === "both" || playedPosition.turn === side);
  function navigate(index: number) {
    setWalkTarget(null);
    setBranch(null);
    setPromotion(null);
    onSelect(index);
  }
  function jumpBranch(direction: number) {
    if (!branch || !direction) return;
    const current = branch.tree.nodes[branch.node];
    const next = direction < 0 ? current.parent : current.children[0];
    if (next !== null && next !== undefined)
      setBranch({ ...branch, node: next });
  }
  useMoveKeys(
    active && walkTarget === null && !blind,
    branch ? path.length : selected,
    branch
      ? path.length + (branch.tree.nodes[branch.node].children.length ? 1 : 0)
      : review.positions.length - 1,
    (index) => {
      if (branch) jumpBranch(index - path.length);
      else navigate(index);
    },
  );
  function explore() {
    setWalkTarget(null);
    let tree = trees.get(selected);
    if (!tree) {
      tree = new StudyTree(position);
      trees.set(selected, tree);
    }
    setBranch({
      tree,
      node: 0,
      mode: "explore",
      origin: selected,
      target: null,
      revealed: false,
    });
  }
  function retry() {
    setWalkTarget(null);
    setPromotion(null);
    const origin = Math.max(0, selected - 1);
    setBranch({
      tree: new StudyTree(review.positions[origin]),
      node: 0,
      mode: "retry",
      origin,
      target: review.results[origin],
      revealed: false,
    });
  }
  function play(from: Key, to: Key, piece?: string) {
    if (!branch) return;
    const moves = board
      .moves({ verbose: true })
      .filter((move) => move.from === from && move.to === to);
    if (!moves.length) return;
    if (!piece && moves.some((move) => move.promotion)) {
      setPromotion({ from, to });
      return;
    }
    const next = branch.tree.play(branch.node, from, to, piece);
    setBranch({ ...branch, node: next, target });
    setPromotion(null);
  }
  const feedback =
    branch?.mode === "retry" && branch.node !== 0 && path[0]?.uci
      ? retryFeedback(
          path[0].uci,
          branch.target,
          liveState === "complete" ? liveResult : null,
          branch.tree.root.turn,
        )
      : null;
  const waitingFeedback =
    !!feedback &&
    feedback.kind !== "success" &&
    liveState !== "complete" &&
    liveState !== "error";
  return (
    <section
      className="workspace review-workspace learning-workspace"
      aria-label="Revue guidée et exploration"
    >
      <div className="board-column">
        <p className="review-position">
          {branch
            ? branch.mode === "retry"
              ? branch.node === 0
                ? "À vous de trouver le meilleur coup"
                : `Votre tentative · ${branch.tree.nodes[branch.node].label}`
              : `Variante · ${branch.node ? branch.tree.nodes[branch.node].label : branch.tree.root.label}`
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
            {!branch && showAnnotations && annotation && placement && (
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
                  provisional={review.state !== "complete"}
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
                disabled={!branch.node || blind}
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
      </div>
      <aside className="review-sidebar study-details">
        {!branch ? (
          <>
            <h2>
              {selected === 0 ? "Parcourir et comprendre" : position.label}
            </h2>
            {showAnnotations && annotation && (
              <div className="move-assessment">
                <AnnotationBadge
                  annotation={annotation}
                  provisional={review.state !== "complete"}
                />
                <p>{annotation.reason}</p>
              </div>
            )}
            {showAnnotations && !annotation && playedPosition && (
              <p className="hint">
                {unclassifiedReason(
                  playedPosition,
                  review.results[selected - 1],
                  review.results[selected],
                  review.state,
                )}
              </p>
            )}
            {review.state !== "complete" && (
              <p className="hint">
                Les moments clés disponibles évoluent pendant le calcul de la
                partie.
              </p>
            )}
            <label>
              Mon camp
              <select
                aria-label="Mon camp pour les exercices"
                value={side}
                onChange={(event) => setSide(event.target.value as typeof side)}
              >
                <option value="both">Les deux camps</option>
                <option value="w">Blancs</option>
                <option value="b">Noirs</option>
              </select>
            </label>
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
            <button
              className="secondary wide"
              onClick={explore}
              disabled={board.isGameOver()}
            >
              Explorer cette position
            </button>
            <p className="hint">
              Réessayez aussi les coups adverses. Les flèches parcourent chaque
              coup ; les moments clés retiennent les imprécisions, erreurs,
              occasions manquées, coups décisifs, brillants et mats.
            </p>
          </>
        ) : (
          <>
            <h2>
              {branch.mode === "retry"
                ? "À vous de jouer"
                : "Explorer les possibilités"}
            </h2>
            <p>
              {branch.mode === "retry"
                ? `Retrouvez une bonne décision pour les ${branch.tree.root.turn === "w" ? "Blancs" : "Noirs"}.`
                : `Jouez pour les ${board.turn() === "w" ? "Blancs" : "Noirs"}, puis pour l’autre camp. La partie d’origine reste intacte.`}
            </p>
            {blind && (
              <p className="hint">
                L’évaluation et la solution sont masquées pendant votre
                réflexion.
                {!target?.bestMove ? " Le moteur prépare cet exercice…" : ""}
              </p>
            )}
            {!blind && (
              <div className="study-evaluation" role="status">
                {showEvaluation && (
                  <strong>
                    Évaluation de cette variante : {scoreLabel(score)}
                  </strong>
                )}
                <span>
                  {liveState === "running" || liveState === "idle"
                    ? "Calcul de la variante…"
                    : liveState === "error"
                      ? "Évaluation indisponible"
                      : `Profondeur ${liveResult?.depth ?? "—"}`}
                </span>
                {board.isGameOver() && (
                  <strong>
                    {board.isCheckmate() ? "Échec et mat." : "Position nulle."}
                  </strong>
                )}
              </div>
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
            {feedback && (
              <div className={`retry-feedback ${feedback.kind}`} role="status">
                <p>
                  {branch.revealed
                    ? "Solution du moteur affichée."
                    : waitingFeedback
                      ? "Le moteur évalue votre tentative…"
                      : feedback.text}
                </p>
              </div>
            )}
            {branch.mode === "retry" ? (
              <>
                {branch.node !== 0 && (
                  <button className="secondary wide" onClick={retry}>
                    Retenter sans la solution
                  </button>
                )}
                <button
                  className="secondary wide"
                  disabled={!target?.bestMove}
                  onClick={() => {
                    const move = target!.bestMove!;
                    const next = branch.tree.play(
                      0,
                      move.slice(0, 2),
                      move.slice(2, 4),
                      move[4],
                    );
                    setBranch({
                      ...branch,
                      node: next,
                      target,
                      revealed: true,
                    });
                  }}
                >
                  Voir la solution
                </button>
                <button
                  className="secondary wide"
                  onClick={() => setBranch({ ...branch, mode: "explore" })}
                >
                  Explorer à partir d’ici
                </button>
              </>
            ) : (
              <>
                <div className="study-line" aria-label="Coups de la variante">
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
                      onClick={() => setBranch({ ...branch, node: item.id })}
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
                <p className="hint">
                  Revenez en arrière pour essayer un autre coup : vos autres
                  branches restent accessibles ici.
                </p>
              </>
            )}
          </>
        )}
      </aside>
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
