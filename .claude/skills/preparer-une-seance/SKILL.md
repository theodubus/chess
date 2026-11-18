---
name: preparer-une-seance
description: Préparer une séance d'entraînement de réseaux NNUE sur la carte de Théo — les réseaux, leurs données, leurs attendus, le script ou les blocs qu'il lance —, puis la relever. À utiliser chaque fois qu'un réseau doit être entraîné, avant de solliciter Théo.
---

# Préparer une séance d'entraînement

La carte de Théo est la seule qui entraîne, et chaque séance lui coûte du
temps : elle se prépare entière d'avance, se lance sans surveillance, et
s'arrête d'elle-même sur la moindre faute. Ce que font les outils —
`tools/nnue-train`, la machine de Théo, les données de Leela — est dans
`tools/README.md`, « Entraîner un réseau » ; ce skill est la procédure des
séances de septembre à novembre 2026, dont le journal garde les récits.

## 1. Écrire la séance avant de la demander

- **Chaque réseau ne diffère de sa référence que par UN levier** —
  l'étiqueteur, le volume, la largeur, une recette —, et la séance le dit :
  un réseau dont deux leviers bougent ne mesure que leur mélange. Une
  architecture neuve s'entraîne contre une BASE entraînée sur les mêmes
  données.
- **Les données** : quelles générations, quels jobs appris, lus dans les
  registres `tools/<génération>-jobs.tsv` ; leur date d'expiration
  (F-0005) avant celle de la séance ; les comptes attendus, parties et
  positions, qui serviront à `--attendu`.
- **Les attendus**, écrits avant : la durée de chaque réseau par la séance
  précédente, la confrontation sous son critère, ce que les pertes
  pourront dire — elles ne se comparent qu'à données égales, et ne disent
  jamais la force.
- **La suite**, écrite avant elle aussi : la sonde des marges de chaque
  réseau (le skill `sonder-les-marges`), ses candidats, ses matchs et leur
  critère.

## 2. Vérifier avant de la donner

- `tools/nnue-train` compile avec `--locked` et passe ses tests à la tête
  de la branche, contre le runtime factice de bullet : cela ne dit rien de
  CUDA, que l'essai court éprouve.
- **L'entraîneur lit l'architecture dans le moteur** : une autre
  architecture s'entraîne à un autre état du moteur, un `git worktree` par
  architecture, au `main` du début de la séance, une seule ligne changée et
  vérifiée ; jamais le dépôt édité pendant qu'une séance tourne.
- Un script de séance s'éprouve sur de fausses données avant d'être donné :
  un `unzip` qui échoue ou un chemin faux coûtent une soirée à Théo.

## 3. La donner à Théo

- **Un script `tools/seance-<nom>.sh`**, sur le modèle du dernier, qui dit
  son usage en tête : un mode `essai` (contrôles, données, essai court) puis
  le vrai ; il reprend au réseau qui manque après une interruption, pousse
  chaque réseau sur `reseau/<nom>` dès qu'il passe TOUS ses contrôles, et
  ne laisse jamais la machine dans un état que Théo doit réparer.
- **Sinon, des blocs à coller dans le même terminal, dans l'ordre** :
  le dépôt à jour (`git pull --ff-only`, s'arrêter sur un fichier modifié) ;
  CUDA dans ce terminal ; les données ; l'essai court (`--superlots 1`) ;
  le vrai ; rapporter. Chaque bloc dit ce qu'il doit afficher, et quand
  s'arrêter et le dire.
- Les liens des artefacts, s'il faut les télécharger à la main, avec leur
  date d'expiration.

## 4. La relever

- Les données relues retombent **exactement** sur les résumés des jobs.
- Chaque confrontation tient son critère (`CLAUDE.md`, « ce réseau est
  celui qu'a entraîné bullet ») ; sinon le réseau ne se mesure pas.
- La durée et les pertes, confrontées à leurs attendus.
- Les réseaux, leur courbe de perte et la sortie du programme sont sous
  `reseaux/`, intégrés depuis la branche de Théo.
- Au journal, une entrée ; puis la suite écrite au point 1.
