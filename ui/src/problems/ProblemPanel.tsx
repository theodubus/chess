import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import type { Color, Key } from "@lichess-org/chessground/types";
import Board from "../Board";
import Dialog from "../Dialog";
import MoveNavigation from "../MoveNavigation";
import { readPreference, savePreference } from "../preferences";
import { scoreLabel } from "../engine/analysis";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import AnalysisEngineSelect from "../review/AnalysisEngineSelect";
import { LiveStudy } from "../review/LiveStudy";
import { boardFromCommand } from "../review/StudyTree";
import { legalVariation } from "../review/model";
import { useMoveKeys } from "../useMoveKeys";
import type { ChessProblem } from "./importProblem";
import ProblemImportForm from "./ProblemImportForm";

export default function ProblemPanel({ active }: { active: boolean }) {
  const [problem, setProblem] = useState<ChessProblem | null>(null);
  const [version, setVersion] = useState(0);
  const [importing, setImporting] = useState(false);
  function load(next: ChessProblem) {
    setProblem(next); setVersion(value => value + 1); setImporting(false);
  }
  return <section className="problem-panel" aria-label="Résoudre un problème d’échecs">
    <div className="problem-heading">
      <div><h1>Problèmes</h1><p>Chargez une position et laissez le moteur chercher.</p></div>
      {problem && <button className="secondary" onClick={() => setImporting(true)}>Charger un autre problème</button>}
    </div>
    {problem ? <ProblemWorkspace key={version} problem={problem} active={active} /> :
      <div className="setup-card problem-loader"><ProblemImportForm onLoad={load} /></div>}
    {importing && <Dialog title="Charger un problème" onClose={() => setImporting(false)}><ProblemImportForm onLoad={load} /></Dialog>}
  </section>;
}

function ProblemWorkspace({ problem, active }: { problem: ChessProblem; active: boolean }) {
  const [study] = useState(() => new LiveStudy());
  const [, render] = useState(0);
  const [engineId, setEngineId] = useState(() => readPreference("chess-ui.analysis-engine") || "default");
  const [budget, setBudget] = useState(3000);
  const [step, setStep] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const [orientation, setOrientation] = useState<Color>(problem.position.turn === "w" ? "white" : "black");
  useEffect(() => {
    const unsubscribe = study.subscribe(() => render(value => value + 1));
    return () => { unsubscribe(); void study.stop(); };
  }, [study]);
  useEffect(() => {
    if (!active && study.state === "running") void study.stop();
  }, [active, study]);
  const matching = study.command === problem.position.command;
  const result = matching && study.state === "complete" ? study.result : null;
  const running = matching && study.state === "running";
  const line = result?.variation.length
    ? result.variation
    : result?.bestMove ? legalVariation(problem.position.fen, [result.bestMove]) : [];
  const index = Math.min(step, line.length);
  const current = index ? line[index - 1] : null;
  const root = boardFromCommand(problem.position.command);
  const board = current ? new Chess(current.fen) : root;
  const score = result?.score ?? (running ? study.info?.score : null) ?? null;
  useMoveKeys(active, index, line.length, setStep);
  function reset() { void study.stop(); setStep(0); setInterrupted(false); }
  function solve() {
    setStep(0); setInterrupted(false);
    savePreference("chess-ui.analysis-engine", engineId);
    void study.analyse(problem.position.command, analysisEngineFactory(engineId), budget);
  }
  return <div className="workspace problem-workspace">
    <div className="board-column">
      <div className="problem-board-heading">
        <p className="review-position">{current ? `Suite proposée · ${current.label}` : `${problem.source} · ${root.turn() === "w" ? "Blancs" : "Noirs"} au trait`}</p>
        <button className="icon-button" aria-label="Retourner l’échiquier" title="Retourner l’échiquier"
          onClick={() => setOrientation(value => value === "white" ? "black" : "white")}>↻</button>
      </div>
      <Board fen={board.fen()} turn={board.turn() === "w" ? "white" : "black"} orientation={orientation}
        check={board.isCheck()} lastMove={current ? [current.from as Key, current.to as Key] : []}
        autoShapes={!index && result?.bestMove ? [{orig: result.bestMove.slice(0, 2) as Key, dest: result.bestMove.slice(2, 4) as Key, brush: "blue"}] : []} />
      <MoveNavigation selected={index} total={line.length} onSelect={setStep} label="Parcourir la suite proposée" />
      <p className="hint">{index ? "Vous examinez la suite proposée par le moteur." : "Position de départ du problème."} Flèches ← → ou touches &lt; &gt; pour parcourir.</p>
      <details className="problem-fen"><summary>FEN de la position de départ</summary><code>{problem.position.fen}</code></details>
    </div>
    <aside className="setup-card problem-details">
      <h2>{problem.title}</h2>
      <AnalysisEngineSelect value={engineId} disabled={running} onChange={value => { reset(); setEngineId(value); }} />
      <label>Temps de recherche
        <select aria-label="Temps de recherche" value={budget} disabled={running} onChange={event => { reset(); setBudget(Number(event.target.value)); }}>
          <option value={1000}>1 seconde</option><option value={3000}>3 secondes</option>
          <option value={10000}>10 secondes</option><option value={30000}>30 secondes</option>
        </select>
      </label>
      {root.isGameOver() ? <p role="status">{root.isCheckmate() ? "Cette position est déjà un mat." : "Cette position est déjà nulle."} Aucun coup à chercher.</p> : <>
        <button className="wide" disabled={!active || running} onClick={solve}>{result ? "Recalculer la solution" : "Résoudre avec le moteur"}</button>
        {running && <div className="problem-progress" role="status" aria-live="polite">
          <span className="analysis-spinner" aria-hidden="true" /><strong>Le moteur cherche la solution…</strong>
          <button className="secondary" onClick={() => { setInterrupted(true); void study.stop(); }}>Arrêter</button>
        </div>}
        {interrupted && study.state === "idle" && <p role="status">Recherche interrompue. Vous pouvez la relancer.</p>}
        {study.state === "error" && <p className="connection-error" role="alert">{study.error} Vérifiez le moteur puis relancez.</p>}
        {(running || result) && <div className="study-evaluation problem-result" aria-live="polite">
          <span>Évaluation de la position de départ</span><strong>{scoreLabel(score)}</strong>
          <span>Profondeur {result?.depth ?? study.info?.depth ?? "—"}</span>
          {result && <>
            <h3>Premier coup conseillé : {result.bestSan}</h3>
            <p>{score?.kind === "mate" ? `Le moteur annonce un mat pour les ${score.winner === "w" ? "Blancs" : "Noirs"}.` : "Le moteur propose cette continuation. Aucun mat forcé n’est annoncé."}</p>
            <div className="study-line" aria-label="Suite proposée">
              <button className="secondary" aria-pressed={!index} onClick={() => setStep(0)}>Départ</button>
              {line.map((move, i) => <button key={i} className="secondary" aria-pressed={index === i + 1} onClick={() => setStep(i + 1)}>{move.label}</button>)}
            </div>
            <p className="hint">Cette suite est une proposition du moteur au temps choisi ; elle peut être incomplète et ne démontre pas toutes les réponses possibles.</p>
          </>}
        </div>}
      </>}
    </aside>
  </div>;
}
