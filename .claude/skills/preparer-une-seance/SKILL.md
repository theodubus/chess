---
name: preparer-une-seance
description: Préparer une séance d'entraînement de réseaux NNUE sur la carte de Théo — les réseaux, leurs données, leurs attendus, le script ou les blocs qu'il lance —, puis la relever. À utiliser chaque fois qu'un réseau doit être entraîné, avant de solliciter Théo.
---

# Préparer une séance d'entraînement

La carte de Théo est la seule qui entraîne, et chaque séance lui coûte du
temps : elle se prépare entière d'avance, se lance sans surveillance, et
s'arrête d'elle-même sur la moindre faute. Ce que font les outils —
`tools/nnue-train`, les données de Leela — est dans `tools/README.md`,
« Entraîner un réseau » ; la machine de Théo est F-0020 ; ce skill est la
procédure des séances de septembre à novembre 2026, dont le journal garde
les récits.

## 1. Écrire la séance avant de la demander

- **Chaque réseau ne diffère de sa référence que par UN levier** —
  l'étiqueteur, le volume, la largeur, une recette —, et la séance le dit :
  un réseau dont deux leviers bougent ne mesure que leur mélange. Une
  architecture neuve s'entraîne contre une BASE entraînée sur les mêmes
  données ; un réglage de recette se mesure directement contre le réseau
  qui joue, s'il n'en change que ce réglage.
- **Entraîner à la recette qui jouera** : l'optimum d'un réglage bouge
  avec les passes, et un écran à moitié de superlots mesure une recette
  que personne ne jouera. Les passes se comptent sur les positions GARDÉES
  par le filtre ; un nombre de superlots se mesure par deux entraînements,
  jamais par le point de sauvegarde d'un seul (le pas décroît vers le
  dernier superlot).
- **Les données** : quelles générations, quels jobs appris, lus dans les
  registres `tools/<génération>-jobs.tsv` ; un sous-ensemble se tire dans
  l'ordre de lancement, jamais au choix ; le job tenu à l'écart n'y entre
  jamais ; leur date d'expiration (F-0005) avant celle de la séance ; les
  comptes attendus, parties et positions, qui serviront à `--attendu`.
- **Une architecture neuve**, avant de demander la carte : la mise à jour
  incrémentale confrontée au recalcul sur des parties entières (un roi qui
  change de seau, les roques, la prise en passant, les promotions) ; les
  indices du moteur confrontés au CODE de bullet, pas à une lecture ; la
  taille du fichier calculée à la main, la formule retrouvée d'abord sur
  des fichiers que bullet a écrits ; le temps au rejeu.
- **Les attendus**, écrits avant : la durée de chaque réseau par la séance
  précédente, la confrontation sous son critère, ce que les pertes
  pourront dire — elles ne se comparent qu'à données égales, et ne disent
  jamais la force.
- **L'ordre** : le réseau le plus probable à embarquer d'abord, celui
  qu'on pourrait couper en dernier.
- **La suite**, écrite avant elle aussi : la sonde des marges de chaque
  réseau (le skill `sonder-les-marges`), ses candidats, ses matchs et leur
  critère.

## 2. Vérifier avant de la donner

- `tools/nnue-train` compile avec `--locked` et passe ses tests à la tête
  de la branche, contre le runtime factice de bullet : cela ne dit rien de
  CUDA, que l'essai court éprouve.
- **L'entraîneur lit l'architecture dans le moteur** : une autre
  architecture s'entraîne à un autre état du moteur, un `git worktree` par
  architecture, au `main` du début de la séance, les seules lignes voulues
  changées et comptées ; jamais le dépôt édité pendant qu'une séance tourne.
- **Un script de séance s'éprouve dans un bac à sable** — faux `cargo`,
  faux `gh`, dépôt distant local, fausses données aux bonnes tailles :
  l'essai, la séance entière, une panne simulée puis la relance, une
  relance qui ne refait rien, un téléchargement interrompu, `gh`
  déconnecté, un mode inconnu. **Le faux entraîneur imprime la sortie
  réelle du jour**, confrontée à une sortie récente : un faux resté à
  l'ancien format a laissé passer un contrôle qui refusait un réseau sain.

## 3. La donner à Théo

