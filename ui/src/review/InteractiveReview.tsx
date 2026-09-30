import { explainMove, type ExplanationLine } from "./explanations";
import { useCallback, useEffect, useState } from "react";
import type { Square } from "chess.js";
import RetryCoach from "./RetryCoach";
import { FocusedAnalysis, type FocusRequest } from "./FocusedAnalysis";
import { usableResult } from "./FocusedAnalysis";
import type { Color, Key } from "@lichess-org/chessground/types";
import type { GameReview } from "./GameReview";
import { boardFromCommand, StudyTree } from "./StudyTree";
import { BranchAnalysis } from "./BranchAnalysis";
import { badMove, notablePositions, moveSummary } from "./study";
import { estimatedLoss } from "./model";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import { scoreLabel } from "../engine/analysis";
import Board from "../Board";
import CapturedPieces from "../CapturedPieces";
import { capturedMaterial, materialBalance } from "../material";
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
  const [demo, setDemo] = useState<{
    source: string;
    line: ExplanationLine;
    step: number;
  } | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [live] = useState(() => new BranchAnalysis());
  const [focused] = useState(() => new FocusedAnalysis());
  const [attempt, setAttempt] = useState(0);
  const [highlight, setHighlight] = useState<{
    source: string;
    square: Square;
  } | null>(null);
  const [, render] = useState(0);
  const [pane, setPane] = useState<"details" | "moves">("details");
  const [walkTarget, setWalkTarget] = useState<number | null>(null);
  const [promotion, setPromotion] = useState<{ from: Key; to: Key } | null>(
    null,
  );
  const [retrySearch, setRetrySearch] = useState(0);
  useEffect(() => live.subscribe(() => render((value) => value + 1)), [live]);
  useEffect(
    () => focused.subscribe(() => render((value) => value + 1)),
    [focused],
  );
  const reviewRevision = review.revision;
  const branchCommand = branch?.tree.command(branch.node);
  useEffect(
    () => () => focused.stop(),
    [
      focused,
      review,
      reviewRevision,
      engineId,
      selected,
      branchCommand,
      demo,
      active,
    ],
  );
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
  const retryPosition = branch?.retry
    ? branch.tree.position(branch.retryNode ?? 0)
    : null;
  const hintSource = `${engineId}:${reviewRevision}:${retryPosition?.command}:${attempt}`;
  const hintRequest: FocusRequest | null = retryPosition
    ? { review, revision: reviewRevision, engineId, positions: [retryPosition] }
    : null;
  const showHintSquare = useCallback(
    (square: Square | null) =>
      setHighlight(square ? { source: hintSource, square } : null),
    [hintSource],
  );
  function revealSolution(move: string) {
    if (!branch?.retry) return;
    const node = branch.tree.play(
      branch.retryNode ?? 0,
      move.slice(0, 2),
      move.slice(2, 4),
      move[4],
    );
    setBranch({ ...branch, node, revealed: true });
  }
  const loss = hasPlayed
    ? estimatedLoss(
        before?.score ?? null,
        score,
        branch && path.length
          ? branch.tree.board(branch.tree.nodes[branch.node].parent!).turn()
          : (playedPosition?.turn ?? position.turn),
      )
    : null;

  const explanationPosition = branch
    ? branch.node > 0
      ? branch.tree.position(
          branch.tree.nodes[branch.node].parent!,
          uci ?? null,
        )
      : null
    : playedPosition;
  const explanation =
    explanationPosition && !blind && showAnnotations
      ? explainMove(
          explanationPosition,
          before ?? null,
          branch ? liveResult : review.results[selected],
          annotation,
        )
      : null;
  const focusRequest: FocusRequest | null = explanationPosition
    ? {
        review,
        revision: reviewRevision,
        engineId,
        positions: [
          explanationPosition,
          displayedTree.position(branch?.node ?? 0),
        ],
      }
    : null;
  const focusMatches = !!focusRequest && focused.matches(focusRequest);
  const focusPending = focusMatches && focused.state === "running";
  const focusBlocked =
    review.state === "running" ||
    (!!branch && liveState !== "complete" && liveState !== "error");
  async function deepen() {
    if (!focusRequest || focusBlocked || focusPending) return;
    const results = await focused.analyse(
      focusRequest,
      analysisEngineFactory(engineId),
    );
    if (!results) return;
    if (branch) {
      const parent = branch.tree.nodes[branch.node].parent;
      if (parent === null) return;
      focused.stop();
      live.remember(branch.tree, parent, results[0], true);
      live.remember(branch.tree, branch.node, results[1], true);
      setRetrySearch((value) => value + 1);
    } else review.applyRefinement(reviewRevision, selected - 1, results);
  }
  const demoSource = `${engineId}:${selected}:${explanationPosition?.command}:${uci}:${branch?.node ?? "game"}`;
  const demonstration =
    demo?.source === demoSource && active && !blind && showAnnotations
      ? demo
      : null;
  const demoStep = demonstration?.line.steps[demonstration.step];
  const displayBoard = demoStep ? boardFromCommand(demoStep.command) : board;
  const captures = capturedMaterial(displayBoard.history({ verbose: true }));
  const balance = materialBalance(displayBoard);
  function demonstrate(line: ExplanationLine) {
    setWalkTarget(null);
    setPane("details");
    setDemo({ source: demoSource, line, step: 0 });
  }
  function navigate(index: number) {
    setDemo(null);
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
    setDemo(null);
    if (!branch || !direction || (blind && direction > 0)) return;
    const current = branch.tree.nodes[branch.node];
    const next = direction < 0 ? current.parent : current.children[0];
    if (next !== null && next !== undefined) {
      setPromotion(null);
      setBranch({ ...branch, node: next });
    }
  }
  useMoveKeys(
    active && walkTarget === null && !promotion && !demonstration,
    branch ? path.length : selected,
    branch
      ? path.length + (branch.tree.nodes[branch.node].children.length ? 1 : 0)
      : review.positions.length - 1,
    (index) => (branch ? jumpBranch(index - path.length) : navigate(index)),
  );
  useMoveKeys(
    !!demonstration,
    demonstration?.step ?? 0,
    (demonstration?.line.steps.length ?? 1) - 1,
    (step) => setDemo((value) => (value ? { ...value, step } : null)),
  );
  function retry() {
    setAttempt((value) => value + 1);
    setDemo(null);
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
          {demonstration
            ? `Explication · ${demonstration.line.title}`
            : branch
              ? blind
                ? "À vous de trouver le meilleur coup"
                : `${branch.retry && path.length === 1 ? "Votre tentative" : "Variante"} · ${branch.node ? branch.tree.nodes[branch.node].label : branch.tree.root.label}`
              : position.label}
        </p>
        <CapturedPieces
          captures={captures}
          balance={balance}
          side={orientation === "white" ? "b" : "w"}
          label
        />
        <div
          className={`board-with-evaluation ${showEvaluation ? "show-evaluation" : ""}`}
        >
          {showEvaluation && (
            <EvaluationBar
              score={blind || demonstration ? null : score}
              orientation={orientation}
            />
          )}
          <div className="review-board-stage">
            <div
              className={`source-board ${demonstration ? "is-hidden" : ""}`}
              aria-hidden={!!demonstration}
              inert={!!demonstration}
            >
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
                autoShapes={
                  blind && highlight?.source === hintSource
                    ? [{ orig: highlight.square, brush: "green" }]
                    : []
                }
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
            {demonstration && demoStep && (
              <Board
                fen={displayBoard.fen()}
                orientation={orientation}
                turn={displayBoard.turn() === "w" ? "white" : "black"}
                check={displayBoard.isCheck()}
                lastMove={
                  demoStep.move ? [demoStep.move.from, demoStep.move.to] : []
                }
                autoShapes={(() => {
                  if (demoStep.marks?.length)
                    return demoStep.marks.map((mark) => ({
                      orig: mark.from,
                      dest: mark.to,
                      brush: mark.tone === "idea" ? "green" : "red",
                    }));
                  const next =
                    demonstration.line.steps[demonstration.step + 1]?.move;
                  return next
                    ? [{ orig: next.from, dest: next.to, brush: "blue" }]
                    : [];
                })()}
              />
            )}
          </div>
        </div>
        <CapturedPieces
          captures={captures}
          balance={balance}
          side={orientation === "white" ? "w" : "b"}
          label
        />
        {demonstration ? (
          <div className="explanation-navigation">
            <p role="status">
              Étape {demonstration.step} / {demonstration.line.steps.length - 1}{" "}
              · {demoStep?.label}
            </p>
            <MoveNavigation
              selected={demonstration.step}
              total={demonstration.line.steps.length - 1}
              onSelect={(step) => setDemo({ ...demonstration, step })}
            />
            <button className="secondary wide" onClick={() => setDemo(null)}>
              Retour au coup examiné
            </button>
          </div>
        ) : branch ? (
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
        {!blind && !demonstration && showEvaluation && (
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
            onClick={() => {
              setDemo(null);
              setPane("details");
            }}
          >
            Analyse
          </button>
          <button
            className="text-button"
            aria-pressed={pane === "moves"}
            onClick={() => {
              setDemo(null);
              setPane("moves");
            }}
          >
            Coups
          </button>
        </nav>
        {demonstration ? (
          <div className="review-details explanation-demo">
            <h2>{demonstration.line.title}</h2>
            {demoStep?.motif && (
              <p className="explanation-motif">{demoStep.motif}</p>
            )}
            <p className="explanation-caption" role="status">
              {demoStep?.text}
            </p>
            <p className="hint">
              {demoStep?.marks?.length
                ? "Les repères rouges montrent les menaces ; les verts montrent la défense ou l’idée du coup."
                : "La flèche bleue indique le prochain coup de cette suite."}{" "}
              La suite illustre une continuation trouvée par le moteur, sans
              imposer les réponses adverses.
            </p>
            {demonstration.line.truncated && (
              <p className="hint">
                La démonstration est limitée aux huit premiers demi-coups.
              </p>
            )}
            {explanation?.played &&
              demonstration.line.title !== explanation.played.title && (
                <button
                  className="secondary"
                  onClick={() => demonstrate(explanation.played!)}
                >
                  Après le coup joué
                </button>
              )}
            {explanation?.alternative &&
              demonstration.line.title !== explanation.alternative.title && (
                <button
                  className="secondary"
                  onClick={() => demonstrate(explanation.alternative!)}
                >
                  Voir la meilleure idée
                </button>
              )}
            <button
              onClick={() => {
                setDemo(null);
                retry();
              }}
            >
              Réessayer ce coup
            </button>
          </div>
        ) : pane === "moves" ? (
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
                    <p>
                      {explanation?.concrete
                        ? explanation.summary
                        : moveSummary(annotation)}
                    </p>
                  </div>
                )}
                {explanation && (
                  <div
                    className="move-explanation"
                    aria-label="Comprendre le coup"
                  >
                    {!explanation.concrete && (
                      <p className="hint">{explanation.summary}</p>
                    )}
                    {explanation.concrete && !annotation && (
                      <p>{explanation.summary}</p>
                    )}
                    <div className="explanation-actions">
                      {explanation.played && (
                        <button
                          className="secondary"
                          onClick={() =>
                            demonstrate(
                              explanation.primary === "alternative"
                                ? explanation.alternative!
                                : explanation.played!,
                            )
                          }
                        >
                          {explanation.concrete
                            ? "Montrer pourquoi"
                            : "Voir la suite"}
                        </button>
                      )}
                      {explanation.alternative && (
                        <button
                          className="secondary"
                          onClick={() =>
                            demonstrate(
                              explanation.primary === "alternative"
                                ? explanation.played!
                                : explanation.alternative!,
                            )
                          }
                        >
                          {explanation.primary === "alternative"
                            ? "Voir la suite jouée"
                            : "Voir la meilleure idée"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {showAnnotations &&
                  focusRequest &&
                  (!explanation?.concrete ||
                    !annotation ||
                    focusPending ||
                    focused.has(focusRequest)) && (
                    <div
                      className="focused-analysis"
                      aria-label="Vérification ciblée"
                    >
                      {focusPending ? (
                        <div className="focused-progress" role="status">
                          <span
                            className="analysis-spinner"
                            aria-hidden="true"
                          />{" "}
                          Le moteur vérifie ce coup… {focused.completed} /{" "}
                          {focused.total} positions. La navigation reste
                          disponible.
                          <button
                            className="text-button"
                            onClick={() => focused.stop()}
                          >
                            Arrêter la vérification
                          </button>
                        </div>
                      ) : focused.has(focusRequest) ? (
                        <p className="hint" role="status">
                          {focused.isUnavailable(focusRequest)
                            ? "La vérification n’a pas fourni de résultats exploitables."
                            : explanation?.concrete
                              ? "Explication vérifiée sur ce coup."
                              : "Vérification terminée ; aucune cause plus précise n’a pu être confirmée."}
                        </p>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            disabled={!active || focusBlocked}
                            onClick={() => void deepen()}
                          >
                            Approfondir ce coup
                          </button>
                          <p className="hint">
                            Vérifier uniquement les positions avant et après ce
                            coup, jusqu’à 3 secondes chacune.
                          </p>
                          {focusMatches && focused.state === "error" && (
                            <p className="connection-error" role="alert">
                              La vérification a échoué. Vous pouvez réessayer.
                            </p>
                          )}
                          {focusMatches && focused.state === "stopped" && (
                            <p className="hint" role="status">
                              Vérification interrompue.
                            </p>
                          )}
                        </>
                      )}
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
                      onClick={() => {
                        setAttempt((value) => value + 1);
                        setBranch({
                          ...branch,
                          node: branch.retryNode ?? 0,
                          revealed: false,
                        });
                      }}
                    >
                      Retenter sans la solution
                    </button>
                  )}
                  {blind && retryPosition && hintRequest ? (
                    <RetryCoach
                      key={hintSource}
                      position={retryPosition}
                      result={target}
                      request={hintRequest}
                      analysis={focused}
                      factory={analysisEngineFactory(engineId)}
                      blocked={!active || focusBlocked}
                      onHighlight={showHintSquare}
                      onRefined={(result) =>
                        live.remember(
                          branch.tree,
                          branch.retryNode ?? 0,
                          result,
                        )
                      }
                      onReveal={revealSolution}
                    />
                  ) : (
                    <button
                      className="secondary wide"
                      disabled={
                        !retryPosition || !usableResult(retryPosition, target)
                      }
                      onClick={() =>
                        target?.bestMove && revealSolution(target.bestMove)
                      }
                    >
                      Voir la solution
                    </button>
                  )}
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
      {!blind && !demonstration && showEvaluation && (
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
