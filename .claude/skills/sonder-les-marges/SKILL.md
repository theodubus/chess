---
name: sonder-les-marges
description: Mesurer le facteur des marges d'un réseau candidat avant son match d'embarquement, par la sonde de B8 (tools/attic/b8-sonde-marges.patch), et décider s'il se mesure au facteur en place ou s'il porte le sien. À utiliser pour chaque réseau qui sera mesuré contre le réseau qui joue, avant de lancer son match.
---

# Sonder les marges d'un réseau candidat

L'aspiration et l'élagage delta sont des marges en unités d'évaluation,
multipliées par le facteur du réseau qui joue (F-0008, `CLAUDE.md`,
« Invariants du moteur »). **Le facteur appartient au réseau** : un
candidat qui porterait des nombres plus grands jouerait son match à des
marges trop serrées, et le match mêlerait la valeur du réseau à celle de
ses marges. La sonde le dit avant le match ; ses règles viennent de B8 et
des embarquements d'octobre 2026, dont le journal garde les récits.

## 1. Les deux binaires sondés

- **Deux binaires, chacun avec la rustine `tools/attic/b8-sonde-marges.patch`
  par-dessus, chacun jouant SON réseau embarqué** : le candidat — `main`
  plus le seul commit qui change le réseau — et la référence — `main`, le
  réseau qui joue. C'est la seule forme qui vaille quand l'architecture
  change (largeur, seaux) : elle est fixée à la compilation, et un binaire
  refuse le réseau d'une autre (`engine/src/nnue.rs`).
- La rustine s'applique rarement telle quelle à un `main` qui a bougé :
  `git apply --check`, puis construire. **S'appliquer n'est pas compiler** ;
  une rustine corrigée retourne à l'attic, sa ligne de
  `tools/attic/README.md` mise à jour.
- La sonde n'écrit que si `SONDE_B8` désigne un dossier ; sans elle, chaque
  binaire se comporte comme son commit.
- À architecture égale seulement, un binaire peut jouer un réseau non
  embarqué par l'option `EvalFile`, et son lecteur le rejoue alors par
  `SONDE_B8_EVALFILE=<fichier .bin>` (la sonde du n° 7) ; sinon, les deux
  binaires.

## 2. Les parties

- 40 parties de chaque binaire contre lui-même à `8+0,08`, le livre du
  dépôt, `-srand 20260930`, même table, chacun avec `SONDE_B8` pointé sur
  son propre dossier.
- Zéro perte au temps, zéro anomalie, sinon la sonde ne se lit pas.
- **La faite main ne se rejoue pas** : ses journaux de référence sont
  `tools/references/sonde-b8-faite-main-2026-10-22.tgz`, à extraire. Une
  référence de mesure se garde dans le dépôt, jamais dans un dossier de
  session : ceux d'avant le 22 oct. 2026 ont été perdus ainsi.

## 3. Le critère, écrit avant la sonde

- `tools/sonde-b8/facteurs.py <binaire> <dossier réseau> <dossier faite
  main>`, que la rustine apporte, rejoue hors partie les captures
  journalisées et compte les itérations d'aspiration ; il rend, pour
  l'élagage delta et pour l'aspiration, le plus petit facteur qui ramène
  le taux fautif du réseau sur celui de la faite main. Il se lance deux
  fois, chaque binaire sur ses propres journaux, contre la MÊME faite main.
- **La lecture est relative** depuis le 22 oct. 2026 : le candidat contre
  le réseau qui joue, dans les mêmes conditions, marge par marge. La grille
  est grossière — un facteur delta repose sur une poignée de captures
  fautives, et saute d'un cran pour une capture.
- **Le critère s'écrit avant de lancer**, avec cette grossièreté pour
  tolérance. Par défaut, la règle d'origine transposée : la moyenne
  géométrique des deux facteurs égalisants du candidat dans ± 25 % de celle
  du réseau qui joue ⇒ le candidat se mesure au facteur de `main`, et son
  commit ne change que le réseau. Au-delà, son facteur se règle d'abord,
  mesuré comme un changement de code, et le candidat porte le réseau ET son
  facteur.
- Le facteur ne porte que l'aspiration et l'élagage delta (`scaled_margin`) ;
  la futilité et la marge singulière, posées en unités du réseau
  (`network_margin`), ne le suivent pas, et la sonde ne les mesure pas : un
  candidat d'une échelle nettement autre les déplace, ce qui se dit dans
  son protocole.
- Un taux très bas, à quelques élagages près, ne s'égalise plus : le dire,
  et lire la marge par l'autre colonne.

## 4. Inscrire

- Au journal, une entrée : les deux réseaux, leurs taux par marge, la
  décision ; la rustine, si elle a changé.
- **F-0008** si le facteur change ou si un réseau embarqué le confirme.
- Le sujet du réseau (son embarquement) coche la case de la sonde.
