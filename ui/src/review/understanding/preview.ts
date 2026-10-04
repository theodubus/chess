import { Chessground } from "@lichess-org/chessground";
import type { Key } from "@lichess-org/chessground/types";
import type { DrawShape } from "@lichess-org/chessground/draw";
import { Chess } from "chess.js";
import type { ExplanationStep } from "./draftModel";
import type { PreviewDocument, PreviewExample } from "./previewModel";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./preview.css";

const root = document.querySelector<HTMLElement>("#preview")!;
root.innerHTML = `
  <header><p class="eyebrow">Aperçu de relecture · non activé dans la partie</p>
    <h1>Comprendre le coup</h1>
    <p class="intro">Ces exemples servent à juger le texte et les repères. Les positions viennent de recherches réelles ; les motifs restent des brouillons, pas une analyse validée.</p>
  </header>
  <div class="pickers">
    <label>Exemple <select id="case"></select></label>
    <label>Moteur <select id="engine"></select></label>
    <p id="state" role="status"></p>
  </div>
  <div class="workspace">
    <section class="visual" aria-label="Démonstration">
      <div class="board-heading"><strong id="position-label"></strong><span id="origin"></span></div>
      <div id="board" class="board"></div>
      <div class="branches" role="group" aria-label="Position à examiner">
        <button id="played" type="button">Coup joué</button><button id="alternative" type="button">Autre coup comparé</button>
      </div>
      <div class="steps"><button id="previous" type="button" aria-label="Étape précédente">←</button>
        <span id="step-count"></span><button id="next" type="button" aria-label="Étape suivante">→</button></div>
      <p id="step-note" class="step-note" aria-live="polite"></p>
      <button id="return" type="button" class="return">Revenir au coup joué</button>
    </section>
    <section class="explanation" aria-label="Explication à relire">
      <p id="kind" class="eyebrow"></p><h2 id="title"></h2><p id="summary"></p>
      <p class="comparison-note">Ce repère explique une conséquence du coup. Une seule comparaison ne prouve pas que le coup joué était le meilleur, ni qu'un autre choix était le seul bon coup.</p>
      <aside id="context" class="context" hidden></aside>
      <div id="comparison"><h3 id="comparison-heading"></h3><p id="comparison-text"></p><p class="comparison-note">Ce choix sert à comparer l’idée : ce n’est pas forcément le meilleur coup du moteur.</p></div>
      <details><summary>Portée de cette démonstration</summary><p id="limitation"></p><p id="provenance"></p></details>
      <div class="review-question"><h3>À relire</h3><p>Est-ce qu’on comprend la conséquence du coup joué, comment l’adversaire l’exploite et le bilan de l’échange ? S’il y a une comparaison, éclaire-t-elle ce mécanisme sans prétendre désigner le seul bon coup ?</p></div>
    </section>
  </div>
  <footer id="snapshot"></footer>`;
const node = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => node<HTMLButtonElement>(id);
const setText = (id: string, text: string) => { node(id).textContent = text; };
const caseSelect = node<HTMLSelectElement>("case"), engineSelect = node<HTMLSelectElement>("engine");
const names: Record<string, string> = {
  "pin-retreat": "Clouage · retraite supprimée", "fork-direct": "Fourchette · roi et tour",
  "fork-black": "Fourchette · camp noir", "byrne-22": "Échange d’un défenseur · …Ca4",
  "allows-fork": "Mauvais coup · fourchette permise", "allows-fork-other-defence": "Même mauvais coup · autre défense",
  "allows-fork-white": "Mauvais coup blanc · fourchette permise",
  "allows-fork-false-defence": "Mauvais coup · comparaison écartée",
  "allows-fork-direct": "Mauvais coup · conséquence sans alternative",
  "byrne-allows-fork": "Menace permise · Fg5", "morphy-31": "Déviation · mat court",
};
const origins: Record<ExplanationStep["origin"], string> = {
  position: "Après la décision", "engine-line": "Suite calculée", "conditional-move": "Hypothèse de comparaison", rules: "Mat vérifié par les règles",
};
const brushes = { threat: "red", idea: "green", observation: "blue" };
const board = Chessground(node("board"), { viewOnly: true, coordinates: true,
  animation: { enabled: false }, movable: { free: false, color: undefined },
  drawable: { enabled: false, visible: true }, highlight: { lastMove: false, check: true } });
let data: PreviewDocument, example: PreviewExample, branch: "played" | "alternative" = "played", index = 0;

