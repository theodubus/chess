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
}: {
  initial: Handicap;
  humanSide: Side;
  onSave: (army: Handicap) => void;
  onClose: () => void;
  matchArmies?: MatchArmies;
}) {
  const [army, setArmy] = useState<Army>(() => ({
    ...(initial ?? defaultArmy()),
  }));
  const [tool, setTool] = useState<PieceSymbol | "erase" | "move">("erase");
  const [selected, setSelected] = useState<Square | null>(null);
  const [notice, setNotice] = useState("");
  const side = humanSide === "w" ? "b" : "w";
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
    <Dialog title={matchArmies ? `Éditer le camp des ${side === "w" ? "Blancs" : "Noirs"}` : "Éditer le camp du moteur"} onClose={onClose}>
      <div className="army-editor">
        <p>
          Choisissez un outil, puis cliquez sur une case.{" "}
          {matchArmies
            ? `Le camp des ${humanSide === "w" ? "Blancs" : "Noirs"} est verrouillé.`
            : "Votre camp est verrouillé. La disposition suivra la couleur du moteur."}
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
              aria-label={matchArmies ? `Position de départ des ${side === "w" ? "Blancs" : "Noirs"}` : "Position de départ du moteur"}
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
                ? "Cliquez sur les pièces du moteur à retirer."
                : tool === "move"
                  ? "Choisissez une pièce du moteur à déplacer."
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
