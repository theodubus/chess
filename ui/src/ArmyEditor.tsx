import { createElement, useState } from "react";
import type { PieceSymbol, Square } from "chess.js";
import Board from "./Board";
import Dialog from "./Dialog";
import {
  armyError,
  armyFen,
  armySquare,
  armiesFen,
  matchArmyError,
  defaultArmy,
  pieceNames,
  sameArmy,
  type Army,
  type Handicap,
  type MatchArmies,
} from "./handicap";
import type { Side } from "./engine/analysis";
const roles = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
export default function ArmyEditor({
  initial,
  humanSide,
  onSave,
  onClose,
  matchArmies,
  labels,
}: {
  initial: Handicap;
  humanSide: Side;
  onSave: (army: Handicap) => void;
  onClose: () => void;
  matchArmies?: MatchArmies;
  /**
   * Les mots de l'éditeur, quand la couleur ne nomme pas le camp : face au
   * moteur, « votre camp » et « le camp du moteur », avant un tirage au sort.
   */
  labels?: { title: string; intro: string; of: string };
}) {
  const [army, setArmy] = useState<Army>(() => ({
    ...(initial ?? defaultArmy()),
  }));
  const [tool, setTool] = useState<PieceSymbol | "erase" | "move">("erase");
  const [selected, setSelected] = useState<Square | null>(null);
  const [notice, setNotice] = useState("");
  const side = humanSide === "w" ? "b" : "w";
  const words = labels ?? (matchArmies
    ? {
        title: `Éditer le camp des ${side === "w" ? "Blancs" : "Noirs"}`,
        intro: `Le camp des ${humanSide === "w" ? "Blancs" : "Noirs"} est verrouillé.`,
        of: `des ${side === "w" ? "Blancs" : "Noirs"}`,
      }
    : {
        title: "Éditer le camp du moteur",
        intro: "Votre camp est verrouillé. La disposition suivra la couleur du moteur.",
        of: "du moteur",
      });
  const currentArmies = matchArmies ? { ...matchArmies, [side]: army } : null;
  const error = currentArmies ? matchArmyError(currentArmies) : armyError(army);
  const opponent = matchArmies?.[humanSide] ?? defaultArmy();
  const opposingSquares = new Set(Object.keys(opponent).map(square =>
    armySquare(square as Square, humanSide === "b" ? "w" : "b"),
  ));
  const color = humanSide === "w" ? "black" : "white";
  const files = humanSide === "w" ? "abcdefgh" : "hgfedcba";
  const ranks = humanSide === "w" ? "87654321" : "12345678";
  function edit(square: Square) {
    setNotice("");
    if (tool === "move" && !selected) {
      if (army[square]) setSelected(square);
      return;
    }
    const next = { ...army };
    const piece =
      tool === "move" ? army[selected!] : tool === "erase" ? null : tool;
    if (army[square] === "k" && piece !== "k") {
      setNotice(
        "Le roi doit rester sur le plateau. Utilisez Déplacer pour changer sa case.",
      );
      return;
    }
    if (tool === "move") {
      if (square === selected) {
        setSelected(null);
        return;
      }
      delete next[selected!];
    }
    if (piece === "p" && square[1] === "8") {
      setNotice("Un pion ne peut pas être placé sur la dernière rangée.");
      return;
    }
    if (piece === "k")
      for (const key of Object.keys(next))
        if (next[key as Square] === "k") delete next[key as Square];
    if (piece) next[square] = piece;
    else delete next[square];
    setArmy(next);
    setSelected(null);
  }
  return (
    <Dialog title={words.title} onClose={onClose}>
      <div className="army-editor">
        <p>
          Choisissez un outil, puis cliquez sur une case. {words.intro}
        </p>
        <div className="army-tools" aria-label="Outils de placement">
          {(["erase", "move"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={tool === value}
              onClick={() => {
                setTool(value);
                setSelected(null);
                setNotice("");
              }}
            >
              {value === "erase" ? "Retirer" : "Déplacer"}
            </button>
          ))}
          {(["p", "n", "b", "r", "q", "k"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-label={`Placer : ${pieceNames[value]}`}
              title={pieceNames[value]}
              aria-pressed={tool === value}
              onClick={() => {
                setTool(value);
                setSelected(null);
                setNotice("");
              }}
            >
              <span className="cg-wrap editor-piece" aria-hidden="true">
                {createElement("piece", {
                  className: `${color} ${roles[value]}`,
                })}
              </span>
            </button>
          ))}
        </div>
        <div className="army-board">
          <Board
            fen={currentArmies ? armiesFen(currentArmies) : armyFen(army, humanSide)}
            orientation={humanSide === "w" ? "white" : "black"}
            turn="white"
          >
            <div
              className="army-squares"
              aria-label={`Position de départ ${words.of}`}
            >
              {[...ranks].flatMap((rank) =>
                [...files].map((file) => {
                  const actual = `${file}${rank}` as Square;
                  const square = armySquare(actual, humanSide);
                  const locked = Number(square[1]) <= 2 || opposingSquares.has(actual);
                  return (
                    <button
                      type="button"
                      key={actual}
                      data-square={square}
                      disabled={locked}
                      aria-label={`${actual} : ${locked ? matchArmies ? "camp adverse, verrouillé" : "votre camp, verrouillé" : army[square] ? pieceNames[army[square]!] : "case vide"}`}
                      aria-pressed={selected === square}
                      onClick={() => edit(square)}
                    >
                      <span aria-hidden="true">{actual}</span>
                    </button>
                  );
                }),
              )}
            </div>
          </Board>
        </div>
        <p className="army-feedback" role="status">
          {notice ||
            error ||
            (selected
              ? "Choisissez la case de destination."
              : tool === "erase"
                ? `Cliquez sur les pièces ${words.of} à retirer.`
                : tool === "move"
                  ? `Choisissez une pièce ${words.of} à déplacer.`
                  : `Cliquez pour placer : ${pieceNames[tool].toLowerCase()}.`)}
        </p>
        <div className="army-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setArmy(defaultArmy());
              setSelected(null);
              setNotice("");
            }}
          >
            Réinitialiser
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!!error}
            onClick={() => onSave(sameArmy(army, defaultArmy()) ? null : army)}
          >
            Appliquer
          </button>
        </div>
      </div>
    </Dialog>
  );
}
