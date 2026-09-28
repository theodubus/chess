# ui/ — consignes de travail

Ce fichier fait autorité pour tout ce qui se trouve sous `ui/`. Il est écrit
pour un agent qui reprend sans contexte.

Le `CLAUDE.md` de la racine décrit **le moteur** : protocole de mesure de force,
SPRT, perft, balayage par mutation, référence du bench. **Rien de tout cela ne
s'applique ici** — voir *Ce qui ne s'applique pas*, plus bas. Ne pas le lire
comme une contrainte sur l'interface.

## Périmètre — non négociable

**Tu possèdes `ui/**`, et rien d'autre.**

| | |
|---|---|
| tu écris | tout ce qui est sous `ui/` |
| tu ne touches pas | `engine/`, `tools/`, `.github/`, `.claude/`, le `README.md` et le `CLAUDE.md` de la racine, `Cargo.toml` |

Le moteur est développé en parallèle par quelqu'un d'autre, dans le même dépôt.
Toucher un fichier partagé produit un conflit de fusion à coup sûr. Si un
changement hors `ui/` te paraît nécessaire, **ouvre une issue et n'y touche
pas** : c'est probablement que l'interface essaie de savoir quelque chose que le
moteur refuse de dire, et c'est alors le besoin qu'il faut discuter.

## Ce que tu construis

Une interface d'échecs jouable, qui pilote **n'importe quel moteur UCI** — pas
seulement celui de ce dépôt. C'est une propriété, pas un accident : elle permet
de comparer notre moteur à un autre en changeant une ligne de configuration.

L'interface possède **tout ce que le moteur refuse de savoir** :

- le rendu de l'échiquier, le glisser-déposer, la surbrillance des coups
  légaux, les prémouvements, le dialogue de promotion ;
- l'état de la partie : liste des coups, PGN, annuler/refaire, résultat ;
- les pendules ;
- l'affichage de ce que le moteur pense — barre d'évaluation, profondeur,
  variante principale ;
- les réglages : difficulté, choix du moteur, thème.

## Décisions déjà prises — ne pas les rouvrir

Elles sont tranchées par le propriétaire du projet. Les rouvrir demande un fait
technique nouveau, pas une préférence.

- **Monorepo.** `engine/`, `ui/`, `tools/` dans le même dépôt.
- **UCI est l'unique frontière** entre l'interface et le moteur. L'interface ne
  connaît du moteur que des lignes de texte.
- **Licence AGPL-3.0-or-later sur tout le dépôt.** Voir *Licence*, plus bas —
  c'est la seule contrainte irréversible du projet.
- **`chessground`** pour l'échiquier. C'est l'implémentation de Lichess, sous
  GPL-3.0, compatible avec l'AGPL du dépôt. *(Licence à confirmer
  mécaniquement dans les métadonnées npm au moment d'ajouter la dépendance —
  elle n'a jamais été vérifiée à la source.)*
- **`chess.js`** pour les règles côté client, afin de surligner les coups
  légaux et de refuser un déplacement illégal sans aller-retour vers le moteur.
  **Cette duplication des règles est volontaire** : l'une sert l'interactivité,
  l'autre la force de jeu. Ne pas essayer de l'éliminer.
- **React + Vite + TypeScript.** Choix à faible enjeu, arrêté pour que tu n'aies
  pas à le poser. `chessground` est une bibliothèque DOM ordinaire, sans
  dépendance à un framework : elle s'intègre dans un composant qui lui donne un
  nœud et le laisse tranquille.

## La décision qui n'est PAS prise, et comment tu fais avec

**Le transport n'est pas tranché.** Trois formes possibles, et elles donnent
trois produits différents :

| forme | le tuyau |
|---|---|
| application de bureau (Tauri, Electron) | processus fils, `stdin`/`stdout` |
| web, moteur local | WebAssembly dans un Web Worker, UCI par `postMessage` |
| web, moteur distant | serveur HTTP/WebSocket détenant le processus |

**Tu ne tranches pas.** Tu écris l'interface contre un adaptateur, et le
transport devient un seul fichier :

```ts
/** Tout ce que l'interface sait du moteur. */
export interface Engine {
  /** Envoie une commande UCI. Une ligne, sans saut de ligne final. */
  send(command: string): void;
  /** S'abonne aux lignes émises par le moteur. Rend la fonction de retrait. */
  onLine(listener: (line: string) => void): () => void;
  /** Ferme proprement. Envoie `quit` et libère la ressource. */
  dispose(): Promise<void>;
}
```

**C'est la seule contrainte d'architecture de ce chantier, et elle est
absolue.** Si un appel `window.electron.*`, un `postMessage` ou un `WebSocket`
apparaît ailleurs que dans une implémentation de `Engine`, le report est perdu
et le transport aura été choisi sans que personne ne le décide.

