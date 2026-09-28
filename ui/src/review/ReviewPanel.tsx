import { useCallback, useEffect, useState } from "react";
import { Chess } from "chess.js";
import type { Color } from "@lichess-org/chessground/types";
import { GameReview } from "./GameReview";
import ReviewProgress from "./ReviewProgress";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import AnalysisEngineSelect from "./AnalysisEngineSelect";
import InteractiveReview from "./InteractiveReview";
import { StudyTree } from "./StudyTree";
import Dialog from "../Dialog";
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
  const [side, setSide] = useState(learnerSide);
  const [revision, setRevision] = useState(0);
  const [studyTrees] = useState(() => new Map<number, StudyTree>());
  const running = review.state === "running";
  const settingsChanged =
    budget !== appliedBudget || engineId !== appliedEngineId;
  const canRestart =
    !running &&
    (settingsChanged || review.state === "stopped" || review.state === "error");
  function restart() {
    setRevision((value) => value + 1);
    setAppliedBudget(budget);
    setAppliedEngineId(engineId);
    savePreference("chess-ui.analysis-engine", engineId);
    setOptions(false);
    void review.start(analysisEngineFactory(engineId), budget);
  }
  const navigate = useCallback((index: number) => {
    setSelected(index);
  }, []);
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
      <InteractiveReview
        key={revision}
        review={review}
        selected={selected}
        onSelect={navigate}
        engineId={appliedEngineId}
        orientation={orientation}
        showEvaluation={showEvaluation}
        showAnnotations={showAnnotations}
        active={active}
        side={side}
        treeCache={studyTrees}
      />
      {options && (
        <Dialog title="Options d’analyse" onClose={() => setOptions(false)}>
          <div className="dialog-actions">
            <label>
              Moments clés à parcourir
              <select
                aria-label="Mon camp pour les exercices"
                value={side}
                onChange={(event) => setSide(event.target.value as typeof side)}
              >
                <option value="both">Les deux camps</option>
                <option value="w">Mes coups : Blancs</option>
                <option value="b">Mes coups : Noirs</option>
              </select>
            </label>
            <label>
              Temps par position
              <select
                aria-label="Temps par position"
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
