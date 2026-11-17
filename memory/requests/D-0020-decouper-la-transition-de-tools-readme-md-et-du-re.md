<!-- socle: couche=demandes zone=publique -->
# D-0020 — Découper la transition de tools/README.md et du README.md vers la mémoire

> date : 2026-11-17

## Décision demandée

Où ranger les récits de mesures et les verdicts que `tools/README.md` et le `README.md` de la racine portent encore : au journal de la mémoire, une entrée par section, ou dans des fichiers d'archives ; le reste du plan, ci-dessous, va avec la réponse.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, qui parle UCI (le protocole standard entre une interface d'échecs et un moteur), avec une interface en TypeScript ; le dépôt est à toi. L'agent qui écrit cette demande est l'assistant qui travaille sur le moteur et sa mémoire.

**Le chantier.** Le socle est l'outillage installé le 11 nov. 2026 qui tient la mémoire du projet en fichiers, dans `memory/`, en couches (des faits vérifiés, des décisions, un journal daté, un backlog, des demandes comme celle-ci), et vérifie leurs règles à chaque commit. Le 17 nov., tu as demandé de finir de l'adopter avant de reprendre le moteur, en scindant `tools/README.md` pour que « chaque info de memoire a sa place, meme si ça doit prendre plus de temps », puis de mettre le socle à jour depuis un dépôt conforme : où chaque information est dans la couche que le socle prévoit. La feuille de route qui restait dans `tools/README.md` en est déjà sortie : chaque ligne ouverte est au backlog, ou dans la « longue traîne » des idées non décidées, gardée au journal et hors du backlog comme tu l'as validé le 12 nov. Dans la même conversation, tu as demandé si le `README.md` de la racine ne méritait pas le même traitement : il suit.

**La question.** Ces deux fichiers mêlent la documentation des outils à 1,5 Mo de récits de mesures. Le choix de leur place est long à défaire en travail (chaque renvoi à reprendre), jamais en information, puisque le texte part entier.

L'inventaire, mesuré section par section le 17 nov., et le plan commun aux deux réponses :

