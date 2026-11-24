---
name: embarquer-un-reseau
description: Faire d'un réseau NNUE entraîné le réseau qui joue — le candidat au code de sa référence, la confrontation à l'entraîneur, la sonde des marges, le match, puis, s'il gagne, la fusion et ce qui suit (les faits, la vitesse, la force, le balayage). À utiliser pour chaque réseau sorti d'une séance qui pourrait remplacer le réseau embarqué ; la séance elle-même suit preparer-une-seance.
---

# Embarquer un réseau

Un réseau mal branché ne fait rien planter : il joue mal. Chaque étape
ci-dessous a rattrapé, au moins une fois, une faute qu'aucune autre ne
voyait. Les règles sont dans `CLAUDE.md` (les invariants du réseau, « ce
réseau est celui qu'a entraîné bullet ») ; les récits des embarquements,
du n° 7 au n° 20, au journal. Ce skill appelle les skills `sonder-les-marges`,
`lancer-un-match`, `rendre-un-verdict`, `mesurer-l-inference` et
`situer-le-moteur`, sans les recopier.

## 1. Le candidat

- **Le réseau est celui qu'a entraîné bullet** : la confrontation que
  `tools/nnue-train` imprime au bout de l'entraînement tient son critère
  (écart médian ≤ 15 centièmes, maximal ≤ 50) ; sinon, il ne se mesure pas.
- **`tools/candidat-reseau.py`** en fait l'embarqué : le réseau de
  `reseaux/`, le bloc de doc d'`EMBEDDED`, la table `CONFRONTATION` du test
  `le_reseau_embarque_evalue_comme_son_entraineur` recopiée de la sortie.
  Il ignore sans le dire une option qu'il ne connaît pas (B-0072) : **les
  tests `nnue` en release**, qui chargent le réseau embarqué, sont les
  seuls à le rattraper, et passent avant le commit, après
  `cargo fmt -p shallowred` (le script le demande en tête).
- **Au code de sa référence au bit près** : `git diff` sur `engine/` ne
  montre que `engine/src/nnue.rs`, plus `NETWORK_MARGIN_PERCENT`
  (`engine/src/search.rs`) si le candidat porte son facteur ; une
  référence plus ancienne que le code du jour se recommite sur lui. Une architecture neuve se mesure contre une
  base entraînée sur les mêmes données (skill `preparer-une-seance`).
- Le commit, puis sa révocation aussitôt, fusionnés en `merge`.

## 2. Avant le match

- **La sonde des marges** (skill `sonder-les-marges`) : le candidat joue au
  facteur de `main` (F-0008), ou porte le sien, mesuré d'abord.
- **Les nœuds par seconde au rejeu** (skill `mesurer-l-inference`,
  `--nps`) : un réseau plus large coûte du temps, et l'attendu du match
  en tient compte.
- **Le crible de mutation**, quand le code d'`engine/` change avec le
  réseau — une largeur, des seaux, une architecture : `mutation.yml` par
  `workflow_dispatch`, entrée `commit` sur le candidat, sa prédiction
  écrite avant. Un réseau seul, au code de `main` au bit près, n'en
  demande pas (N8tw50s800, N9w50s800).
- **Le match** (skill `lancer-un-match`) : contre le réseau qui joue, à
  `8+0,08`, son attendu et son critère écrits avant ; deux réseaux
  candidats contre la même base se départagent par leur match direct.

## 3. Le verdict

Par le skill `rendre-un-verdict`. Un gain démontré embarque le réseau :
révoquer la révocation, `tools/verify.sh` en entier, la pull request. Le
banc fait main ne bouge pas ; l'empreinte du réseau que vérifie
`tools/binaires.sh` change, et la CI exige la même sur les quatre
systèmes. La version web se republie seule (`pages.yml`).

## 4. Après l'embarquement

- **Les faits** : F-0007 (le réseau qui joue, ses données, son verdict),
  F-0008 si le facteur change ou se confirme ; une ligne de F-0009 si le
  réseau tranche un réglage de l'entraînement.
- **Le `README.md`** : ses « Remerciements » nomment chaque réseau qui a
  appris sur les données de Leela (ADR-0030) ; un tel réseau, embarqué,
  s'y ajoute, et la phrase sur les autres se récrit.
- **Le balayage de mutation après la fusion** (`mutation.yml`,
  `workflow_dispatch`), sa prédiction écrite avant : chaque fichier à son
  plafond quand seul le réseau a changé, les tests de recherche et le banc
  évaluant à la main ; sinon, ce qu'a rendu le crible.
- **La force absolue** (skill `situer-le-moteur`) : une série, puis F-0011.
- **Les données** : le réseau qui joue devient l'étiqueteur des
  générations suivantes (B-0024).
