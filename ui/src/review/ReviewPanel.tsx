import { useCallback, useEffect, useState } from "react";
import { Chess } from "chess.js";
import type { Color, Key } from "@lichess-org/chessground/types";
import { GameReview } from "./GameReview";
import ReviewProgress from "./ReviewProgress";
import { unclassifiedReason } from "./unclassifiedReason";
import { estimatedLoss } from "./model";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import AnalysisEngineSelect from "./AnalysisEngineSelect";
import LearningReview from "./LearningReview";
import { StudyTree } from "./StudyTree";
import { scoreLabel } from "../engine/analysis";
import EvaluationBar from "../EvaluationBar";
import EvaluationChart from "./EvaluationChart";
import Board from "../Board";
import Dialog from "../Dialog";
import MoveNavigation from "../MoveNavigation";
import { useMoveKeys } from "../useMoveKeys";
import AnnotationBadge from "./AnnotationBadge";
import { annotationPlacement } from "./annotationPlacement";
import { readPreference, savePreference } from "../preferences";

export default function ReviewPanel({
  pgn,
  active,
  showEvaluation,
  onToggle,
  learnerSide = "both",
}: {
  pgn: string;
  active: boolean;
  showEvaluation: boolean;
  onToggle: (show: boolean) => void;
  learnerSide?: "w" | "b" | "both";
}) {
  const [review] = useState(() => new GameReview(pgn));
  const [, render] = useState(0);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [budget, setBudget] = useState(500);
  const [appliedBudget, setAppliedBudget] = useState(500);
  const [engineId, setEngineId] = useState(
    () => readPreference("chess-ui.analysis-engine") || "default",
  );
  const [appliedEngineId, setAppliedEngineId] = useState(engineId);
  const [headers] = useState(() => {
    const game = new Chess();
    game.loadPgn(pgn);
    return game.getHeaders();
  });
  const [orientation, setOrientation] = useState<Color>("white");
  const [options, setOptions] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(
    () => readPreference("chess-ui.show-annotations") !== "false",
  );
  const [pane, setPane] = useState<"details" | "moves">("details");
  const [learning, setLearning] = useState(false);
  const [studyTrees] = useState(() => new Map<number, StudyTree>());
  const position = review.positions[selected];
  const result = review.results[selected];
  // La position sélectionnée est celle APRÈS le coup à commenter.
  const playedPosition = selected > 0 ? review.positions[selected - 1] : null;
  const playedResult = selected > 0 ? review.results[selected - 1] : result;
  const variation = preview === null ? null : playedResult?.variation[preview];
  const fen = variation?.fen ?? position.fen;
  const board = new Chess(fen);
  const previous = playedPosition?.played;
  const lastFrom = variation?.from ?? previous?.slice(0, 2);
  const lastTo = variation?.to ?? previous?.slice(2, 4);
  const badgePlacement = lastTo
    ? annotationPlacement(fen, lastTo, orientation)
    : null;
  const score = result?.score ?? null;
  const loss = playedPosition
    ? estimatedLoss(playedResult?.score ?? null, score, playedPosition.turn)
    : null;
  const running = review.state === "running";
  const annotations = review.annotations;
  const annotation = selected > 0 ? annotations[selected - 1] : null;
  const provisional = review.state !== "complete";
  const settingsChanged =
    budget !== appliedBudget || engineId !== appliedEngineId;
  const canRestart =
    !running &&
    (settingsChanged || review.state === "stopped" || review.state === "error");
  function restart() {
    setLearning(false);
    setAppliedBudget(budget);
    setAppliedEngineId(engineId);
    savePreference("chess-ui.analysis-engine", engineId);
    setPreview(null);
    setOptions(false);
    void review.start(analysisEngineFactory(engineId), budget);
  }
  const navigate = useCallback((index: number) => {
    setSelected(index);
    setPreview(null);
  }, []);
  useMoveKeys(
    active && !learning,
    selected,
    review.positions.length - 1,
    navigate,
  );
  useEffect(() => {
    const unsubscribe = review.subscribe(() => render((value) => value + 1));
    return () => {
      unsubscribe();
      void review.stop();
    };
  }, [review]);
  useEffect(() => {
    let cancelled = false;
    // Attendre le montage effectif évite une double connexion en mode strict React.
    if (active && review.state === "idle")
      queueMicrotask(() => {
        if (!cancelled)
          void review.start(analysisEngineFactory(appliedEngineId), 500);
      });
    if (!active) void review.stop();
    return () => {
      cancelled = true;
    };
  }, [active, review, appliedEngineId]);
  return (
    <section className="review-panel" aria-label="Analyse de la partie">
      <div className="review-source">
        <span>
          {headers.White || "Blancs"} — {headers.Black || "Noirs"}
          {headers.Result && headers.Result !== "*"
            ? ` · ${headers.Result}`
            : ""}
        </span>
        <span>
          {review.engineName
            ? `Moteur : ${review.engineName}`
            : "Connexion au moteur d’analyse…"}
        </span>
      </div>
      <div className="review-topbar">
        <ReviewProgress review={review} />
        <div className="toolbar-actions">
          {running && (
            <button className="secondary" onClick={() => void review.stop()}>
              Arrêter
            </button>
          )}
          <button className="secondary" onClick={() => setOptions(true)}>
            Options d’analyse
            {settingsChanged && (
              <span
                className="settings-dot"
                aria-label="Réglages de calcul non appliqués"
              />
            )}
          </button>
        </div>
      </div>
      {review.error && (
        <p className="connection-error" role="alert">
          {review.error} Vérifiez le pont local puis réessayez. Les positions
          restent consultables.
        </p>
      )}
      <nav className="review-mode" aria-label="Mode de revue">
        <button
          className="secondary"
          aria-pressed={!learning}
          onClick={() => setLearning(false)}
        >
          Analyse détaillée
        </button>
        <button
          className="secondary"
          aria-pressed={learning}
          onClick={() => setLearning(true)}
        >
          Revue guidée & exploration
        </button>
      </nav>
      {learning ? (
        <LearningReview
          review={review}
          selected={selected}
          onSelect={navigate}
          engineId={appliedEngineId}
          orientation={orientation}
          showEvaluation={showEvaluation}
          showAnnotations={showAnnotations}
          active={active}
          initialSide={learnerSide}
          treeCache={studyTrees}
        />
      ) : (
        <div className="workspace review-workspace">
          <div className="board-column">
            <p className="review-position">
              {variation ? `Variante · ${variation.label}` : position.label}
            </p>
            <div
              className={`board-with-evaluation ${showEvaluation ? "show-evaluation" : ""}`}
            >
              {showEvaluation && (
                <EvaluationBar
                  score={variation ? null : score}
                  orientation={orientation}
                />
              )}
              <Board
                fen={fen}
                orientation={orientation}
                turn={board.turn() === "w" ? "white" : "black"}
                check={board.isCheck()}
                lastMove={
                  lastFrom && lastTo ? [lastFrom as Key, lastTo as Key] : []
                }
              >
                {showAnnotations &&
                  !variation &&
                  annotation &&
                  badgePlacement && (
                    <span
                      className="board-annotation"
                      data-corner={badgePlacement.corner}
                      style={{
                        left: `${badgePlacement.column * 12.5}%`,
                        top: `${badgePlacement.row * 12.5}%`,
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
            <MoveNavigation
              selected={selected}
              total={review.positions.length - 1}
              onSelect={navigate}
            />
            {variation && (
              <button
                className="text-button wide return-position"
                onClick={() => setPreview(null)}
              >
                Revenir à la position de la partie
              </button>
            )}
            {showEvaluation && (
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
          <aside className="review-sidebar">
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
                    aria-pressed={index === selected}
                    onClick={() => navigate(index)}
                  >
                    {item.label}
                    {showAnnotations && index > 0 && (
                      <AnnotationBadge
                        annotation={annotations[index - 1]}
                        provisional={provisional}
                        compact
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="review-details">
                <h2>{position.label}</h2>
                {(review.state === "idle" || running) &&
                  (!result || (playedPosition && !playedResult)) && (
                    <p className="position-pending">
                      Le moteur n’a pas encore terminé le calcul pour cette
                      position.
                    </p>
                  )}
                <dl>
                  {playedPosition && (
                    <div>
                      <dt>Coup joué</dt>
                      <dd>{playedPosition.playedSan}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Meilleur coup proposé</dt>
                    <dd>{playedResult?.bestSan ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Profondeur atteinte</dt>
                    <dd>{playedResult?.depth ?? "—"}</dd>
                  </div>
                  {showEvaluation && (
                    <>
                      {playedPosition && (
                        <div>
                          <dt>Avant le coup</dt>
                          <dd>{scoreLabel(playedResult?.score ?? null)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>
                          {playedPosition
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
                {showAnnotations && playedPosition && (
                  <div
                    className="move-assessment"
                    aria-label="Classification du coup joué"
                  >
                    <AnnotationBadge
                      annotation={annotation}
                      provisional={provisional}
                    />
                    <p className="hint">
                      {annotation?.reason ??
                        unclassifiedReason(
                          playedPosition,
                          playedResult ?? null,
                          result,
                          review.state,
                        )}
                    </p>
                  </div>
                )}
                <h3>
                  {playedPosition
                    ? "Meilleure suite avant ce coup"
                    : "Suite recommandée"}
                </h3>
                {playedResult?.variation.length ? (
                  <div className="variation-moves">
                    {playedResult.variation.map((move, index) => (
                      <button
                        className="secondary"
                        aria-pressed={preview === index}
                        key={index}
                        onClick={() => setPreview(index)}
                      >
                        {move.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    {(playedPosition ?? position).terminal
                      ? "Position terminée."
                      : "En attente de l’analyse de cette position."}
                  </p>
                )}
                <p className="hint">
                  Cliquez sur un coup de la variante pour le revoir. Les scores
                  concernent les positions de la partie, du point de vue des
                  blancs.
                </p>
                {showEvaluation && (
                  <div className="mobile-chart">
                    <EvaluationChart
                      positions={review.positions}
                      results={review.results}
                      selected={selected}
                      onSelect={navigate}
                    />
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
      {options && (
        <Dialog title="Options d’analyse" onClose={() => setOptions(false)}>
          <div className="dialog-actions">
            <label>
              Temps par position
              <select
                value={budget}
                disabled={running}
                onChange={(event) => setBudget(Number(event.target.value))}
              >
                <option value={250}>Rapide · 0,25 s</option>
                <option value={500}>Standard · 0,5 s</option>
                <option value={1000}>Approfondi · 1 s</option>
                <option value={3000}>Long · 3 s</option>
              </select>
            </label>
            <AnalysisEngineSelect
              value={engineId}
              disabled={running}
              onChange={setEngineId}
            />
            {canRestart && (
              <div className="restart-analysis">
                <p>
                  {settingsChanged
                    ? "Les réglages de calcul ont changé. Relancez pour les appliquer à toute la partie."
                    : "Relancez pour terminer l’analyse de la partie."}
                </p>
                <button onClick={restart}>
                  {review.state === "error"
                    ? "Réessayer l’analyse"
                    : "Relancer l’analyse"}
                </button>
              </div>
            )}
            <p className="hint">
              Les changements de moteur et de temps s’appliquent après relance.
              Les options d’affichage sont immédiates.
            </p>
            <label className="evaluation-toggle">
              <input
                type="checkbox"
                checked={showEvaluation}
                onChange={(event) => onToggle(event.target.checked)}
              />
              Afficher l’évaluation dans l’analyse
            </label>
            <label className="annotation-toggle">
              <input
                type="checkbox"
                checked={showAnnotations}
                onChange={(event) => {
                  setShowAnnotations(event.target.checked);
                  savePreference(
                    "chess-ui.show-annotations",
                    String(event.target.checked),
                  );
                }}
              />
              Afficher les annotations des coups
            </label>
            <details className="annotation-method">
              <summary>Comment les coups sont-ils classés ?</summary>
              <p className="hint">
                Les coups suspects sont vérifiés avec un budget doublé, entre 1
                et 6 secondes. Les coups encore non classés bénéficient ensuite
                de deux approfondissements ciblés, jusqu’à 12 secondes par
                position et par passe. Plus de temps peut résoudre une
                incohérence, mais les résultats restent des estimations.
              </p>
              <p className="hint">
                Approximation inspirée de Chess.com, fondée sur le moteur
                sélectionné. L’indice utilisé vaut 1 / (1 + exp(−évaluation /
                400)), en centipions du point de vue du joueur. Il ne représente
                pas une probabilité de victoire calibrée.
              </p>
              <p className="hint">
                Perte d’indice : excellent &lt; 0,02 ; bon &lt; 0,05 ;
                imprécision &lt; 0,10 ; erreur &lt; 0,20 ; gaffe ≥ 0,20. Le
                meilleur coup est le premier choix cohérent du moteur. Les mats
                valent 0 ou 1 selon le vainqueur.
              </p>
              <p className="hint">
                Une occasion manquée perd l’avantage décisif offert au coup
                précédent. « Brillant » exige un sacrifice accepté dans la
                variante du moteur, compensé selon l’évaluation et confirmé par
                une seconde recherche. Certains sacrifices ne seront donc pas
                détectés.
              </p>
              <p className="hint">
                « Coup décisif » (!) récompense le premier choix du moteur qui
                saisit l’occasion offerte au coup précédent pour gagner ou
                sauver une position perdante, après vérification. Le cas de
                l’unique bon coup parmi plusieurs coups légaux n’est pas détecté
                sans comparer les autres choix.
              </p>
              <p className="hint">
                « Forcé » signifie qu’il n’existait qu’un seul coup légal. «
                Théorique » identifie un coup de notre bibliothèque locale
                d’ouvertures Lichess, jusqu’au 20e coup. La bibliothèque n’est
                pas exhaustive et une imprécision ou une erreur détectée reste
                prioritaire sur le badge théorique.
              </p>
              <p className="hint">
                Les jugements du moteur restent provisoires tant que l’analyse
                n’est pas terminée. Une analyse plus longue peut les changer ;
                aucun ajustement selon l’Elo n’est appliqué.
              </p>
            </details>
            <button
              className="secondary"
              onClick={() => {
                setOrientation((value) =>
                  value === "white" ? "black" : "white",
                );
                setOptions(false);
              }}
            >
              Retourner l’échiquier
            </button>
            {review.engineName && (
              <p className="muted">Moteur : {review.engineName}</p>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}
