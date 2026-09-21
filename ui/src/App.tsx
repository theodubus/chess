import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { GameController } from "./GameController";
import GameSetup from "./GameSetup";
import GameView from "./GameView";
import Dialog from "./Dialog";
import ImportPgnDialog from "./ImportPgnDialog";
import { connectDevelopmentEngine } from "./engine/DevelopmentEngine";
import {
  evaluationPreference,
  readSetup,
  resolveSide,
  savePreference,
  type GameSetup as Setup,
} from "./preferences";

// La bibliothèque d'ouvertures n'est utile qu'à l'ouverture de l'analyse.
const ReviewPanel = lazy(() => import("./review/ReviewPanel"));

export default function App() {
  const [controller, setController] = useState<GameController | null>(null);
  const [screen, setScreen] = useState<"setup" | "game" | "review">("setup");
  const [setup, setSetup] = useState(readSetup);
  const [gameSetup, setGameSetup] = useState(readSetup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [, render] = useState(0);
  const [playEvaluation, setPlayEvaluation] = useState(() =>
    evaluationPreference("play"),
  );
  const [reviewEvaluation, setReviewEvaluation] = useState(() =>
    evaluationPreference("review"),
  );
  const [reviewPgn, setReviewPgn] = useState("");
  const [reviewVersion, setReviewVersion] = useState(0);
  const [reviewSide, setReviewSide] = useState<"w" | "b" | "both">("both");
  const [importing, setImporting] = useState(false);
  const candidate = useRef<{
    controller: GameController;
    unsubscribe: () => void;
  } | null>(null);
  const current = useRef<GameController | null>(null);
  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(() => render((value) => value + 1));
  }, [controller]);
  useEffect(
    () => () => {
      candidate.current?.unsubscribe();
      void candidate.current?.controller.dispose();
      void current.current?.dispose();
    },
    [],
  );
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (current.current && !current.current.finished) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  function cancelConnection() {
    candidate.current?.unsubscribe();
    void candidate.current?.controller.dispose();
    candidate.current = null;
    setBusy(false);
  }
  async function start(next: Setup) {
    cancelConnection();
    setSetup(next);
    setError("");
    setBusy(true);
    setScreen("setup");
    const fresh = new GameController({
      timeControl: next.timeControl,
      humanSide: resolveSide(next.side),
    });
    const activate = () => {
      if (candidate.current?.controller !== fresh) return;
      candidate.current.unsubscribe();
      candidate.current = null;
      void current.current?.dispose();
      current.current = fresh;
      setController(fresh);
      setGameSetup(next);
      setReviewPgn("");
      setBusy(false);
      setScreen("game");
      savePreference("chess-ui.setup", JSON.stringify(next));
    };
    const unsubscribe = fresh.subscribe(() => {
      if (fresh.snapshot?.state === "ready") activate();
      else if (
        fresh.snapshot?.state === "error" &&
        candidate.current?.controller === fresh
      ) {
        setError(fresh.snapshot.error);
        cancelConnection();
      }
    });
    candidate.current = { controller: fresh, unsubscribe };
    await fresh.start(
      next.opponent === "engine" ? connectDevelopmentEngine : undefined,
    );
    if (next.opponent === "human") activate();
  }
  function goSetup() {
    if (controller && !controller.finished) setConfirmLeave(true);
    else {
      setScreen("setup");
      setError("");
    }
  }
  function openReview() {
    if (!controller?.finished) return;
    setReviewPgn(controller.exportPgn());
    setReviewSide(controller.mode ? controller.humanSide : "both");
    setScreen("review");
  }
  function toggleEvaluation(view: "play" | "review", show: boolean) {
    savePreference(`chess-ui.evaluation.${view}`, String(show));
    (view === "play" ? setPlayEvaluation : setReviewEvaluation)(show);
  }
  const reviewAvailable = !!reviewPgn;
  return (
    <main className={`app ${screen === "setup" ? "setup-app" : "table-app"}`}>
      <header className="app-header">
        <button
          className="brand"
          onClick={goSetup}
          disabled={busy}
          aria-label="Accueil ShallowRed"
        >
          ♞ <span>ShallowRed</span>
        </button>
        {screen !== "setup" && (
          <nav aria-label="Navigation de la partie">
            {controller && (
              <button
                className="text-button"
                aria-current={screen === "game" ? "page" : undefined}
                onClick={() => setScreen("game")}
              >
                Partie
              </button>
            )}
            {reviewAvailable && (
              <button
                className="text-button"
                aria-current={screen === "review" ? "page" : undefined}
                onClick={() => setScreen("review")}
              >
                Analyse
              </button>
            )}
            <button className="text-button" onClick={goSetup}>
              Nouvelle partie
            </button>
            {(!controller || controller.finished) && (
              <button
                className="text-button"
                onClick={() => setImporting(true)}
              >
                Importer un PGN
              </button>
            )}
          </nav>
        )}
      </header>
      {screen === "setup" && (
        <>
          <GameSetup
            initial={setup}
            busy={busy}
            error={error}
            onStart={(next) => void start(next)}
            onCancel={cancelConnection}
            onReturn={
              controller?.finished ? () => setScreen("game") : undefined
            }
          />
          <div className="import-entry">
            <p>Déjà une partie à étudier ?</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setImporting(true)}
            >
              Importer un PGN
            </button>
            {reviewAvailable && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setScreen("review")}
              >
                Revenir à l’analyse
              </button>
            )}
          </div>
        </>
      )}
      {screen === "game" && controller && (
        <GameView
          controller={controller}
          showEvaluation={playEvaluation}
          onEvaluation={(show) => toggleEvaluation("play", show)}
          onNew={goSetup}
          onRematch={() => void start(gameSetup)}
          onReview={openReview}
        />
      )}
      {reviewAvailable && (
        <div hidden={screen !== "review"}>
          <Suspense
            fallback={
              <div className="review-loading-splash" role="status">
                <span className="analysis-spinner" aria-hidden="true" />
                Chargement de l’outil d’analyse…
              </div>
            }
          >
            <ReviewPanel
              key={`${reviewVersion}:${reviewPgn}`}
              pgn={reviewPgn}
              learnerSide={reviewSide}
              active={screen === "review"}
              showEvaluation={reviewEvaluation}
              onToggle={(show) => toggleEvaluation("review", show)}
            />
          </Suspense>
        </div>
      )}
      {confirmLeave && controller && (
        <Dialog
          title="Quitter cette partie ?"
          onClose={() => setConfirmLeave(false)}
        >
          <p>
            La partie sera terminée par abandon. La pendule continue tant que
            vous n’avez pas confirmé.
          </p>
          <div className="dialog-actions">
            <button
              className="danger-button"
              onClick={() => {
                controller.resign();
                setConfirmLeave(false);
                setScreen("setup");
              }}
            >
              Abandonner et revenir à l’accueil
            </button>
            <button
              className="secondary"
              onClick={() => setConfirmLeave(false)}
            >
              Rester dans la partie
            </button>
          </div>
        </Dialog>
      )}
      {importing && (
        <ImportPgnDialog
          onClose={() => setImporting(false)}
          onImport={(pgn) => {
            setReviewSide("both");
            setReviewPgn(pgn);
            setReviewVersion((value) => value + 1);
            setImporting(false);
            setScreen("review");
          }}
        />
      )}
    </main>
  );
}
