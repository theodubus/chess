import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Chess } from "chess.js";

// Ce contrôle utilise un profil temporaire, sans toucher au navigateur personnel.
const binary = process.env.CHESS_BROWSER_BINARY;
if (!binary)
  throw new Error(
    "Définissez CHESS_BROWSER_BINARY avec le chemin de Chromium.",
  );
const output =
  process.env.CHESS_SCREENSHOTS || join(tmpdir(), "chess-ui-visual-check");
const profile = await mkdtemp(join(tmpdir(), "chess-browser-"));
await mkdir(output, { recursive: true });
const child = spawn(
  binary,
  [
    "--headless",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let socket,
  sessionId,
  sequence = 0;
const pending = new Map(),
  errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function call(method, params = {}, session = sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Délai CDP : ${method}`));
    }, 10000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    socket.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(session ? { sessionId: session } : {}),
      }),
    );
  });
}
async function evaluate(expression) {
  const response = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails)
    throw new Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text,
    );
  return response.result.value;
}
async function waitFor(expression, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(50);
  }
  await screenshot("failure");
  console.log("Erreurs navigateur", errors);
  console.log(await evaluate("document.body.innerText"));
  throw new Error(`Échec : ${message}`);
}
async function clickAt(x, y) {
  for (const type of ["mousePressed", "mouseReleased"])
    await call("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
}
async function click(selector) {
  const p = await evaluate(
    `(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n || n.disabled) throw new Error('Contrôle absent ou désactivé'); n.scrollIntoView({block:'center'}); const b=n.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`,
  );
  await delay(100);
  await clickAt(p.x, p.y);
}
async function button(text) {
  await evaluate(
    `(() => { const n=[...document.querySelectorAll('button')].find(n=>(n.textContent.trim()===${JSON.stringify(text)} || n.textContent.includes(${JSON.stringify(text)})) && n.getBoundingClientRect().width); if(!n) throw new Error('Bouton absent : '+${JSON.stringify(text)}); n.setAttribute('data-browser-check','target'); })()`,
  );
  await click('[data-browser-check="target"]');
  await evaluate(
    `document.querySelector('[data-browser-check="target"]')?.removeAttribute('data-browser-check')`,
  );
}
async function move(from, to, workspace = ".play-workspace") {
  await evaluate(
    `document.querySelector(${JSON.stringify(workspace + " .cg-wrap")}).scrollIntoView({block:'center'})`,
  );
  await delay(100);
  const b = await evaluate(
    `(() => { const b=document.querySelector(${JSON.stringify(workspace + " cg-board")}).getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; })()`,
  );
  const flipped = await evaluate(
    `document.querySelector(${JSON.stringify(workspace + " .cg-wrap")}).classList.contains('orientation-black')`,
  );
  for (const s of [from, to]) {
    const file = s.charCodeAt(0) - 97,
      rank = Number(s[1]) - 1;
    await clickAt(
      b.x + (((flipped ? 7 - file : file) + 0.5) * b.w) / 8,
      b.y + (((flipped ? rank : 7 - rank) + 0.5) * b.h) / 8,
    );
  }
  await delay(220);
}
async function pressKey(key) {
  await call("Input.dispatchKeyEvent", { type: "keyDown", key });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key });
  await delay(80);
}
async function screenshot(name) {
  await evaluate("window.scrollTo(0,0)");
  await delay(120);
  const { data } = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(join(output, `${name}.png`), Buffer.from(data, "base64"));
}
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(
      () => reject(new Error(`Chromium ne démarre pas : ${stderr}`)),
      10000,
    );
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chromium quitté (${code}) : ${stderr}`));
    });
    child.stderr.on("data", (data) => {
      stderr += data;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  socket = new WebSocket(endpoint);
  socket.on("message", (data) => {
    const m = JSON.parse(data.toString());
    if (m.id && pending.has(m.id)) {
      const r = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) r.reject(new Error(m.error.message));
      else r.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text,
      );
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
      errors.push(m.params.entry.text);
  });
  await once(socket, "open");
  const target = await call("Target.createTarget", { url: "about:blank" });
  ({ sessionId } = await call("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  }));
  for (const method of ["Page.enable", "Runtime.enable", "Log.enable"])
    await call(method);
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (!process.env.CHESS_ANNOTATIONS_ONLY) {
    await call("Page.navigate", {
      url: process.env.CHESS_UI_URL || "http://127.0.0.1:5173",
    });
    await waitFor(`document.querySelector('.setup-card')`, "préparation");
    assert(
      await evaluate(
        `!document.querySelector('cg-board') && !document.body.textContent.includes('adversaire de test')`,
      ),
    );
    await screenshot("01-setup-desktop");
    await button("Importer un PGN");
    await screenshot("00-import-dialog");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert(
      await evaluate(
        `document.documentElement.scrollWidth <= 390 && document.querySelector('dialog').getBoundingClientRect().right <= 390`,
      ),
      "import PGN adapté au mobile",
    );
    await screenshot("00-import-mobile");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    async function fillPgn(pgn) {
      await evaluate(
        `(() => {const input=document.querySelector('.import-pgn textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(pgn)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    }
    await fillPgn("1. e5 *");
    await button("Importer et analyser");
    await waitFor(
      `document.querySelector('.import-pgn [role=alert]')`,
      "PGN illégal refusé",
    );
    assert(
      await evaluate(`!document.querySelector('.review-panel')`),
      "import invalide sans remplacer la vue",
    );
    const imported = new Chess();
    imported.setHeader("White", "Alice");
    imported.setHeader("Black", "Bob");
    for (const move of ["e4", "e5", "Nf3", "Nc6"]) imported.move(move);
    await fillPgn(imported.pgn());
    await button("Importer et analyser");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée')`,
      "analyse PGN collé",
      90000,
    );
    assert(
      await evaluate(
        `document.querySelector('.review-source').textContent.includes('Alice — Bob') && ![...document.querySelectorAll('.app-header nav button')].some(n=>n.textContent.trim()==='Partie')`,
      ),
      "analyse importée indépendante d’une partie jouée",
    );
    await pressKey(">");
    assert(
      await evaluate(
        `document.querySelector('.review-navigation span').textContent==='1 / 4'`,
      ),
      "navigation dans le PGN importé",
    );
    await button("Options d’analyse");
    await waitFor(
      `document.querySelector('select[name="analysis-engine"] option[value="stockfish"]')`,
      "Stockfish proposé par le pont",
    );
    assert(
      await evaluate(
        `document.querySelector('select[name="analysis-engine"] option[value=default]').textContent.includes('ShallowRed')`,
      ),
      "nom réel du moteur principal",
    );
    await click(".analysis-engine-choice summary");
    async function enginePath(value) {
      await evaluate(
        `(() => {const input=document.querySelector('input[name="engine-path"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    }
    await enginePath("/absent/test-chess-engine");
    await button("Vérifier et ajouter");
    await waitFor(
      `document.querySelector('.add-engine-form [role=alert]')?.textContent.includes('absent')`,
      "moteur absent refusé par le formulaire",
    );
    // Ce refus HTTP est volontaire ; toutes les autres erreurs restent bloquantes.
    const expectedRefusal = errors.indexOf(
      "Failed to load resource: the server responded with a status of 400 (Bad Request)",
    );
    if (expectedRefusal >= 0) errors.splice(expectedRefusal, 1);
    await enginePath("/usr/games/stockfish");
    await button("Vérifier et ajouter");
    await waitFor(
      `document.querySelector('.add-engine-form [role=status]')?.textContent.includes('prêt')`,
      "moteur UCI validé depuis le formulaire",
    );
    await screenshot("00a-add-engine");
    await click(".analysis-engine-choice summary");
    await evaluate(
      `(() => {const select=document.querySelector('select[name="analysis-engine"]');select.value='stockfish';select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await waitFor(
      `document.querySelector('.restart-analysis')`,
      "changement de moteur à appliquer",
    );
    await screenshot("00a-engine-options");
    await button("Relancer l’analyse");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée') && document.querySelector('.review-source')?.textContent.includes('Stockfish')`,
      "analyse avec Stockfish",
      90000,
    );
    await screenshot("00b-import-stockfish");
    await button("Revue guidée & exploration");
    await button("Explorer cette position");
    await move("e7", "e5", ".learning-workspace");
    await move("g1", "f3", ".learning-workspace");
    await waitFor(
      `document.querySelector('.study-navigation span')?.textContent.includes('2 demi')`,
      "variante à deux camps",
    );
    await waitFor(
      `document.querySelector('.study-evaluation')?.textContent.includes('Profondeur')`,
      "évaluation de la variante jouée",
    );
    await click('[aria-label="Variante précédente"]');
    await move("f1", "c4", ".learning-workspace");
    await click('[aria-label="Variante précédente"]');
    assert(
      await evaluate(
        `document.querySelectorAll('.study-branches button').length===2`,
      ),
      "deux branches conservées",
    );
    await screenshot("00c-study-branches");
    await pressKey("<");
    await pressKey("<");
    assert(
      await evaluate(
        `document.querySelector('.study-navigation span').textContent.includes('0 demi')`,
      ),
      "clavier borné au début de variante",
    );
    await button("Revenir à la partie");
    assert(
      await evaluate(
        `document.querySelector('.review-navigation span').textContent==='1 / 4'`,
      ),
      "exploration ne modifie pas la partie",
    );
    await button("Analyse détaillée");
    await button("Revue guidée & exploration");
    await button("Explorer cette position");
    await click('[aria-label="Variante suivante"]');
    assert(
      await evaluate(
        `document.querySelectorAll('.study-branches button').length===2`,
      ),
      "branches conservées entre modes",
    );
    await button("Revenir à la partie");
    await button("Analyse détaillée");
    await button("Importer un PGN");
    const start = new Chess();
    for (const move of ["f3", "e5", "g4"]) start.move(move);
    const custom = new Chess(start.fen());
    custom.move("Qh4#");
    const pgnFile = join(output, "import-test.pgn");
    await writeFile(pgnFile, custom.pgn());
    const { root } = await call("DOM.getDocument");
    const { nodeId } = await call("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: ".import-pgn input[type=file]",
    });
    await call("DOM.setFileInputFiles", { nodeId, files: [pgnFile] });
    await waitFor(
      `document.querySelector('.import-pgn textarea')?.value.includes('FEN')`,
      "lecture du fichier PGN",
    );
    await button("Importer et analyser");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée')`,
      "PGN depuis une FEN",
      90000,
    );
    assert(
      await evaluate(
        `document.querySelector('.review-navigation span').textContent==='0 / 1' && document.querySelector('.review-source').textContent.includes('Stockfish')`,
      ),
      "position initiale personnalisée et moteur mémorisé",
    );
    await pressKey(">");
    await waitFor(
      `document.querySelector('.review-position').textContent.includes('Dh4#')`,
      "coup final importé",
    );
    await button("Revue guidée & exploration");
    await pressKey("<");
    await button("Prochain moment clé");
    await waitFor(
      `document.querySelector('.review-navigation span').textContent==='1 / 1' && ![...document.querySelectorAll('button')].some(n=>n.textContent==='Arrêter le défilement')`,
      "défilement guidé jusqu’au mat",
    );
    await button("Réessayer ce coup");
    assert(
      await evaluate(
        `document.querySelector('.study-details').textContent.includes('solution sont masquées') && !document.querySelector('.study-details').textContent.includes('Dh4')`,
      ),
      "exercice adverse sans révéler la solution",
    );
    await move("d8", "h4", ".learning-workspace");
    await waitFor(
      `document.querySelector('.retry-feedback')?.textContent.includes('trouvé le choix du moteur')`,
      "bonne tentative reconnue",
    );
    await screenshot("00d-retry-success");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await screenshot("00e-learning-mobile");
    assert(
      await evaluate(
        `document.documentElement.scrollWidth<=390 && document.querySelector('.learning-workspace .study-navigation').getBoundingClientRect().bottom<=844`,
      ),
      "plateau et navigation de l’exercice sur mobile",
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await button("Retenter sans la solution");
    await move("b8", "c6", ".learning-workspace");
    await waitFor(
      `document.querySelector('.study-evaluation')?.textContent.includes('Profondeur')`,
      "tentative alternative évaluée",
    );
    await button("Voir la solution");
    await waitFor(
      `document.querySelector('.retry-feedback')?.textContent.includes('Solution du moteur affichée')`,
      "solution consultable",
    );
    await button("Revenir à la partie");
    await button("Analyse détaillée");
    await button("Importer un PGN");
    const promotionGame = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    promotionGame.move({ from: "a7", to: "a8", promotion: "q" });
    await fillPgn(promotionGame.pgn());
    await button("Importer et analyser");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée')`,
      "analyse PGN de promotion",
      90000,
    );
    await button("Revue guidée & exploration");
    await button("Explorer cette position");
    await move("a7", "a8", ".learning-workspace");
    await waitFor(
      `document.querySelector('dialog')?.textContent.includes('Choisir la promotion')`,
      "choix de promotion dans une variante",
    );
    await button("Cavalier");
    await waitFor(
      `document.querySelector('.learning-workspace piece.white.knight') && document.querySelector('.study-evaluation')?.textContent.includes('Position nulle')`,
      "sous-promotion légale et nulle analysée",
    );
    await button("Revenir à la partie");
    await button("Importer un PGN");
    await fillPgn(custom.pgn());
    await button("Importer et analyser");
    await waitFor(
      `document.querySelector('.review-progress.is-calculating') && document.querySelector('.review-navigation span').textContent==='0 / 1'`,
      "réimport identique relance une revue indépendante",
    );
    await evaluate(`localStorage.clear();window.browserCheckBeforeReload=true`);
    await call("Page.reload");
    await waitFor(
      `!window.browserCheckBeforeReload && document.readyState==='complete' && document.querySelector('.setup-card')`,
      "retour au parcours de jeu",
    );
    // Une panne injectée dans ce profil de test doit laisser le choix de l'adversaire intact.
    await evaluate(
      `window.originalTestWebSocket=window.WebSocket;window.WebSocket=class {constructor(){throw new Error('Connexion simulée indisponible');}}`,
    );
    await button("Jouer");
    await waitFor(
      `document.querySelector('.connection-error')?.textContent.includes('Connexion simulée indisponible')`,
      "erreur de préparation",
    );
    assert(
      await evaluate(
        `!document.querySelector('cg-board') && document.querySelector('.setup-card .choice[aria-pressed=true]').textContent.includes('Moteur local')`,
      ),
    );
    await evaluate(
      "window.WebSocket=window.originalTestWebSocket;delete window.originalTestWebSocket",
    );
    await button("Deux joueurs");
    await button("Jouer");
    await waitFor(
      `document.querySelector('.play-workspace cg-board piece')`,
      "partie à deux",
    );
    assert(
      await evaluate(
        `!document.querySelector('.play-workspace select') && !document.querySelector('.play-workspace .evaluation-bar')`,
      ),
    );
    await screenshot("02-game-desktop");
    assert(
      await evaluate(
        `document.querySelector('.game-sidebar').hidden && ![...document.querySelectorAll('button')].some(b => ['Annuler','Refaire'].includes(b.textContent.trim()))`,
      ),
      "historique fermé et aucune reprise de coup",
    );
    for (const [from, to] of [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ]) {
      await move(from, to);
      if (from === "e7") {
        const played = await evaluate(
          `document.querySelector('.move-list').textContent`,
        );
        await pressKey("<");
        assert(
          await evaluate(
            `document.querySelector('.review-navigation span').textContent === '1 / 2' && !!document.querySelector('.replay-notice')`,
          ),
          "relecture au clavier",
        );
        await pressKey("ArrowLeft");
        assert(
          await evaluate(
            `document.querySelector('.review-navigation span').textContent === '0 / 2'`,
          ),
        );
        await move("e2", "e4");
        assert.equal(
          await evaluate(`document.querySelector('.move-list').textContent`),
          played,
          "relecture sans modifier la partie",
        );
        assert(
          await evaluate(`!!document.querySelector('.clock.running')`),
          "la pendule continue",
        );
        await pressKey(">");
        await pressKey("ArrowRight");
        assert(
          await evaluate(`!document.querySelector('.replay-notice')`),
          "retour à la partie en cours",
        );
        await button("Coups");
        await click(".move-list tbody button");
        assert(
          await evaluate(
            `document.querySelector('.review-navigation span').textContent === '1 / 2'`,
          ),
          "navigation par l’historique",
        );
        await button("Revenir à la partie");
        await screenshot("02b-history-open");
        await button("Coups");
      }
    }
    await waitFor(
      `document.querySelector('.status').textContent.includes('Échec et mat')`,
      "mat",
    );
    const history = await evaluate(
      `document.querySelector('.move-list').textContent`,
    );
    await screenshot("03-result-desktop");
    assert(
      await evaluate(
        `(() => {const b=document.querySelector('cg-board').getBoundingClientRect();const r=document.querySelector('.board-result .result-actions').getBoundingClientRect();return r.left>=b.left && r.right<=b.right && r.top>=b.top && r.bottom<=b.bottom;})()`,
      ),
      "actions de fin de partie sur le plateau",
    );
    await click('[aria-label="Masquer le résultat"]');
    assert(
      await evaluate(`!document.querySelector('.board-result')`),
      "résultat masquable",
    );
    await button("Résultat");
    assert(
      await evaluate(`!!document.querySelector('.board-result')`),
      "résultat réaffichable",
    );
    await button("Analyser la partie");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée')`,
      "analyse automatique",
    );
    await screenshot("04-analysis-desktop");
    await evaluate(
      `document.querySelector('.desktop-chart circle:last-of-type').focus()`,
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await waitFor(
      `document.querySelector('.review-position').textContent.includes('Dh4#')`,
      "courbe au clavier",
    );
    assert(
      await evaluate(
        `(() => {const badge=document.querySelector('.board-annotation .annotation');const detail=document.querySelector('.move-assessment .annotation');return !!badge && badge.className===detail?.className;})()`,
      ),
      "le mat porte le badge du dernier coup",
    );
    assert(
      await evaluate(
        `document.querySelector('.review-details dl dd').textContent === 'Dh4#'`,
      ),
      "le panneau décrit le mat sélectionné",
    );
    assert(
      await evaluate(
        `document.querySelector('.board-annotation .annotation').getBoundingClientRect().width >= 20 && document.querySelector('.board-annotation .annotation').getBoundingClientRect().width <= 28`,
      ),
      "le badge est légèrement agrandi et borné",
    );
    assert(
      await evaluate(`(() => {
    const cell = document.querySelector('.board-annotation');
    const badge = cell.querySelector('.annotation').getBoundingClientRect();
    const square = cell.getBoundingClientRect();
    const board = document.querySelector('.review-panel cg-board').getBoundingClientRect();
    const corner = cell.dataset.corner;
    const x = (badge.x + badge.width / 2 - square.x) / square.width;
    const y = (badge.y + badge.height / 2 - square.y) / square.height;
    return Math.abs(x - (corner.endsWith('left') ? .05 : .95)) < .01 && Math.abs(y - (corner.startsWith('top') ? .05 : .95)) < .01 && badge.left >= board.left && badge.right <= board.right && badge.top >= board.top && badge.bottom <= board.bottom;
  })()`),
      "ancrage exact au coin, sans décalage dû à la bordure",
    );
    await button("Coups");
    assert(
      await evaluate(
        `Boolean([...document.querySelectorAll('.review-moves button')].find(button => button.textContent.includes('g4'))?.querySelector('.annotation-blunder'))`,
      ),
      "la gaffe qualifie g4 dans l’historique",
    );
    await click(".pane-tabs button:first-child");
    await click('.review-navigation [aria-label="Position précédente"]');
    assert(
      await evaluate(
        `Boolean(document.querySelector('.board-annotation .annotation-blunder'))`,
      ),
      "le badge sur le plateau correspond au coup précédent",
    );
    assert(
      await evaluate(
        `Boolean(document.querySelector('.move-assessment .annotation-blunder'))`,
      ),
      "le panneau et le plateau qualifient le même coup sélectionné",
    );
    assert(
      await evaluate(
        `document.querySelector('.review-details dl dd').textContent === 'g4'`,
      ),
      "le coup joué est g4, pas Dh4",
    );
    const beforeG4 = await evaluate(
      `([...document.querySelectorAll('.review-details dl > div')].find(row => row.querySelector('dt').textContent === 'Avant le coup')).querySelector('dd').textContent`,
    );
    assert(
      await evaluate(
        `([...document.querySelectorAll('.review-details dl > div')].find(row => row.querySelector('dt').textContent === 'Après le coup joué')).querySelector('dd').textContent === 'Mat en 1 · Noirs'`,
      ),
      "le score après g4 décrit le mat au prochain coup",
    );
    await screenshot("04b-move-classification");
    await button("Revue guidée & exploration");
    assert(
      await evaluate(
        `!!document.querySelector('.retry-invitation') && !!document.querySelector('.board-annotation .annotation-blunder')`,
      ),
      "retry mis en avant après la gaffe",
    );
    await evaluate(
      `(() => {const s=document.querySelector('[aria-label="Mon camp pour les exercices"]');s.value='b';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    assert(
      await evaluate(
        `!document.querySelector('.retry-invitation') && [...document.querySelectorAll('.study-details button')].some(b=>b.textContent==='Réessayer ce coup')`,
      ),
      "retry adverse disponible sans invitation prioritaire",
    );
    await button("Réessayer ce coup");
    assert(
      await evaluate(
        `document.querySelector('.study-details').textContent.includes('Blancs') && document.querySelector('.study-details').textContent.includes('solution sont masquées')`,
      ),
      "exercice du camp adverse à la bonne position",
    );
    await button("Revenir à la partie");
    await button("Analyse détaillée");
    await click('.review-navigation [aria-label="Position précédente"]');
    assert(
      await evaluate(
        `document.querySelector('.review-details dl dd').textContent === 'e5'`,
      ),
      "le panneau suit aussi les coups noirs",
    );
    assert.equal(
      await evaluate(
        `([...document.querySelectorAll('.review-details dl > div')].find(row => row.querySelector('dt').textContent === 'Après le coup joué')).querySelector('dd').textContent`,
      ),
      beforeG4,
      "après e5 est exactement avant g4",
    );
    await click('.review-navigation [aria-label="Position initiale"]');
    assert(
      await evaluate(
        `!document.querySelector('.move-assessment') && !document.querySelector('.board-annotation') && !document.querySelector('.review-details').textContent.includes('Coup joué')`,
      ),
      "aucun coup futur évalué à la position initiale",
    );
    await click('.review-navigation [aria-label="Position suivante"]');
    await waitFor(
      `document.querySelector('.review-position').textContent==='Après 1. f3'`,
      "position suivante",
    );
    await pressKey("<");
    assert(
      await evaluate(
        `document.querySelector('.review-position').textContent === 'Position initiale'`,
      ),
      "clavier dans l’analyse",
    );
    await pressKey(">");
    assert(
      await evaluate(
        `document.querySelector('.review-position').textContent === 'Après 1. f3'`,
      ),
    );
    await click(".variation-moves button");
    await waitFor(
      `document.querySelector('.review-position').textContent.startsWith('Variante')`,
      "variante",
    );
    assert(
      await evaluate(`!document.querySelector('.board-annotation')`),
      "aucun badge de partie sur une variante",
    );
    assert(
      await evaluate(
        `document.querySelector('.variation-moves button').textContent.startsWith('1.')`,
      ),
      "la variante du premier coup commence avant ce coup",
    );
    await button("Revenir à la position de la partie");
    await button("Options d’analyse");
    await click("dialog .annotation-toggle input");
    await click("dialog .evaluation-toggle input");
    assert(
      await evaluate(
        `!document.querySelector('dialog .annotation-toggle input').checked && localStorage.getItem('chess-ui.show-annotations')==='false'`,
      ),
      "annotations désactivées sans déplacement des options au chargement",
    );
    await click('dialog [aria-label="Fermer"]');
    assert(
      await evaluate(
        `!document.querySelector('.review-panel .evaluation-bar') && !document.querySelector('.evaluation-chart')`,
      ),
    );
    assert(
      await evaluate(
        `!document.querySelector('.annotation') && !document.querySelector('.move-assessment')`,
      ),
      "les annotations sont désactivables",
    );
    await click(".app-header nav button:first-child");
    assert.equal(
      await evaluate(`document.querySelector('.move-list').textContent`),
      history,
    );
    await button("Nouvelle partie");
    await button("Moteur local");
    await button("Noirs");
    await button("3 min");
    await button("Jouer");
    await waitFor(
      `document.querySelector('.move-list tbody tr') && document.querySelector('.status').textContent.includes('noirs')`,
      "moteur blanc",
    );
    assert(
      await evaluate(
        `document.querySelector('.play-workspace .cg-wrap').classList.contains('orientation-black')`,
      ),
    );
    assert(
      await evaluate(
        `!document.querySelector('.play-workspace .evaluation-bar')`,
      ),
    );
    await screenshot("05-engine-white");
    assert(
      await evaluate(
        `![...document.querySelectorAll('.player-name')].some(n => n.textContent.includes('Profondeur'))`,
      ),
      "profondeur masquée par défaut",
    );
    await pressKey("<");
    assert(
      await evaluate(`!!document.querySelector('.replay-notice')`),
      "relecture contre le bot",
    );
    await pressKey(">");
    await button("Options");
    const navigationBeforeDialog = await evaluate(
      `document.querySelector('.play-workspace .review-navigation span').textContent`,
    );
    await pressKey("<");
    assert.equal(
      await evaluate(
        `document.querySelector('.play-workspace .review-navigation span').textContent`,
      ),
      navigationBeforeDialog,
      "pas de navigation à travers un dialogue",
    );
    assert(
      await evaluate(`!!document.activeElement.closest('dialog')`),
      "Focus dans le dialogue",
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    assert(
      await evaluate(`!!document.activeElement.closest('dialog')`),
      "Navigation clavier dans le dialogue",
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await waitFor(`!document.querySelector('dialog')`, "fermeture par Échap");
    assert(
      await evaluate(`document.activeElement.textContent==='Options'`),
      "Focus rendu au bouton",
    );
    await button("Options");
    await click("dialog .depth-toggle input");
    await click("dialog .evaluation-toggle input");
    await click('dialog [aria-label="Fermer"]');
    assert(
      await evaluate(
        `!!document.querySelector('.play-workspace .evaluation-bar')`,
      ),
    );
    assert(
      await evaluate(
        `[...document.querySelectorAll('.player-name')].some(n => n.textContent.includes('Profondeur'))`,
      ),
      "profondeur activable indépendamment",
    );
    await button("Nouvelle partie");
    await waitFor(
      `document.querySelector('dialog')?.textContent.includes('Quitter cette partie')`,
      "protection de la partie",
    );
    await button("Rester dans la partie");
    await move("e7", "e5");
    await button("Abandonner");
    await button("Confirmer l’abandon");
    await waitFor(
      `document.querySelector('.status').textContent.includes('Abandon')`,
      "abandon humain noir",
    );
    assert(
      await evaluate(
        `document.querySelector('.result-score').textContent==='1-0'`,
      ),
    );
    await button("Analyser la partie");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée')`,
      "analyse après abandon",
    );
    assert(
      await evaluate(
        `!document.querySelector('.review-panel .evaluation-bar')`,
      ),
      "Préférence de revue indépendante",
    );
    assert(
      await evaluate(
        `!document.querySelector('.move-assessment') && localStorage.getItem('chess-ui.show-annotations') === 'false'`,
      ),
      "préférence des annotations conservée entre parties",
    );
    await button("Options d’analyse");
    await click("dialog .annotation-toggle input");
    await click("dialog .evaluation-toggle input");
    assert(
      await evaluate(`!document.querySelector('.restart-analysis')`),
      "les options d’affichage ne demandent pas de recalcul",
    );
    assert(
      await evaluate(
        `document.querySelector('dialog .annotation-toggle input').checked && localStorage.getItem('chess-ui.show-annotations')==='true'`,
      ),
      "annotations réactivées sans déplacement des options au chargement",
    );
    await evaluate(
      `(() => {const s=document.querySelector('dialog select');s.value='3000';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await waitFor(
      `document.querySelector('dialog .restart-analysis')`,
      "relance proposée après changement du budget",
    );
    await evaluate(
      `(() => {const s=document.querySelector('dialog select');s.value='500';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await waitFor(
      `!document.querySelector('.restart-analysis')`,
      "relance masquée quand le réglage initial est rétabli",
    );
    await evaluate(
      `(() => {const s=document.querySelector('dialog select');s.value='3000';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await button("Relancer l’analyse");
    await waitFor(
      `!document.querySelector('dialog') && document.querySelector('.review-progress.is-calculating .analysis-spinner')`,
      "analyse en cours",
    );
    await screenshot("05b-analysis-calculating");
    assert(
      await evaluate(
        `document.querySelector('.review-progress').textContent.includes('position par position')`,
      ),
      "calcul expliqué pendant l’attente",
    );
    await button("Arrêter");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse interrompue')`,
      "arrêt",
    );
    assert(
      await evaluate(
        `![...document.querySelectorAll('.review-topbar button')].some(n=>n.textContent.includes('Relancer'))`,
      ),
      "pas de bouton de relance permanent",
    );
    await button("Options d’analyse");
    assert(
      await evaluate(`!!document.querySelector('dialog .restart-analysis')`),
      "relance accessible après interruption",
    );
    await click('dialog [aria-label="Fermer"]');
    await call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call("Page.reload");
    await waitFor(
      `document.querySelector('.setup-card')`,
      "préparation mobile",
    );
    await screenshot("06-setup-mobile");
    await button("Deux joueurs");
    await button("Jouer");
    await waitFor(
      `document.querySelector('.play-workspace cg-board piece')`,
      "partie mobile",
    );
    await evaluate("window.scrollTo(0,0)");
    await screenshot("07-game-mobile");
    await button("Coups");
    assert(
      await evaluate(
        `!document.querySelector('.game-sidebar').hidden && document.documentElement.scrollWidth <= 390`,
      ),
      "historique repliable sans débordement sur mobile",
    );
    await button("Coups");
    await waitFor(
      `document.documentElement.scrollWidth<=390`,
      "largeur mobile",
    );
    assert(
      await evaluate(
        `document.querySelector('.board-toolbar').getBoundingClientRect().bottom<=844`,
      ),
      "Commandes visibles sans défiler",
    );
    await screenshot("07-game-mobile");
    for (const [from, to] of [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ])
      await move(from, to);
    await waitFor(
      `document.querySelector('.status').textContent.includes('Échec et mat')`,
      "mat sur mobile",
    );
    await screenshot("07b-result-mobile");
    assert(
      await evaluate(
        `(() => {const b=document.querySelector('cg-board').getBoundingClientRect();const r=document.querySelector('.board-result .result-actions').getBoundingClientRect();return r.left>=b.left && r.right<=b.right && r.top>=b.top && r.bottom<=b.bottom && r.bottom<=844;})()`,
      ),
      "actions de fin de partie visibles sur le plateau mobile",
    );
    await button("Analyser la partie");
    await waitFor(
      `document.querySelector('.review-progress')?.textContent.includes('Analyse terminée')`,
      "analyse sur mobile",
    );
    await waitFor(
      `document.documentElement.scrollWidth<=390 && innerWidth<=390`,
      "mise en page mobile",
    );
    await screenshot("08-analysis-mobile");
    await click(".variation-moves button");
    await waitFor(
      `document.querySelector('.review-position').textContent.startsWith('Variante')`,
      "variante mobile",
    );
    assert(
      await evaluate(
        `document.querySelector('.review-navigation').getBoundingClientRect().bottom <= 844`,
      ),
      "Navigation visible pendant la variante",
    );
    await button("Revenir à la position de la partie");
    await click('.review-navigation [aria-label="Position finale"]');
    await waitFor(
      `document.querySelector('.review-position').textContent.includes('Dh4#')`,
      "position finale",
    );
    await screenshot("08b-annotation-mobile");
    assert(
      await evaluate(
        `(() => {const badge=document.querySelector('.board-annotation .annotation');const detail=document.querySelector('.move-assessment .annotation');return !!badge && badge.className===detail?.className;})()`,
      ),
      "annotation visible sur mobile après rechargement",
    );
    await screenshot("08b-annotation-mobile");
    await button("Options d’analyse");
    await button("Retourner l’échiquier");
    assert(
      await evaluate(
        `document.querySelector('.board-annotation').style.left === '0%' && document.querySelector('.board-annotation').style.top === '37.5%'`,
      ),
      "annotation suit h4 quand le plateau est retourné",
    );
    await click(".pane-tabs button:last-child");
    await click(".review-moves button:first-child");
    await waitFor(
      `document.querySelector('.review-position').textContent==='Position initiale'`,
      "navigation dans les coups",
    );
    await click(".app-header nav button:first-child");
    await button("Nouvelle partie");
    await waitFor(
      `document.querySelector('.setup-card') && !document.querySelector('.play-workspace')`,
      "retour accueil",
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 700,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate("window.browserCheckBeforeReload = true");
    await call("Page.reload");
    await waitFor(
      `!window.browserCheckBeforeReload && document.readyState === 'complete' && document.querySelector('.setup-card')`,
      "préparation sur tablette",
    );
    await button("Deux joueurs");
    await button("Jouer");
    await waitFor(
      `document.querySelector('.play-workspace cg-board piece')`,
      "plateau sur tablette",
    );
    assert(
      await evaluate(`document.documentElement.scrollWidth <= 700`),
      "plateau adapté à une fenêtre étroite",
    );
    await button("Coups");
    assert(
      await evaluate(`document.documentElement.scrollWidth <= 700`),
      "historique ouvert sans débordement sur tablette",
    );
    await screenshot("09-game-tablet");
  }
  const gallery = await call(
    "Target.createTarget",
    { url: "about:blank" },
    null,
  );
  ({ sessionId } = await call(
    "Target.attachToTarget",
    { targetId: gallery.targetId, flatten: true },
    null,
  ));
  for (const method of ["Page.enable", "Runtime.enable", "Log.enable"])
    await call(method);
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", {
    url: new URL(
      "/dev/annotations.html",
      process.env.CHESS_UI_URL || "http://127.0.0.1:5173",
    ).href,
  });
  await waitFor(
    `document.querySelector('.annotation-fixture .board-annotation .annotation-excellent svg')`,
    "pictogrammes vectoriels",
  );
  assert(
    await evaluate(
      `!document.querySelector('.annotation-fixture').textContent.includes('👍') && [...document.querySelectorAll('.annotation-excellent svg')].every(svg => getComputedStyle(svg).color === 'rgb(255, 255, 255)')`,
    ),
    "pouce blanc sans emoji",
  );
  assert(
    await evaluate(`document.querySelectorAll('.board-annotation').length === 4 && [...document.querySelectorAll('.board-annotation')].every(cell => {
    const square = cell.getBoundingClientRect(); const badge = cell.querySelector('.annotation').getBoundingClientRect();
    const x = (badge.x + badge.width / 2 - square.x) / square.width;
    const y = (badge.y + badge.height / 2 - square.y) / square.height;
    return Math.abs(x - (cell.dataset.corner.endsWith('left') ? .05 : .95)) < .01 && Math.abs(y - (cell.dataset.corner.startsWith('top') ? .05 : .95)) < .01;
  })`),
    "tous les pictogrammes partagent les mêmes ancrages",
  );
  await screenshot("10-annotation-gallery");
  assert.deepEqual(errors, [], "Aucune erreur JavaScript ou réseau");
  console.log(
    `${process.env.CHESS_ANNOTATIONS_ONLY ? "Contrôle des pictogrammes réussi" : "Contrôle navigateur réussi : import PGN (texte, fichier, FEN), Stockfish, partie complète, analyse réelle, navigation, préférences, bureau, mobile, tablette et pictogrammes"}. Captures : ${output}`,
  );
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await call("Browser.close", {}, null).catch(() => {});
    socket.close();
  }
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
