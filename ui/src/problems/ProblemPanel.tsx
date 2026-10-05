import { useEffect, useState } from "react";
import type { Color, Key } from "@lichess-org/chessground/types";
import Board from "../Board";
import Dialog from "../Dialog";
import MoveNavigation from "../MoveNavigation";
import { readPreference, savePreference } from "../preferences";
import { scoreLabel } from "../engine/analysis";
import { analysisEngineFactory } from "../engine/DevelopmentEngine";
import AnalysisEngineSelect from "../review/AnalysisEngineSelect";
import { isCompleteMateLine } from "../review/completeMateLine";
import { useMoveKeys } from "../useMoveKeys";
import type { ChessProblem } from "./importProblem";
import ProblemImportForm from "./ProblemImportForm";
import { ProblemStudy } from "./ProblemStudy";

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
  const [study] = useState(() => new ProblemStudy(problem));
  const [, render] = useState(0);
  const [engineId, setEngineId] = useState(() => readPreference("chess-ui.analysis-engine") || "default");
  const [budget, setBudget] = useState(3000);
  const [interrupted, setInterrupted] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Key; to: Key } | null>(null);
  const [moveError, setMoveError] = useState("");
  const [orientation, setOrientation] = useState<Color>(problem.position.turn === "w" ? "white" : "black");
  useEffect(() => {
    const unsubscribe = study.subscribe(() => render(value => value + 1));
    return () => { unsubscribe(); void study.stop(); };
  }, [study]);
  useEffect(() => {
    if (!active) {
      if (study.running) void study.stop();
      setPromotion(null);
    }
  }, [active, study]);
  const live = study.live, result = study.result, running = study.running;
  const line = study.line;
  const index = study.selected;
  const current = index ? line[index - 1] : null;
  const root = study.tree.board(0), board = study.board;
  const evaluation = study.tree.position(study.searchRoot);
  const score = result?.score ?? (running ? live.info?.score : null) ?? null;
  const mateReached = !!result && isCompleteMateLine(score, evaluation.turn, result.variation);
  const canReply = active && !promotion && study.canReply;
  function navigate(index: number) { setPromotion(null); setMoveError(""); study.select(index); }
  useMoveKeys(active && !promotion, index, line.length, navigate);
  function reset() { study.reset(); setInterrupted(false); setPromotion(null); setMoveError(""); }
  function solve() {
    setInterrupted(false); setMoveError("");
    savePreference("chess-ui.analysis-engine", engineId);
    void study.recalculate(analysisEngineFactory(engineId), budget);
  }
  function play(from: Key, to: Key, piece?: string) {
    if (!active || !study.canReply) return;
    const moves = board.moves({ verbose: true }).filter(move => move.from === from && move.to === to);
    if (!moves.length) return;
    if (!piece && moves.some(move => move.promotion)) { setPromotion({ from, to }); return; }
    setPromotion(null); setInterrupted(false); setMoveError("");
    void study.reply(from, to, piece, analysisEngineFactory(engineId), budget).catch(error => {
      setMoveError(error instanceof Error ? error.message : "Ce coup ne peut pas être joué.");
    });
  }
  return <div className="workspace problem-workspace">
    <div className="board-column">
      <div className="problem-board-heading">
        <p className="review-position">{current ? `${study.isVariant ? "Variante" : "Suite proposée"} · ${current.label}` : `${problem.source} · ${root.turn() === "w" ? "Blancs" : "Noirs"} au trait`}</p>
        <button className="icon-button" aria-label="Retourner l’échiquier" title="Retourner l’échiquier"
          onClick={() => setOrientation(value => value === "white" ? "black" : "white")}>↻</button>
      </div>
      <Board fen={board.fen()} turn={board.turn() === "w" ? "white" : "black"} orientation={orientation}
        check={board.isCheck()} lastMove={current ? [current.from as Key, current.to as Key] : []}
        destinations={canReply ? study.tree.destinations(study.node) : undefined}
        onMove={canReply ? (from, to) => play(from, to) : undefined}
        autoShapes={study.node === study.searchRoot && result?.bestMove ? [{orig: result.bestMove.slice(0, 2) as Key, dest: result.bestMove.slice(2, 4) as Key, brush: "blue"}] : []} />
      <MoveNavigation selected={index} total={line.length} onSelect={navigate} label="Parcourir la suite proposée" />
      <div className="problem-variation-actions">
        {study.canChangePrevious && <button className="secondary" disabled={running} onClick={() => navigate(index - 1)}>Changer cette réponse</button>}
        {study.isVariant && <button className="secondary" onClick={() => { setInterrupted(false); setPromotion(null); study.restoreSolution(); }}>Revenir à la solution</button>}
      </div>
      <p className="hint">{canReply ? `Réponse des ${board.turn() === "w" ? "Blancs" : "Noirs"} : jouez un autre coup sur le plateau. Le moteur reconstruira la suite.` : study.solution ? "Revenez avant une réponse adverse pour explorer un autre coup." : "Résolvez le problème pour explorer les réponses adverses."} Flèches ← → ou touches &lt; &gt; pour parcourir.</p>
      {moveError && <p role="alert" className="connection-error">{moveError}</p>}
      <details className="problem-fen"><summary>FEN de la position de départ</summary><code>{problem.position.fen}</code></details>
    </div>
    <aside className="setup-card problem-details">
      <h2>{problem.title}</h2>
      <AnalysisEngineSelect value={engineId} disabled={running} onChange={value => { reset(); setEngineId(value); }} />
      <label>Temps maximal de recherche
        <select aria-label="Temps maximal de recherche" value={budget} disabled={running} onChange={event => { reset(); setBudget(Number(event.target.value)); }}>
          <option value={1000}>1 seconde</option><option value={3000}>3 secondes</option>
          <option value={10000}>10 secondes</option><option value={30000}>30 secondes</option>
        </select>
      </label>
      <p className="hint">Le moteur peut terminer plus tôt dès qu’il trouve un mat.</p>
      {root.isGameOver() ? <p role="status">{root.isCheckmate() ? "Cette position est déjà un mat." : "Cette position est déjà nulle."} Aucun coup à chercher.</p> : <>
        {study.isVariant && <p className="problem-variant-label">Variante · {study.chosenReplies.length} {study.chosenReplies.length > 1 ? "réponses choisies" : "réponse choisie"}</p>}
        <button className="wide" disabled={!active || running} onClick={solve}>{study.isVariant ? "Recalculer cette variante" : result ? "Recalculer la solution" : "Résoudre avec le moteur"}</button>
        {running && <div className="problem-progress" role="status" aria-live="polite">
          <span className="analysis-spinner" aria-hidden="true" /><strong>{live.completingMate ? "Le moteur complète la suite jusqu’au mat…" : study.isVariant ? "Le moteur reconstruit la suite après votre réponse…" : "Le moteur cherche la solution…"}</strong>
          <button className="secondary" onClick={() => { setInterrupted(true); void study.stop(); }}>Arrêter</button>
        </div>}
        {interrupted && live.state === "idle" && <p role="status">Recherche interrompue. Vous pouvez la relancer.</p>}
        {live.state === "error" && <p className="connection-error" role="alert">{live.error} Vérifiez le moteur puis relancez.</p>}
        {(running || study.solution) && <div className="study-evaluation problem-result" aria-live="polite">
          <span>{study.isVariant ? `Évaluation après votre réponse · ${evaluation.label}` : "Évaluation de la position de départ"}</span><strong>{scoreLabel(score)}</strong>
          <span>Profondeur {result?.depth ?? live.info?.depth ?? "—"}</span>
          {result && <>
            <h3>{result.bestSan ? `${study.isVariant ? "Réponse conseillée" : "Premier coup conseillé"} : ${result.bestSan}` : score?.kind === "mate" ? "Cette variante se termine par un mat." : "Cette variante est nulle."}</h3>
            {!!result.bestMove && <>
              <p>{score?.kind === "mate" ? `Le moteur annonce un mat pour les ${score.winner === "w" ? "Blancs" : "Noirs"}.` : "Le moteur propose cette continuation. Aucun mat forcé n’est annoncé."}</p>
              {score?.kind === "mate" && <p className="hint">{mateReached ? "La suite affichée va jusqu’au mat." : "Le mat est annoncé, mais la suite jusqu’au mat n’a pas pu être complétée dans ce budget."}</p>}
            </>}
          </>}
          {!!line.length && <div className="study-line" aria-label={study.isVariant ? "Variante explorée" : "Suite proposée"}>
            <button className="secondary" aria-pressed={!index} onClick={() => navigate(0)}>Départ</button>
            {line.map((move, i) => <button key={i} className={`secondary${study.chosenReplies.includes(study.nodes[i]) ? " problem-chosen-reply" : ""}`} aria-pressed={index === i + 1} onClick={() => navigate(i + 1)}>
              {move.label}{study.chosenReplies.includes(study.nodes[i]) && <span className="problem-reply-tag">Votre réponse</span>}
            </button>)}
          </div>}
          {!!line.length && <p className="hint">Le moteur propose les deux camps après chaque réponse choisie. Vous pouvez modifier une autre réponse adverse.</p>}
        </div>}
      </>}
    </aside>
    {active && promotion && <Dialog title="Choisir la promotion" onClose={() => setPromotion(null)}>
      <div className="choice-row">{([["q", "Dame"], ["r", "Tour"], ["b", "Fou"], ["n", "Cavalier"]] as const).map(([piece, label]) =>
        <button key={piece} onClick={() => play(promotion.from, promotion.to, piece)}>{label}</button>,
      )}</div>
    </Dialog>}
  </div>;
}