- **Un script `tools/seance-<nom>.sh`**, sur le modèle du dernier, qui dit
  son usage en tête, un mode `essai` puis le vrai :
  - **avant tout** : le dépôt sans fichier modifié et à jour, les données
    comptées, `gh` connecté, la place ; `CUDA_PATH`, à défaut le toolkit
    de F-0020, jamais plus récent que le pilote, et `LD_LIBRARY_PATH` sur
    lui — sinon le moteur peut charger la `libnvrtc` d'un autre —, ses
    `libcudart`, `libnvrtc` et `libcublas` ; `cargo`, que Théo installe
    par `rustup`, seul à lire la toolchain épinglée, jamais par `apt` ; un
    seul écart et rien ne part ;
  - **les données** téléchargées depuis le registre, chaque job dans un
    dossier temporaire renommé une fois complet, pour reprendre au job qui
    manque ;
  - **l'essai court** (`--superlots 1`) relit chaque octet des données
    avant le premier réseau, et sa durée annonce celle du vrai ;
  - **chaque réseau contrôlé** — `RÉSEAU PRÊT` au bon chemin, la
    confrontation, la relecture sur `--attendu`, **la ligne de recette
    entière** que l'entraîneur imprime : un réglage mal passé ne fait rien
    planter, il entraîne un autre réseau —, puis commité et poussé seul
    sur `reseau/<nom>` dès qu'il passe, même si un voisin échoue ;
  - **un réseau refusé est mis de côté, jamais effacé** : la relance le
    refait, et s'il était sain, il reste publiable à la main ;
  - relancé, il reprend au réseau qui manque et saute ce qui est poussé ;
    il bloque la mise en veille pendant qu'il tourne — ni le chargeur
    débranché ni le capot rabattu n'y sont couverts, ce qui se dit à Théo
    (F-0020) —, la demande à la fin si Théo l'a voulu, tourne sur une copie de lui-même s'il change de
    commit, et rend le dépôt sur `main` en sortant, quoi qu'il arrive ;
  - un push qui demanderait un mot de passe échoue sans bloquer : la
    branche reste commitée en local.
- **Sinon, des blocs à coller dans le même terminal, dans l'ordre** :
  le dépôt à jour (`git pull --ff-only`, s'arrêter sur un fichier modifié) ;
  CUDA dans ce terminal ; les données ; l'essai court ; le vrai, ses
  commandes enchaînées par `&&` pour qu'un échec arrête la suite, et
  `set -o pipefail` pour que le `tee` qui garde la sortie ne masque pas
  l'échec de l'entraînement ; rapporter.
  Chaque bloc dit ce qu'il doit afficher, et quand s'arrêter et le dire.
- Les points de sauvegarde à garder, s'il y en a, sur une branche à part
  (`reseau/<nom>-points`).
- Les liens des artefacts, s'il faut les télécharger à la main, avec leur
  date d'expiration : par `gh run download` ou un navigateur connecté, et
  chacun décompressé dans son dossier, `unzip` n'ouvrant qu'une archive.
- **Une séance n'est lancée que quand Théo le dit**, pas sur l'annonce
  qu'il va la lancer.

## 4. La relever

- Les données relues retombent **exactement** sur les résumés des jobs.
- Chaque confrontation tient son critère (`CLAUDE.md`, « ce réseau est
  celui qu'a entraîné bullet ») ; sinon le réseau ne se mesure pas.
- La durée et les pertes, confrontées à leurs attendus.
- Les réseaux, leur courbe de perte et la sortie du programme sont sous
  `reseaux/`, intégrés depuis la branche de Théo.
- **La perte tenue à l'écart** (`nnue-validation.yml`) : le contrôle des
  positions gardées du registre au chiffre près, des écarts appariés à une
  référence, des attendus écrits par étiqueteur du job tenu, et les biais
  dits d'avance — l'outil mesure sous la cible et le filtre par défaut. Un
  diagnostic : elle suit l'étiqueteur, et l'écart entre tenu et appris dit
  ce que le réseau retient. Elle n'a jamais décidé un match.
- **Chaque réseau devient un candidat** : le skill `embarquer-un-reseau`.
- Au journal, une entrée ; puis la suite écrite au point 1.
