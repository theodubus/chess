# attic — le code mesuré, rejeté, et gardé quand même

Des rustines, pas des commits. C'est le point.

## Pourquoi ce répertoire existe

Le projet retire tout changement qu'un SPRT rejette — le protocole l'exige, et
c'est ce qui l'empêche d'accumuler du code « au cas où ». Mais plusieurs de ces
rejets sont **conditionnels**, et la documentation le dit : *« PVS tel qu'écrit,
empilé sur LMR et le coup nul, à `1+0,01` »* est réfuté ; *« PVS en général »*
ne l'est pas.

Un rejet conditionnel se rouvre. Encore faut-il retrouver le code.

La pratique était de désigner le commit : *« le code retiré reste lisible dans
`15028fa` »*. **Elle a cassé le 16 sept. 2026** — une fusion en squash a
supprimé la branche, et `498a01a` est devenu introuvable ; la première
exécution de `match.yml` a échoué dessus.

Un fichier versionné ne peut pas subir ça. Il survit aux squashs, aux
suppressions de branche, aux politiques de collecte, et se lit sans accès
réseau.

## Ce qu'il y a dedans

| rustine | ce que c'est | verdict | s'applique sur `main` ? |
|---|---|---|---|
| `c12-pvs.patch` | recherche à variante principale | **H0**, −10,9 Elo ± 7,9, 4214 parties, `1+0,01` | **non** — écrite sur un `search.rs` de trois jours plus vieux |
| `c17-lmp.patch` | élagage par compte de coups, seuil `6 + d²` | **H0** deux fois, −25,2 puis −12,6, `1+0,01` — **mais +15,3 à `8+0,08`** | **oui**, `git apply --check` passe |
| `c19-see-ordering.patch` | échange statique dans l'ordonnancement des coups | **pas de SPRT** — effet mesuré sous le seuil de résolution d'un job (~17 Elo), signe estimé négatif | **oui**, `git apply --check` passe, SUR l'élagage en quiescence |
| `d2-sonde-pv.patch` | sonde : les dégâts de LMP sont-ils sur l'épine PV ? | **pas un changement** — c'est la mesure qui a clos D2 sans match. 3,79 % des dégâts sur l'épine, soit ~1 Elo | **oui**, mais APRÈS `c17-lmp.patch` |
| `c18-sonde-echec.patch` | sonde : que resterait-il à gagner à une extension d'échec ? | **pas un changement** — 1,39 % de l'arbre, et 77 % des nœuds en échec sont déjà en quiescence. **Sizé, pas tranché** | **oui**, sur `main` |

```sh
git apply --check tools/attic/c17-lmp.patch   # toujours, avant d'appliquer
git apply         tools/attic/c17-lmp.patch
```

**`c12-pvs.patch` ne s'applique plus**, et c'est normal : elle date d'avant
l'ardoise de coups, l'élagage delta et la futilité inverse. Elle reste **un
document**, pas un bouton — la lire pour retrouver la structure, la porter à la
main. C'est vérifié, pas supposé : `git apply --check` échoue sur
`engine/src/search.rs:215`.

## Les deux sont rouvertes, et pas pour la même raison

**C17 — par la cadence.** Le même binaire rend −21,57 à `1+0,01` et **+15,30 à
`8+0,08`** (p = 0,0013). Les deux verdicts H0 valent pour une cadence où le
moteur atteint la profondeur 8,5 ; la cible est la force générale. Il manque un
SPRT à cadence longue, pas du travail d'écriture — le seuil est un `sed` d'un
caractère sur `LMP_BASE`.

**C12 — par son rôle.** Dans les moteurs forts, LMP et la futilité ne
s'appliquent **qu'aux nœuds hors variante principale**, et cette distinction,
c'est PVS qui la crée. Ce moteur n'en a aucune. Mesuré seul, PVS ne montre que
son coût de re-recherche ; c'est peut-être une infrastructure prise pour un
gain. Les trois quarts du plan factoriel PVS × LMP sont déjà mesurés — il
manque la case où les deux sont actifs.

## La règle

**Une rustine ici n'autorise rien.** Le protocole ne change pas : ce qui rentre
passe par un SPRT, à la cadence la plus longue qui rende encore un verdict.
Ce répertoire garantit seulement qu'on ne réécrira pas de mémoire un code déjà
écrit, testé et mesuré — et que la question restera rouvrable quand elle est
rouverte.

Y ajouter une rustine quand, et seulement quand, un rejet est **conditionnel**
et que la documentation nomme la condition. Un rejet sans condition n'a rien à
faire ici : il se referme.
