<!-- socle: couche=demandes zone=publique -->
# D-0020 — Découper la transition de tools/README.md et du README.md vers la mémoire

> date : 2026-11-17

## Décision demandée

Comment ranger ce que `tools/README.md` et le `README.md` de la racine portent encore, chaque information selon sa nature et l'usage qu'on en aura, pour que l'agent ne perde pas de vue ce dont le travail dépend.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, qui parle UCI (le protocole standard entre une interface d'échecs et un moteur), avec une interface en TypeScript ; le dépôt est à toi. L'agent qui écrit cette demande est l'assistant qui travaille sur le moteur et sa mémoire.

**Le chantier.** Le socle, installé le 11 nov. 2026, tient la mémoire du projet en fichiers, dans `memory/`, en couches, et vérifie leurs règles à chaque commit. Le 17 nov., tu as demandé de finir de l'adopter avant de reprendre le moteur, en scindant `tools/README.md` pour que « chaque info de memoire a sa place », puis de mettre le socle à jour ; le `README.md` de la racine suit. La feuille de route qui restait dans `tools/README.md` en est sortie : chaque ligne ouverte est au backlog, ou dans la « longue traîne » des idées non décidées, que tu as voulue hors du backlog le 12 nov.

**La question.** Ces fichiers mêlent la documentation des outils à 1,5 Mo de récits de mesures. Une première version de cette demande les rangeait surtout par volume ; tu as demandé, avant de répondre, si elle séparait bien les choses selon leur nature et l'usage qu'on en aura, le journal étant moins lu que le chantier actif ou le backlog. Elle ne le faisait pas assez : verser les récits entiers au journal y enterrait des faits et des procédures dont le travail dépend. Voici le rangement corrigé.

