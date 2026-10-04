import { Chessground } from "@lichess-org/chessground";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Chess } from "chess.js";
import sample from "./amateurGames.json";
import { auditReview, type AuditDocument, type AuditGame } from "./auditModel";
import { adverseCategory } from "./PedagogicalAnalysis";
import type { GameReview } from "../GameReview";
import { categories } from "../annotations";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./preview.css";

const root = document.querySelector<HTMLElement>("#preview")!;
root.innerHTML = `<header><p class="eyebrow">Relecture · parties amateurs</p><h1>Que comprend-on du coup ?</h1>
<p class="intro">Trois parties choisies avant l'analyse. Les raisons confirmées et les coups inexpliqués restent visibles. Les mesures moteur ne constituent pas une validation pédagogique.</p></header>
<div class="pickers"><label>Partie <select id="game"></select></label><label>Moteur <select id="engine"></select></label>
<label>Coup <select id="move"></select></label><p id="state" role="status"></p></div>
<div class="workspace"><section class="visual" aria-label="Partie et démonstration"><div class="board-heading"><strong id="label"></strong><span id="mode"></span></div>
<div id="board" class="board"></div><div class="steps"><button id="previous" aria-label="Position précédente">←</button><span id="count"></span><button id="next" aria-label="Position suivante">→</button></div>
<p id="note" class="step-note" aria-live="polite"></p><button id="proof">Montrer la conséquence</button><button id="return" class="return">Retour au coup examiné</button></section>
<section class="explanation"><p id="kind" class="eyebrow"></p><h2 id="title"></h2><p id="summary"></p><aside id="context" class="context" hidden></aside>
<details><summary>Portée et mesure</summary><p id="limitation"></p><p id="provenance"></p></details>
<div class="review-question"><h3>À relire</h3><p>Le texte explique-t-il ce que ce coup permet ? La démonstration montre-t-elle seulement ce qui est nécessaire ? Le bilan inclut-il les reprises ? Pour un coup inexpliqué, quelle idée principale manque ?</p></div></section></div>
<footer id="snapshot"></footer>`;
const node = (id: string) => document.getElementById(id)!, text = (id: string, value: string) => { node(id).textContent = value; },
  select = (id: string) => node(id) as HTMLSelectElement, button = (id: string) => node(id) as HTMLButtonElement,
  gameSelect = select("game"), engineSelect = select("engine"), moveSelect = select("move"),
  board = Chessground(node("board"), { viewOnly: true, coordinates: true, animation: { enabled: false }, movable: { free: false }, drawable: { enabled: false, visible: true } });