| partie | taille | où elle va |
|---|---|---|
| documentation des outils : arbitres de matchs, livre d'ouvertures, binaires, scripts | 47 Ko | reste ; ses passages de mesures datées partent, la règle reste |
| le tableau des verdicts (« Mesures de référence ») : chaque match entre deux versions du moteur, son écart en Elo, son nombre de parties, sa cadence | 50 Ko | **au choix** ; les quelques chiffres sur lesquels des règles s'appuient encore (l'Elo d'un doublement du temps de réflexion, le budget de parties d'un match) deviennent des faits vérifiés |
| récits des chantiers, de septembre à novembre, numérotés (« n° 9 », « C13 ») : protocoles écrits avant de mesurer, verdicts, lectures des résultats | 1,26 Mo | **au choix** |
| gestion du temps, autres récits de fin de fichier | 80 Ko | **au choix** |
| registre des réglages ouverts : chaque valeur réglable du réseau d'évaluation et de la recherche, ce qui l'a mesurée, son gain possible, son prochain test | 13 Ko | deux faits vérifiés (réseau, recherche), une ligne par réglage, chaque prochain test renvoyant à un sujet du backlog ; l'histoire de chaque mesure au même endroit que les récits. Les faits passent de 4,7 à environ 12 Ko, sous leur plafond de 16 Ko pour le fichier entier |
| « Ce qu'il faut surveiller » | 12 Ko | ce qui touche les outils reste ; ce qui touche l'état du projet (expirations, déclencheurs) devient fait ou sujet daté |
| `README.md` : son bloc « Statut » et des mesures dans ses sections | 11 Ko sur 21 | un statut de dix lignes au présent, qui renvoie aux faits ; restent la ligne du banc (le nombre de nœuds de référence, qu'un test vérifie) et la mention d'attribution que la licence des données de Leela Chess Zero impose |

**Les renvois.** Une trentaine de fichiers renvoient à ces sections par leur nom. Une table des anciens renvois, gardée dans `tools/README.md`, nommerait chaque section partie et sa nouvelle place : elle garde vivants les renvois qu'on ne réécrit pas (messages de commit, entrées passées du journal, qui ne se modifient plus, et quatre workflows de CI, que seul toi peux approuver) ; les autres se réécrivent. Rien ne te reviendra pour les workflows.

**L'ordre**, chaque lot relu par un relecteur sans contexte, en pull request, fusionné par l'agent quand la CI est verte : le `README.md` (petit, le plus lu) ; le registre (ce dont le travail du moteur se sert) ; les récits, en quatre ou cinq lots par période ; puis le tableau des verdicts, la table des renvois et les renvois de `CLAUDE.md`, qui ont besoin de toutes les places nouvelles. Un script relève chaque chiffre du texte d'avant et le retrouve après : fait pour `CLAUDE.md` le 17 nov., 218 chiffres, tous retrouvés. Supposé : trois à cinq sessions, le moteur à l'arrêt d'ici là.

## Éléments cités

- B-0043@86b96cef — le sujet du backlog qui demande ce découpage.
- B-0041@c39b6981 — le jalon qui réunit les derniers sujets de l'adoption.
- B-0038@258d2161 — la question laissée à toi : écarter les archives du test des chiffres du banc, le jour où il en existe.
- D-0017@79902ee8 — ta décision du 17 nov. de scinder `tools/README.md` selon le socle.
- ADR-0030@65596e0a — l'admission des données de Leela, et la mention d'attribution qu'elle impose au `README.md`.
- D-0019@3cbac288 — ta demande en attente sur le transport entre l'interface et le moteur, l'autre tâche ouverte du jalon.

Le suffixe après `@` est l'empreinte de la version lue de chaque entrée.

## Où regarder

- [`tools/README.md`](https://github.com/theodubus/chess/blob/7aff607154c1f91d5057adf78c79606768c36270/tools/README.md) : la table des matières suffit à voir le mélange.
- [`README.md`, son bloc « Statut »](https://github.com/theodubus/chess/blob/7aff607154c1f91d5057adf78c79606768c36270/README.md) : les 166 premières lignes.
- [`memory/canonical.md`, les faits](https://github.com/theodubus/chess/blob/7aff607154c1f91d5057adf78c79606768c36270/memory/canonical.md) : la forme d'un fait.

## Options

- `journal` — la réponse `valider`. Chaque section part, telle quelle, en une entrée du journal datée du jour du lot, comme les 70 Ko sortis de `CLAUDE.md` le 17 nov. ; une section plus grosse qu'un fichier de journal (plafond de 80 Ko) se découpe par sous-section — les deux plus grosses sont « N° 20 » (225 Ko) et « Ce qui est en vol le 23 sept. » (238 Ko). Retrouver un verdict dans six mois : la table des renvois donne l'identifiant, `socle show` affiche l'entrée, et les contrôles vérifient que chaque renvoi désigne une entrée qui existe. Le journal n'est pas chargé au démarrage : son volume ne pèse que sur la recherche. Effort : huit lots environ, une vingtaine de fichiers de journal de plus. Risque : faible, le texte part tel quel et chaque chiffre est relevé. Réversible : le texte reste entier ; le remettre ailleurs coûte de reprendre les renvois.
- `archives` — chaque famille de sections part, telle quelle, en un fichier d'un dossier d'archives à créer dans `memory/`, que le format du socle prévoit pour les « documents archivés tels quels » et que les contrôles ne lisent pas ; une entrée de journal par lot le dit. Retrouver un verdict : la table des renvois donne le fichier, puis une recherche dans ce fichier. Effort : cinq lots environ. Deux prix : aucun renvoi vers une archive n'est vérifié ; et le test des chiffres du banc, qui exige que chaque document citant la ligne du banc donne le nombre de nœuds actuel, lirait les anciens nombres des archives et tomberait. Il faudrait l'en écarter, comme il écarte déjà le journal ; c'est l'assouplir, sans risque réel pour un texte figé, et répondre `archives` vaut ton accord (B-0038). Réversible de même : les archives se versent au journal en reprenant les renvois.

## Conséquences

- Si tu valides (`journal`) : les lots s'enchaînent dans l'ordre dit, chaque fusion signalée au récap ; B-0038, sans archives à écarter, est abandonné.
- Si tu réponds `archives` : même ordre, archives à la place des entrées ; le test du banc écarte les archives, et B-0038 est fait.
- Si une ligne du tableau ou l'ordre ne te va pas : réponds `refuser` en la nommant ; la demande est réécrite avec ton changement.
- Sans réponse : la transition ne commence pas ; la mise à jour du socle et la reprise du moteur attendent.

## Recommandation

`journal`, c'est la réponse `valider` : chaque section citable par un identifiant que les contrôles vérifient, sans assouplir aucun test. Vérifié : les tailles, par un script sur le fichier de ce jour ; les plafonds, lus dans les garde-fous du socle ; l'archivage tel quel au journal, déjà fait pour `CLAUDE.md`. Supposé : le nombre de lots et de sessions.

## Réponses possibles

- `valider` — l'option `journal` : les lots s'enchaînent comme dit.
- `archives` — l'option `archives`, et les archives écartées du test du banc.
- `refuser` — une ligne du plan ou l'ordre ne va pas : la nommer.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