**Ce que l'agent voit, et quand.** À chaque démarrage, sont injectés `CLAUDE.md` (les règles de travail), les faits (`memory/canonical.md`), le chantier actif (`memory/active.md` : ce qui est en cours et la suite) et l'état calculé (branche, CI, demandes en attente, et les sujets « prêts » du backlog, dont rien d'ouvert ne bloque le départ : l'agent les enchaîne seul, sans attendre de message, ceux de priorité basse quand c'est commode). Les skills, procédures écrites dans `.claude/skills/`, se chargent quand la tâche correspond à leur description. `CLAUDE.md` renvoie à `tools/README.md` pour chaque outil. Le journal, lui, ne se lit qu'à la demande : par l'identifiant qu'un fait, une décision ou un renvoi cite, ou par une recherche. Ce qui guide le travail futur doit donc être dans une des couches injectées ; le journal garde le pourquoi et le comment d'hier. Les identifiants : B- un sujet du backlog, D- une demande comme celle-ci, ADR- une décision, F- un fait, J- une entrée du journal.

**Le rangement, par nature :**

| nature | exemples tirés de ces fichiers | où | quand l'agent le voit |
|---|---|---|---|
| règle de travail | « un verdict appartient à sa cadence » | `CLAUDE.md`, déjà | à chaque session |
| mode d'emploi d'un outil | les arbitres de matchs, `match.yml`, le livre d'ouvertures | reste dans `tools/README.md` | quand on se sert de l'outil |
| procédure qui se refait | lancer une séance d'entraînement sur ta carte, relever un match, mettre des matchs en commun, embarquer un réseau | un skill par procédure | chargé au moment de la refaire |
| fait dont le travail dépend | l'Elo d'un doublement du temps de réflexion, la part du réseau dans le temps d'un nœud, le stock de données d'entraînement, l'état de chaque réseau | un fait vérifié, avec sa preuve | à chaque démarrage |
| réglage ouvert | les 23 valeurs réglables du réseau et de la recherche, avec leur marge et leur prochain test | deux faits, une ligne par réglage | à chaque démarrage |
| travail décidé | la mesure du réseau à 512 unités | le backlog, déjà | l'état le calcule |
| idée non décidée | les tables de finale, `MultiPV`, la gestion du temps par un réseau : une quinzaine, aujourd'hui seulement au journal depuis le retrait de la feuille de route | un fait qui les liste, une ligne chacune, avec le renvoi à son récit | à chaque démarrage, sans que l'agent s'y mette seul |
| histoire : protocoles écrits avant de mesurer, verdicts, relèves, raisonnements | ce qui reste des 1,5 Mo une fois le reste extrait, dont le tableau des verdicts | le journal, une entrée par section, texte tel quel ; une table des anciens renvois dans `tools/README.md` mène de chaque ancien titre à son entrée, et les contrôles vérifient que chaque renvoi désigne une entrée qui existe | quand un fait ou une recherche y mène ; un verdict passé dont une règle dépend devient un fait |
| `README.md` de la racine | le bloc « Statut », des mesures dans les sections | un statut de dix lignes au présent, qui renvoie aux faits ; ses mesures rangées comme les autres ; restent la ligne du banc (le nombre de nœuds de référence, qu'un test vérifie dans chaque document qui la cite) et la mention d'attribution de Leela | lu par qui découvre le dépôt |

**La méthode, lot par lot.** Avant d'archiver une section, l'agent en extrait les faits, les procédures et les idées, et les pose à leur place ; seul le reste part au journal, entier. La relecture sans contexte de chaque lot vérifie l'extraction : un fait ou une procédure sans place bloque le lot. Un script relève chaque chiffre du texte d'avant et le retrouve après, comme pour `CLAUDE.md` le 17 nov. (218 chiffres, tous retrouvés).

**La limite à connaître.** Les faits ont un plafond de 16 Ko pour le fichier entier, parce qu'ils sont injectés à chaque démarrage et occupent la place de travail de l'agent ; ils en font 4,7. Les réglages en prendront environ 7, les idées 2 : il resterait 2 Ko pour les faits extraits des récits, et le dépassement est probable. Alors l'agent te demandera, à part, de relever ce plafond, réglage du socle que seul toi peux assouplir ; si tu refuses, seuls les faits dont une règle ou un sujet ouvert dépend restent, les autres vont au journal avec leur récit.

**L'ordre**, chaque lot en pull request que l'agent fusionne lui-même à CI verte, comme tu l'as décidé le 11 nov. : les réglages ouverts et la liste des idées, qui sont le plus utiles au travail ; le `README.md` ; les récits, en quatre ou cinq lots par période, chacun avec son extraction ; puis les verdicts, la table des renvois et les renvois de `CLAUDE.md` : sept à neuf lots. Supposé : quatre à six sessions, le moteur à l'arrêt d'ici là, puis la mise à jour du socle, dont la durée dépend de ce que sa nouvelle version change.

## Éléments cités

- B-0043@86b96cef — le sujet du backlog qui demande ce découpage.
- B-0041@c39b6981 — le jalon qui réunit les derniers sujets de l'adoption.
- B-0038@258d2161 — la question laissée à toi : écarter les archives du test des chiffres du banc, le jour où il en existe.
- D-0017@79902ee8 — ta décision du 17 nov. de scinder `tools/README.md` selon le socle.
- D-0004@07480d37 — tes hypothèses validées du 12 nov., dont la huitième : seul un test décidé devient un sujet du backlog.
- ADR-0030@65596e0a — l'admission des données de Leela, et la mention d'attribution qu'elle impose au `README.md`.

Le suffixe après `@` est l'empreinte de la version lue de chaque entrée.

## Où regarder

- [`tools/README.md`](https://github.com/theodubus/chess/blob/7aff607154c1f91d5057adf78c79606768c36270/tools/README.md) : la table des matières suffit à voir le mélange.
- [`README.md`, son bloc « Statut »](https://github.com/theodubus/chess/blob/7aff607154c1f91d5057adf78c79606768c36270/README.md) : les 166 premières lignes.
- [`memory/canonical.md`, les faits](https://github.com/theodubus/chess/blob/7aff607154c1f91d5057adf78c79606768c36270/memory/canonical.md) : la forme d'un fait, injecté à chaque démarrage.

## Options

- `valider` — le rangement ci-dessus. Effort : sept à neuf lots ; une vingtaine de fichiers de journal de plus, quelques skills, une vingtaine de faits. Risque : faible, chaque chiffre est relevé et chaque extraction relue. Réversible : le texte reste entier au journal ; changer une place coûte de reprendre ses renvois.
- `idees-au-backlog` — le même, mais chaque idée non décidée devient un sujet du backlog de priorité basse au lieu d'une ligne d'un fait. C'est revenir sur ta huitième hypothèse du 12 nov. : l'état les listerait parmi les sujets prêts, et l'agent les prendrait quand c'est commode, sans que tu aies décidé de les tester. Effort et risque égaux ; réversible de même.
- `archives` — le même, mais l'histoire va en quelques fichiers d'archives sous `memory/`, que le format du socle prévoit pour les « documents archivés tels quels » et que les contrôles ne lisent pas, au lieu du journal. Un ou deux lots de moins ; aucun renvoi vers une archive n'est vérifié. Le test de la ligne du banc ignore déjà le journal, dont les textes figés citent d'anciens nombres de nœuds ; il ne sait rien des archives, qu'il lirait, et tomberait. Les en écarter l'assouplit, ce que B-0038 t'a laissé : répondre `archives` vaut ton accord. Réversible : les archives se versent au journal en reprenant les renvois.

## Conséquences

- Si tu valides : les lots s'enchaînent dans l'ordre dit, chaque fusion signalée au récap ; B-0038, sans archives, est abandonné.
- Si tu réponds `idees-au-backlog` ou `archives` : même ordre, avec cette variante.
- Si une ligne du rangement ne te va pas : réponds `refuser` en la nommant ; la demande est réécrite.
- Sans réponse : rien de la transition ne commence ; la mise à jour du socle et la reprise du moteur attendent.

## Recommandation

`valider`. Vérifié : ce qui est injecté au démarrage et ce qui ne l'est pas, lu dans la section du socle de `CLAUDE.md` ; les tailles, par un script sur le fichier de ce jour ; les plafonds, lus dans les garde-fous du socle ; l'archivage tel quel au journal, déjà fait pour `CLAUDE.md`. Supposé : le nombre de lots, de faits et de skills, que l'extraction dira section par section.

## Réponses possibles

- `valider` — le rangement par nature : les lots s'enchaînent comme dit.
- `idees-au-backlog` — le même, les idées non décidées en sujets du backlog.
- `archives` — le même, l'histoire en archives, écartées du test du banc.
- `refuser` — une ligne du rangement ne va pas : la nommer.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
