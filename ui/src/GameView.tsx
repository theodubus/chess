import { Chess } from "chess.js";
import MoveNavigation from "./MoveNavigation";
import { useMoveKeys } from "./useMoveKeys";
import { readPreference, savePreference } from "./preferences";
import { frenchSan } from "./review/model";
import { useEffect, useRef, useState } from "react";
import type { Color } from "@lichess-org/chessground/types";
import type { GameController } from "./GameController";
import { formatTime } from "./GameClock";
import Board from "./Board";
import EvaluationBar from "./EvaluationBar";
import GameHistory from "./GameHistory";
import Dialog from "./Dialog";
import { downloadPgn } from "./pgn";
import { scoreLabel, type Side } from "./engine/analysis";
import type { Promotion } from "./game";

function Player({
  controller,
  color,
  showDepth,
}: {
  controller: GameController;
  color: Side;
  showDepth: boolean;
}) {
  const [, render] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      controller.tick();
      render((value) => value + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [controller]);
  const engine = controller.mode && color !== controller.humanSide;
  const running = controller.clock.runningColor === color;
  return (
    <div className={`player ${running ? "active" : ""}`}>
      <span className="player-piece" aria-hidden="true">
        {color === "w" ? "♔" : "♚"}
      </span>
      <div className="player-name">
        <strong>
          {engine
            ? controller.snapshot?.name || "Moteur local"
            : controller.mode
              ? "Vous"
              : color === "w"
                ? "Blancs"
                : "Noirs"}
        </strong>
        <small>
          {controller.mode
            ? color === "w"
              ? "Blancs"
              : "Noirs"
            : "Joueur local"}
          {engine && showDepth && controller.snapshot?.analysis?.depth != null
            ? ` · Profondeur ${controller.snapshot.analysis.depth}`
            : ""}
        </small>
      </div>
      <div
        className={`clock ${running ? "running" : ""} ${controller.clock.remaining[color] < 20000 ? "low-time" : ""}`}
        aria-label={`Temps des ${color === "w" ? "blancs" : "noirs"}`}
      >
        {formatTime(controller.clock.remaining[color])}
      </div>
    </div>
  );
}
export default function GameView({
  controller,
  showEvaluation,
  onEvaluation,
  onNew,
  onRematch,
  onReview,
}: {
  controller: GameController;
  showEvaluation: boolean;
  onEvaluation: (show: boolean) => void;
  onNew: () => void;
  onRematch: () => void;
  onReview: () => void;
}) {
  const [orientation, setOrientation] = useState<Color>(
    controller.mode && controller.humanSide === "b" ? "black" : "white",
  );
  const [options, setOptions] = useState(false);
  const [resign, setResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const resultButton = useRef<HTMLButtonElement>(null);
  const [movesOpen, setMovesOpen] = useState(false);
  const [showDepth, setShowDepth] = useState(
    () => readPreference("chess-ui.depth.play") === "true",
  );
  const [cursor, setCursor] = useState<number | null>(null);
  const game = controller.game;
  const moves = game.chess.history({ verbose: true });
  const selected =
    cursor === null ? moves.length : Math.min(cursor, moves.length);
  const browsing = selected < moves.length;
  const last = selected > 0 ? moves[selected - 1] : undefined;
  const board = browsing
    ? new Chess(last?.after ?? moves[0].before)
    : game.chess;
  function navigate(index: number) {
    if (controller.finished) setResultDismissed(true);
    setCursor(index >= moves.length ? null : Math.max(0, index));
  }
  useMoveKeys(!game.pending, selected, moves.length, navigate);
  const score = controller.snapshot?.analysis?.score ?? null;
  const evaluation = Boolean(controller.mode && showEvaluation && !browsing);
  const status = controller.finished
    ? controller.status
    : controller.snapshot?.state === "error"
      ? "Partie suspendue · Moteur indisponible"
      : controller.snapshot?.state === "connecting"
        ? "Reconnexion au moteur…"
        : controller.snapshot?.state === "thinking"
          ? "Le moteur réfléchit…"
          : game.status;
  const side = controller.mode ? controller.humanSide : game.chess.turn();
  return (
    <section
      className={`workspace play-workspace ${movesOpen ? "with-history" : ""}`}
      aria-label="Partie en cours"
    >
      <div className="board-column">
        <div className="play-status">
          <div className="status" role="status">
            {status}
          </div>
          <span className="cadence">
            {controller.clock.control.initialMs / 60000} +{" "}
            {controller.clock.control.incrementMs / 1000}
          </span>
        </div>
        <Player
          controller={controller}
          showDepth={showDepth && !browsing}
          color={orientation === "white" ? "b" : "w"}
        />
        <div
          className={`board-with-evaluation ${evaluation ? "show-evaluation" : ""}`}
        >
          {evaluation && (
            <EvaluationBar score={score} orientation={orientation} />
          )}
          <Board
            fen={board.fen()}
            orientation={orientation}
            turn={board.turn() === "w" ? "white" : "black"}
            check={board.isCheck()}
            lastMove={last ? [last.from, last.to] : []}
            destinations={
              !browsing && controller.canMove ? game.destinations() : new Map()
            }
            onMove={
              browsing
                ? undefined
                : (from, to) => {
                    controller.move(from, to);
                  }
            }
          >
            {controller.finished && !browsing && !resultDismissed && (
              <div className="board-result">
                <section
                  className="result-actions"
                  aria-labelledby="game-result-title"
                >
                  <button
                    className="result-close text-button"
                    aria-label="Masquer le résultat"
                    onClick={() => {
                      setResultDismissed(true);
                      resultButton.current?.focus();
                    }}
                  >
                    ×
                  </button>
                  <h2 id="game-result-title">Partie terminée</h2>
                  <p>{controller.status}</p>
                  <strong className="result-score">
                    {controller.outcome?.result === "*"
                      ? "Temps écoulé"
                      : controller.outcome?.result}
                  </strong>
                  <button onClick={onReview}>Analyser la partie</button>
                  <div className="choice-row">
                    <button className="secondary" onClick={onRematch}>
                      Rejouer
                    </button>
                    <button className="secondary" onClick={onNew}>
                      Nouvelle partie
                    </button>
                  </div>
                </section>
              </div>
            )}
          </Board>
        </div>
        <Player
          controller={controller}
          showDepth={showDepth && !browsing}
          color={orientation === "white" ? "w" : "b"}
        />
        {browsing && (
          <div className="replay-notice" role="status">
            <span>
              Relecture · {last ? frenchSan(last.san) : "Position initiale"}
              {!controller.finished ? " · La pendule continue" : ""}
            </span>
            <button
              className="text-button"
              onClick={() => navigate(moves.length)}
            >
              Revenir à la partie
            </button>
          </div>
        )}
        <div className="play-controls">
          <MoveNavigation
            selected={selected}
            total={moves.length}
            onSelect={navigate}
          />
          <div className="board-toolbar">
            <button className="secondary" onClick={() => setOptions(true)}>
              Options
            </button>
            <button
              className="secondary"
              aria-expanded={movesOpen}
              onClick={() => setMovesOpen(!movesOpen)}
            >
              Coups{" "}
              {game.chess.history().length
                ? `(${game.chess.history().length})`
                : ""}
            </button>
            {controller.finished && (
              <button
                ref={resultButton}
                className="secondary"
                onClick={() => {
                  navigate(moves.length);
                  setResultDismissed(false);
                }}
              >
                Résultat
              </button>
            )}
            {!controller.finished && (
              <button
                className="text-button danger"
                onClick={() => setResign(true)}
              >
                Abandonner
              </button>
            )}
          </div>
        </div>
        {evaluation && score && (
          <p className="live-score">
            Dernière évaluation · {scoreLabel(score)}
          </p>
        )}
        {controller.snapshot?.state === "error" && !controller.finished && (
          <div className="connection-error">
            <p>{controller.snapshot.error}</p>
            <button onClick={() => void controller.reconnect()}>
              Reconnecter
            </button>
          </div>
        )}
      </div>
      <aside
        className="game-sidebar"
        hidden={!movesOpen}
        aria-label="Coups de la partie"
      >
        <GameHistory
          controller={controller}
          visible={movesOpen}
          selected={selected}
          onSelect={navigate}
        />
      </aside>
      {options && (
        <Dialog title="Options de la partie" onClose={() => setOptions(false)}>
          <div className="dialog-actions">
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
            {controller.mode && (
              <label className="evaluation-toggle">
                <input
                  type="checkbox"
                  checked={showEvaluation}
                  onChange={(event) => onEvaluation(event.target.checked)}
                />
                Afficher l’évaluation pendant le jeu
              </label>
            )}
            {controller.mode && (
              <label className="depth-toggle">
                <input
                  type="checkbox"
                  checked={showDepth}
                  onChange={(event) => {
                    setShowDepth(event.target.checked);
                    savePreference(
                      "chess-ui.depth.play",
                      String(event.target.checked),
                    );
                  }}
                />
                Afficher la profondeur pendant le jeu
              </label>
            )}
            <button
              className="secondary"
              onClick={() => downloadPgn(controller)}
            >
              Exporter PGN
            </button>
            <button
              className="secondary"
              onClick={() => {
                setOptions(false);
                onNew();
              }}
            >
              Nouvelle partie
            </button>
            {import.meta.env.DEV && (
              <details>
                <summary>Diagnostics du moteur</summary>
                <pre>
                  {controller.snapshot?.log
                    .map(
                      (entry) =>
                        `${entry.direction === "out" ? "→" : "←"} ${entry.line}`,
                    )
                    .join("\n") || "Aucune connexion moteur."}
                </pre>
              </details>
            )}
          </div>
        </Dialog>
      )}
      {resign && !controller.finished && (
        <Dialog
          title={`Abandonner avec les ${side === "w" ? "Blancs" : "Noirs"} ?`}
          onClose={() => setResign(false)}
        >
          <p>
            L’autre camp remporte la partie. Vous pourrez ensuite l’analyser.
          </p>
          <div className="dialog-actions">
            <button
              className="danger-button"
              onClick={() => {
                controller.resign();
                setResign(false);
              }}
            >
              Confirmer l’abandon
            </button>
            <button className="secondary" onClick={() => setResign(false)}>
              Continuer la partie
            </button>
          </div>
        </Dialog>
      )}
      {game.pending && (
        <Dialog
          title="Promouvoir le pion"
          onClose={() => controller.cancelPromotion()}
        >
          <div className="promotion-choices">
            {(
              [
                ["q", "Dame"],
                ["r", "Tour"],
                ["b", "Fou"],
                ["n", "Cavalier"],
              ] as [Promotion, string][]
            ).map(([piece, name]) => (
              <button key={piece} onClick={() => controller.promote(piece)}>
                {name}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </section>
  );
}
