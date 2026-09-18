import { useRef, useState } from "react";
import Dialog from "./Dialog";
import { importPgn, MAX_PGN_BYTES } from "./importPgn";

export default function ImportPgnDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (pgn: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const fileRead = useRef(0);
  return (
    <Dialog title="Importer une partie PGN" onClose={onClose}>
      <form
        className="import-pgn"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onImport(importPgn(text));
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Import impossible.",
            );
          }
        }}
      >
        <p>
          Collez une partie ou ouvrez un fichier .pgn pour l’analyser. Les
          commentaires et variantes sont acceptés ; l’analyse porte sur la ligne
          principale.
        </p>
        <label>
          Fichier PGN
          <input
            type="file"
            accept=".pgn,text/plain,application/x-chess-pgn"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const version = ++fileRead.current;
              setError("");
              if (file.size > MAX_PGN_BYTES) {
                setReading(false);
                setError("Le PGN est trop volumineux (maximum 1 Mo).");
                return;
              }
              setReading(true);
              try {
                const value = await file.text();
                if (version === fileRead.current) setText(value);
              } catch {
                if (version === fileRead.current)
                  setError("Impossible de lire ce fichier.");
              } finally {
                if (version === fileRead.current) setReading(false);
              }
            }}
          />
        </label>
        <label>
          Texte PGN
          <textarea
            rows={9}
            value={text}
            disabled={reading}
            spellCheck={false}
            placeholder={
              '[White "Blancs"]\n[Black "Noirs"]\n\n1. e4 e5 2. Nf3 Nc6 *'
            }
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && (
          <p className="connection-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="wide"
          disabled={reading || !text.trim()}
          type="submit"
        >
          {reading ? "Lecture du fichier…" : "Importer et analyser"}
        </button>
        <p className="hint">
          Une partie à la fois, jusqu’à 1 Mo. La partie importée reste en
          mémoire dans cet onglet.
        </p>
      </form>
    </Dialog>
  );
}