Le test : **on doit pouvoir passer du bureau au web en remplaçant un fichier.**
Si ce n'est plus vrai, c'est un défaut, pas un détail.

**Pour développer**, écris une implémentation `Engine` qui parle à un pont Node
d'une trentaine de lignes : il lance le binaire du moteur et relaie
`stdin`/`stdout` sur un WebSocket. Jetable, hors du chemin de production, et il
ne demande aucun changement au moteur. Écris aussi une implémentation factice
qui rejoue des réponses en dur — elle rend les tests d'interface possibles sans
binaire.

## Le moteur, tel qu'il est réellement

Vérifié dans `engine/src/uci.rs`, pas supposé. **Ne pas présumer d'autres
commandes** : ce qui n'est pas listé n'existe pas.

*Revérifié le 24 sept. 2026 : le ponder (23 sept.) et `Threads` (24 sept.)
sont arrivés depuis la première version de cette section, qui disait « une
seule option » et « ni `ponder` ». Revérifié le 26 sept. 2026 : `EvalFile`
est arrivé (NNUE, A21) — et le titre ne compte plus les options, un compteur
en prose naissant périmé.*

**Commandes acceptées** — `uci`, `isready`, `ucinewgame`, `setoption`,
`position`, `go`, `stop`, `ponderhit`, `quit`. Une commande inconnue est
ignorée sans casser la session.

**`go` accepte** — `wtime`, `btime`, `winc`, `binc`, `movestogo`, `movetime`,
`depth`, `nodes`, `infinite`, `ponder`, et `perft <n>` pour le diagnostic.

**Les options** :

```
option name Hash type spin default <n> min 1 max 4096
option name Ponder type check default false
option name Threads type spin default 1 min 1 max 1024
option name EvalFile type string default <empty>
```

- `Hash` : la table de transposition, en mégaoctets.
- `Ponder` : le moteur SAIT pondérer ; c'est l'interface qui décide de s'en
  servir. Elle envoie `go ponder …` avec le coup prédit joué, puis
  `ponderhit` si l'adversaire le joue, `stop` sinon. **Le moteur n'envoie
  jamais `bestmove` avant `ponderhit` ou `stop`**, même s'il a fini.
- `Threads` : le nombre de fils de recherche (Lazy SMP). Un par défaut ;
  c'est l'interface qui sait combien de cœurs elle peut donner.
- `EvalFile` : le chemin d'un réseau NNUE, au format qu'écrit l'entraîneur
  bullet. Vide par défaut (`<empty>`) : l'évaluation faite main. Un fichier
  refusé laisse l'évaluation telle qu'elle était et le dit par une ligne
  `info string` ; un fichier accepté aussi. **Aucun réseau entraîné n'est
  encore livré** — l'option existe pour le jour où il le sera.

**Il n'y a PAS de `MultiPV`.** Ne pas construire d'interface qui le suppose.
Si l'analyse en a besoin un jour, c'est une demande à formuler au moteur, pas
à contourner.

**Ce que le moteur émet** :

```
info depth <d> score cp <n> nodes <n> time <ms> nps <n> hashfull <n> pv <coups>
info depth <d> score mate <n> ...
info string <message>
bestmove <coup>
bestmove <coup> ponder <coup>   ← avec le coup qu'il prédit pour l'adversaire
bestmove 0000          ← aucun coup légal : mat ou pat
```

`score cp` est en centièmes de pion **du point de vue du camp au trait**.
`score mate n` veut dire mat en `n` coups ; `n` négatif, c'est nous qui sommes
matés. Une barre d'évaluation doit donc **retourner le signe selon le trait**,
sans quoi elle ment une fois sur deux.

**Trois propriétés à ne pas oublier** :

1. **Le moteur ne garde aucun état entre deux `position`.** Pas de partie, pas
   de PGN, pas de joueurs. C'est à toi d'envoyer la position complète à chaque
   coup — `position startpos moves e2e4 e7e5 …` ou `position fen <fen> moves …`.
   Ce n'est pas une limite, c'est ce qui rend le moteur remplaçable.
2. **Les coups sont en notation UCI pure**, roque compris : `e1g1`, jamais
   `e1h1`. Le moteur fait la conversion à sa frontière.
3. **Une séquence `position … moves` contenant un coup illégal est
   intégralement rejetée**, pas appliquée à moitié. Le moteur répond
   `info string <erreur> — position ignorée`. Si tu ignores cette ligne, ton
   interface et le moteur divergent en silence.

**Un piège de protocole déjà payé** : envoyer `go` puis `quit` d'affilée
**interrompt la recherche**. Il faut lire jusqu'à `bestmove` avant d'envoyer
`quit`. Un banc d'essai qui ne le fait pas mesure une profondeur qui n'existe
pas.

## Licence — la seule irréversibilité du projet