function renderPosition() {
  const draft = example.draft, steps = draft?.[branch], step = steps?.[index];
  board.set({ fen: step?.fen ?? example.afterFen, orientation: new Chess(example.beforeFen).turn() === "w" ? "white" : "black",
    check: new Chess(step?.fen ?? example.afterFen).isCheck(),
    drawable: { autoShapes: (step?.marks ?? []).map((m): DrawShape => ({ orig: m.from as Key, dest: m.to as Key | undefined, brush: brushes[m.tone] })) } });
  setText("position-label", step?.label ?? `Après ${example.label}`);
  setText("origin", step ? (branch === "alternative" && index === 0 ? "Autre choix légal" : origins[step.origin]) : "Position de la partie");
  node("origin").className = step?.origin === "conditional-move" ? "conditional" : "";
  setText("step-count", steps ? `${index + 1} / ${steps.length}` : "Position étudiée");
  setText("step-note", step?.note || (draft ? (index === 0 ? "Le repère part après la décision, sans la rejouer." : "Réponse intermédiaire de la variante calculée.") : "Aucun récit causal proposé pour cette recherche."));
  button("previous").disabled = !steps || index === 0;
  button("next").disabled = !steps || index === steps.length - 1;
  button("played").setAttribute("aria-pressed", String(branch === "played"));
  button("alternative").setAttribute("aria-pressed", String(branch === "alternative"));
  button("alternative").hidden = !draft?.alternative.length;
  button("alternative").disabled = !draft?.alternative.length;
  button("return").hidden = branch === "played" && index === 0;
}
function renderExample() {
  example = data.examples.find((e) => e.id === caseSelect.value && e.engine === engineSelect.value)!;
  if (!example) throw new Error("Exemple absent pour ce moteur.");
  branch = "played"; index = 0;
  const draft = example.draft;
  setText("state", draft ? "Brouillon disponible · à relire" : "Cause non confirmée · abstention");
  setText("kind", `${example.label} · ${draft?.role === "allows-loss" ? "Ce coup permet une menace" : draft ? "Ce coup crée une occasion" : "Pas de raison inventée"}`);
  setText("title", draft?.title ?? "La cause courte n’est pas confirmée");
  setText("summary", draft?.summary ?? "Le moteur peut évaluer ce coup sans que le prototype établisse une cause courte et cohérente. Ce résultat reste visible dans l’échantillon.");
  node("context").hidden = !draft?.evidence.contextText;
  setText("context", draft?.evidence.contextText ?? "");
  node("comparison").hidden = !draft?.alternative.length;
  setText("comparison-text", draft?.comparisonText ?? "");
  setText("comparison-heading", draft?.role === "allows-loss" ? "Comment cet autre choix évite le problème" : "L’occasion que cet autre choix aurait manquée");
  setText("limitation", draft?.limitation ?? `Résultat : ${example.state} / ${example.reason}.${example.error ? ` ${example.error}` : ""}`);
  const origins = { constructed: "Position construite pour le développement", published: "Partie publiée utilisée pour le développement",
    "user-screenshot": "Position reconstruite depuis une capture utilisateur", "transformed-regression": "Transformation d'une position de développement" };
  setText("provenance", `${origins[example.origin]}. ${example.source} Mesure du ${new Date(example.capturedAt ?? data.generatedAt).toLocaleString("fr-FR")}. Moteur : ${example.engineName}. ${example.searches} recherches, ${(example.elapsedMs / 1000).toFixed(1)} s. SHA-256 du binaire : ${example.engineHash}.`);
  renderPosition();
}
function go(direction: number) {
  const steps = example.draft?.[branch];
  if (!steps) return;
  index = Math.max(0, Math.min(steps.length - 1, index + direction)); renderPosition();
}
button("previous").onclick = () => go(-1);
button("next").onclick = () => go(1);
for (const target of ["played", "alternative"] as const) {
  button(target).onclick = () => { branch = target; index = 0; renderPosition(); };
}
button("return").onclick = () => { branch = "played"; index = 0; renderPosition(); };
caseSelect.onchange = engineSelect.onchange = renderExample;
document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLSelectElement || !example) return;
  if (["ArrowLeft", "<", "ArrowRight", ">"].includes(event.key)) {
    event.preventDefault(); go(["ArrowLeft", "<"].includes(event.key) ? -1 : 1);
  }
});

try {
  const sample = new URLSearchParams(location.search).get("sample");
  const path = sample === "diversion" ? "/dev/diverted-defence-data.json" : sample === "pin" ? "/dev/pinned-defence-data.json" : sample === "ignored" ? "/dev/ignored-threat-data.json" : sample === "exposure" ? "/dev/moved-piece-data.json" : "/dev/pedagogy-review-data.json";
  const response = await fetch(path);
  if (!response.ok) throw new Error("Instantané absent. Depuis ui/, lancez npm run pedagogy:review puis rechargez cette page.");
  data = await response.json() as PreviewDocument;
  if (data.schema !== 1 || data.publishable !== false || data.independentSample !== false || !data.examples.length)
    throw new Error("Instantané de relecture invalide.");
  for (const record of data.examples) {
    new Chess(record.beforeFen); new Chess(record.afterFen);
    for (const step of [...record.draft?.played ?? [], ...record.draft?.alternative ?? []]) new Chess(step.fen);
  }
  for (const id of new Set(data.examples.map((e) => e.id))) caseSelect.add(new Option(names[id] ?? id, id));
  for (const engine of new Set(data.examples.map((e) => e.engine))) engineSelect.add(new Option(engine, engine));
  setText("snapshot", `Instantané du ${new Date(data.generatedAt).toLocaleString("fr-FR")} · ${data.examples.length} cas comparés, abstentions incluses · échantillon de développement, sans validation indépendante.`);
  renderExample();
} catch (error) {
  board.destroy();
  root.textContent = error instanceof Error ? error.message : "Chargement de l’aperçu impossible.";
}