let data: AuditDocument, game: AuditGame, review: GameReview, selected = 0, proofIndex: number | null = null;
const brushes = { threat: "red", idea: "green", observation: "blue" };
function render() {
  const decision = game.decisions.find((d) => d.index === selected - 1), consequence = decision?.consequence,
    position = review.positions[selected], step = proofIndex === null ? null : consequence?.steps[proofIndex];
  const fen = step?.fen ?? position.fen;
  board.set({ fen, orientation: "white", check: new Chess(fen).isCheck(),
    drawable: { autoShapes: (step?.marks ?? []).map((mark): DrawShape => ({ orig: mark.from as Key, dest: mark.to as Key | undefined, brush: brushes[mark.tone] })) } });
  text("label", step?.label ?? position.label); text("mode", step ? "Conséquence du coup examiné" : "Partie jouée");
  text("count", step ? `${proofIndex! + 1} / ${consequence!.steps.length}` : `${selected} / ${game.plies}`);
  text("note", step?.text ?? "← → ou < > parcourent la partie ; « Montrer la conséquence » ouvre seulement son court témoin.");
  button("previous").disabled = step ? proofIndex === 0 : selected === 0;
  button("next").disabled = step ? proofIndex === consequence!.steps.length - 1 : selected === game.plies;
  button("proof").hidden = !consequence || proofIndex !== null; button("return").hidden = proofIndex === null;
  text("kind", selected ? `Coup joué : ${position.label}` : "Position initiale");
  text("state", decision ? consequence ? "Conséquence confirmée · à relire" : decision.status === "unavailable" ? "Calcul indisponible · aucun récit inventé" : "Cause non confirmée · abstention" : "Parcours de la partie");
  text("title", consequence?.title ?? (decision ? "La raison courte reste inconnue" : "Coup de la partie"));
  const annotation = review.annotations[selected - 1];
  text("summary", consequence?.summary ?? (decision ? "Le moteur classe ce coup défavorablement, mais ces contrôles n'établissent pas une raison courte. Ce cas reste à expliquer."
    : annotation ? `${categories[annotation.category].label}. Ce contrôle porte sur les coups défavorables ; aucun classement global n'est déduit d'un seul motif.` : "Aucun coup à expliquer à cette position."));
  node("context").hidden = !consequence?.context; text("context", consequence?.context ?? "");
  text("limitation", consequence?.limitation ?? decision?.error ?? "Pas de démonstration causale pour ce coup.");
  text("provenance", `${game.engineName}, mesure du ${new Date(game.capturedAt).toLocaleString("fr-FR")}. ${decision ? `${(decision.elapsedMs / 1000).toFixed(1)} s pour ce contrôle. ` : ""}Binaire SHA-256 : ${game.engineHash}. Partie : ${game.source}`);
  moveSelect.value = String(selected);
}
function choose() {
  game = data.games.find((g) => g.id === gameSelect.value && g.engine === engineSelect.value)!;
  const source = sample.games.find((g) => g.id === game?.id);
  if (!game || !source) throw new Error("Partie absente pour ce moteur.");
  review = auditReview(game, source.pgn); selected = 0; proofIndex = null; moveSelect.replaceChildren();
  review.positions.forEach((p, index) => {
    const verdict = review.annotations[index - 1];
    moveSelect.add(new Option(`${p.label}${verdict ? ` · ${categories[verdict.category].label}` : ""}${adverseCategory(verdict?.category) ? " · à examiner" : ""}`, String(index)));
  }); render();
}
function go(delta: number) {
  if (proofIndex !== null) { const steps = game.decisions.find((d) => d.index === selected - 1)!.consequence!.steps; proofIndex = Math.max(0, Math.min(steps.length - 1, proofIndex + delta)); }
  else selected = Math.max(0, Math.min(game.plies, selected + delta));
  render();
}
button("previous").onclick = () => go(-1); button("next").onclick = () => go(1);
button("proof").onclick = () => { proofIndex = 1; render(); };
button("return").onclick = () => { proofIndex = null; render(); };
moveSelect.onchange = () => { selected = Number(moveSelect.value); proofIndex = null; render(); };
gameSelect.onchange = engineSelect.onchange = choose;
document.addEventListener("keydown", (event) => {
  if (!review || event.target instanceof HTMLSelectElement) return;
  if (["ArrowLeft", "<", "ArrowRight", ">"].includes(event.key)) { event.preventDefault(); go(["ArrowLeft", "<"].includes(event.key) ? -1 : 1); }
});
try {
  const selectedSample = new URLSearchParams(location.search).get("sample");
  const path = selectedSample === "exposure" ? "/dev/pedagogy-audit-exposure-data.json" : selectedSample === "ignored" ? "/dev/pedagogy-audit-ignored-data.json" : "/dev/pedagogy-audit-data.json";
  const response = await fetch(path);
  if (!response.ok) throw new Error("Lancer npm run pedagogy:audit avant la relecture.");
  data = await response.json() as AuditDocument;
  if (data.schema !== 1 || data.independentSemanticValidation !== false || !data.games.length || data.games.some((g) => !g.complete)) throw new Error("Audit absent ou incomplet.");
  for (const id of new Set(data.games.map((g) => g.id))) gameSelect.add(new Option(id, id));
  for (const engine of new Set(data.games.map((g) => g.engine))) engineSelect.add(new Option(engine, engine));
  text("snapshot", "202 demi-coups issus de trois parties. Toutes les abstentions sont conservées. Relecture échiquéenne et contrôle visuel encore nécessaires.");
  choose();
} catch (error) { board.destroy(); root.textContent = error instanceof Error ? error.message : "Audit illisible."; }