Tout le dépôt est sous **AGPL-3.0-or-later**. `chessground` est GPL-3.0, et les
deux licences prévoient explicitement leur combinaison.

**Conséquence pratique** : toute dépendance que tu ajoutes doit être compatible
avec l'AGPL-3.0. MIT, BSD, Apache-2.0, GPL-3.0 et AGPL-3.0 le sont. **Une
dépendance sous licence propriétaire, ou sous une licence copyleft
incompatible, contamine tout le dépôt et le retour en arrière est impossible.**

En cas de doute sur une licence : ne l'ajoute pas, ouvre une issue.

## Ce qui ne s'applique pas ici

Le `CLAUDE.md` de la racine est écrit pour un moteur d'échecs dont la qualité se
mesure en Elo. **Ces règles ne concernent pas l'interface** :

- « un SPRT par changement » — un SPRT mesure la force de jeu. Une interface
  n'en a pas.
- perft, référence du bench, cliquet de mutation, `tools/verify.sh`,
  `tools/sprt.sh` — outillage du moteur.
- les invariants de recherche (negamax, scores de mat, coup nul, fenêtres
  d'aspiration) — ils ne franchissent pas la frontière UCI.

**Ce qui s'applique, en revanche**, parce que c'est de la culture de projet :

- **Les tests s'écrivent en même temps que le code, pas après.**
- **Un commentaire explique *pourquoi*, pas *quoi*.** Une session future doit
  pouvoir reprendre sans tout redécouvrir.
- **Commentaires en français, code et identifiants en anglais.**
- **Ne jamais affirmer l'état d'un système externe sans l'avoir interrogé.**
  Une CI se lit, elle ne se déduit pas d'un test local.
- **Vérifier la vraisemblance d'un chiffre avant de l'inscrire.** Un rapport
  parfaitement rond ou nul est un signe de protocole cassé, pas un résultat.
- **Ne jamais inscrire dans un test une position d'échecs dérivée par
  raisonnement sans l'avoir exécutée.** Le projet a payé six fois pour cette
  règle — dont une fois le jour où elle a été réécrite. Un échiquier mental est
  un mauvais vérificateur : utilise `chess.js` pour construire et vérifier
  toute position de test.

## Comment tu livres

`main` est protégée : **aucun push direct n'aboutit**, GitHub le refuse avec
`Changes must be made through a pull request.` Ce n'est pas une panne.

1. Travaille sur une branche `codex/<sujet>`.
2. Ouvre une pull request.
3. La CI (`.github/workflows/ci.yml`) tourne sur toutes les branches. Elle
   compile et teste **le moteur Rust** ; sur une PR qui ne touche que `ui/`,
   elle passe sans rien dire. **C'est voulu** : ça garantit qu'un travail
   d'interface ne peut pas casser le moteur en silence.
4. Fusionne en **`merge`**, jamais en `squash`. Le dépôt garde l'historique
   lisible, et un squash a déjà cassé une référence de commit ici.

Si tu ajoutes une étape de CI pour l'interface — lint, typecheck, tests — mets-la
dans un **workflow séparé**, `.github/workflows/ui.yml`, filtré sur
`paths: ["ui/**"]`. Ne touche pas à `ci.yml`. C'est la seule exception au
périmètre, et elle demande une PR dédiée qui ne fait que ça.

## Par où commencer

Dans cet ordre. Chaque étape doit tourner avant la suivante.

1. **Le squelette.** Vite + React + TypeScript sous `ui/`, `npm run dev` qui
   affiche quelque chose, lint et typecheck qui passent.
2. **L'échiquier.** `chessground` monté, `chess.js` pour l'état, coups légaux
   jouables à la souris des deux côtés. **Aucun moteur à ce stade.**
3. **L'adaptateur.** L'interface `Engine`, l'implémentation factice, et le pont
   Node de développement. Critère de fin : `uci` rend `uciok`, `isready` rend
   `readyok`, et tu le vois dans un journal à l'écran.
4. **Jouer contre le moteur.** `position` + `go` à chaque coup, `bestmove`
   appliqué à l'échiquier. Une partie entière sans divergence.
5. **Les pendules**, et `go wtime … btime … winc … binc …` correctement
   renseigné.
6. **Ce que le moteur pense.** Barre d'évaluation, profondeur, variante
   principale, depuis les lignes `info`. Attention au signe.
7. **L'état de partie.** Liste des coups, PGN, annuler/refaire, détection du
   résultat.

Tout le reste — thèmes, prémouvements, analyse, choix du moteur — vient après,
et seulement si les sept premiers points tiennent.

## Si tu es bloqué

Ouvre une issue et décris ce qui bloque. **Ne contourne pas en touchant au
moteur** : la frontière UCI est ce qui rend les deux chantiers parallélisables,
et la franchir une fois coûte plus cher que d'attendre une réponse.
