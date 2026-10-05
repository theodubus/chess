import { useRef, useState } from "react";
import { MAX_PGN_BYTES } from "../importPgn";
import { importProblem, isFenSource, type ChessProblem, type ProblemPoint } from "./importProblem";

export default function ProblemImportForm({ onLoad }: { onLoad: (problem: ChessProblem) => void }) {
  const [text, setText] = useState("");
  const [point, setPoint] = useState<ProblemPoint>("initial");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const fileRead = useRef(0);
  return (
    <form className="import-pgn problem-import" onSubmit={event => {
      event.preventDefault();
      try { onLoad(importProblem(text, point)); }
      catch (error) { setError(error instanceof Error ? error.message : "Import impossible."); }
    }}>
      <p>Collez une position FEN ou ouvrez un fichier .fen ou .pgn. Le camp au trait est celui que le moteur fera jouer.</p>
      <label>
        Fichier du problème
        <input type="file" accept=".fen,.pgn,text/plain,application/x-chess-pgn" onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          const version = ++fileRead.current;
          setError("");
          if (file.size > MAX_PGN_BYTES) {
            setReading(false); setError("Le problème est trop volumineux (maximum 1 Mo)."); return;
          }
          setReading(true);
          try {
            const value = await file.text();
            if (version === fileRead.current) setText(value);
          } catch {
            if (version === fileRead.current) setError("Impossible de lire ce fichier.");
          } finally {
            if (version === fileRead.current) setReading(false);
          }
        }} />
      </label>
      <label>
        Position FEN ou PGN
        <textarea rows={6} value={text} disabled={reading} spellCheck={false} aria-label="Position FEN ou PGN"
          placeholder="Collez ici la FEN ou le PGN de votre problème"
          onChange={event => { setText(event.target.value); setError(""); }} />
      </label>
      {!!text.trim() && !isFenSource(text) && <label>
        Position du PGN à utiliser
        <select aria-label="Position du PGN à utiliser" value={point} onChange={event => { setPoint(event.target.value as ProblemPoint); setError(""); }}>
          <option value="initial">Position initiale · avant la solution éventuelle</option>
          <option value="final">Dernière position · après les coups du PGN</option>
        </select>
      </label>}
      {error && <p className="connection-error" role="alert">{error}</p>}
      <button type="submit" className="wide" disabled={reading || !text.trim()}>
        {reading ? "Lecture du fichier…" : "Charger la position"}
      </button>
      <p className="hint">Un problème à la fois, jusqu’à 1 Mo. Le calcul démarre quand vous le demandez.</p>
    </form>
  );
}
