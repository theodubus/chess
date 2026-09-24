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
| `c12-pvs.patch` | recherche à variante principale | **H0**, −10,9 Elo ± 7,9, 4214 parties, `1+0,01` | `git apply --check` : **non** — écrite sur un `search.rs` de trois jours plus vieux. Portée à la main le 21 sept. sur le moteur post-C19 ; cette version-là est la rustine datée du 21 septembre. Celle-ci reste le document de référence pour la structure |
| `c17-lmp.patch` | élagage par compte de coups, seuil `6 + d²` | **H0** deux fois à `1+0,01` (−25,2 puis −12,6), puis **H1 à `8+0,08`, +22,85 ± 9,88 — FUSIONNÉ** (PR&nbsp;#21) | `git apply --check` : **non**, et c'est le signe que le rejet est levé — elle échoue parce que son code EST dans `main`. Document d'histoire, plus un bouton |
| `c19-see-ordering.patch` | échange statique dans l'ordonnancement des coups | **pas de SPRT** — effet mesuré sous le seuil de résolution d'un job (~17 Elo), signe estimé négatif | `git apply --check` : **oui**, SUR l'élagage en quiescence |
| `d2-sonde-pv.patch` | sonde : les dégâts de LMP sont-ils sur l'épine PV ? | **pas un changement** — c'est la mesure qui a clos D2 sans match. 3,79 % des dégâts sur l'épine, soit ~1 Elo | `git apply --check` : **oui**, directement sur `main` — la condition « après la rustine de C17 » est tombée avec la fusion de C17 |
| `c18-sonde-echec.patch` | sonde : que resterait-il à gagner à une extension d'échec ? | **pas un changement** — 1,39 % de l'arbre, et 77 % des nœuds en échec sont déjà en quiescence. Le dimensionnement a été suivi d'un match, voir ci-dessous | `git apply --check` : **non** — échoue sur `engine/src/search.rs:837` depuis la fusion de C17. La sonde reste lisible ; la rejouer demande de la porter |
| `c18-extension-echec.patch` | extension d'échec, bornée par le ply | **−5,01 Elo ± 8,11**, 3400 parties à longueur fixe, `8+0,08`, 21 sept. 2026 | `git apply --check` : **non** — C22 est entré dans `main` le 24 sept. et déplace le contexte de `negamax` où elle s'insère. À porter comme C22 l'a été, le jour où on la remesure |
| `c12-pvs-2026-09-21.patch` | PVS réécrit à la main sur le moteur post-C19 et post-LMP | **−0,82 Elo ± 8,19**, 3400 parties à longueur fixe, `8+0,08`, 21 sept. 2026 | `git apply --check` : **oui**, sur `main` |
| `d6-sonde-ordonnancement.patch` | sonde : que peut épargner un générateur par étapes ? | **pas un changement** — 85 % des coups générés par `negamax` ne sont jamais cherchés, mais l'ordonnancement ne pèse que 26,2 % du temps. Plafond **11,5 %**, soit **0,21 pli** | `git apply --check` : **oui**, sur `main` |
| `d6-sonde-pendule.patch` | sonde : que reste-t-il sur la pendule, et que vaut chaque raffinement de B2 ? | **pas un changement** — **46,9 % de la pendule inutilisée** en fin de partie, soit ~1,36 pli. « S'arrêter tôt sur un coup stable » **réfuté** aux deux cadences | `git apply --check` : **oui**, sur `main` — elle n'ajoute qu'un fichier |
| `d6-sonde-profondeur.patch` | sonde : combien de plis un doublement de vitesse achète-t-il ? | **pas un changement** — **1,36 pli par doublement**, stable sur quatre doublements. C'est l'unité qui rend les chantiers comparables | `git apply --check` : **oui**, sur `main` — elle n'ajoute qu'un fichier |
| `b9-troisieme-coin.patch` | **variante de MESURE**, pas un candidat : table empaquetée **non atomique**, capacité forcée, pour séparer les deux effets de `b9-table-atomique.patch` | **empaquetage seul −4,0 %** (33/44, p = 0,0013), **atomiques seules −0,2 %** (8/20, p = 0,65), les deux ensemble −4,3 %. *Le gain est entièrement l'empaquetage ; les accès atomiques ne coûtent rien.* Cohérence interne : −4,0 puis −0,2 composent −4,2 contre −4,3 mesuré | `git apply --check` : **non** — écrite contre la table d'avant B9 ; B9 fusionné, elle ne sert plus qu'à relire la mesure du troisième coin, sur `1b5afa8` |
| `b9-table-atomique.patch` | table de transposition **sans verrou**, entrées de deux mots atomiques (schéma XOR de Hyatt) — prérequis dur de B6 | **neutre, prouvé** : à capacité forcée égale le banc rend 114 028 et 635 210, exactement la référence. **Les atomiques ne coûtent rien, ils RAPPORTENT : −4,3 % de temps**, 15 paires sur 20, p = 0,0192 — la réserve « le coût est plat » est réfutée avec le signe opposé. L'effet de **capacité** (l'entrée passe de 24 à 16 octets, donc la table double) est un AUTRE changement, que le banc ne peut pas juger et qui attendait un match. **FUSIONNÉ le 23 sept. 2026** : l'effet de capacité vaut **−1,27 ± 6,34 Elo** à `8+0,08` sur 5 740 parties, pas d'effet décelable — fusionné au titre de l'infrastructure de B6 et de la vitesse prouvée, comme le critère écrit avant le disait | `git apply --check` : **non** — son code est ENTRÉ dans `main` le 23 sept. : un rejet levé, pas une régression |
| `c22-sonde-nulle-horizon.patch` | sonde : combien de positions nulles la recherche manque-t-elle à l'HORIZON, où le test de nulle venait après l'aiguillage vers la quiescence ? Contient son lecteur, `tools/sonde-c22/rejouer.py`, qui rejoue le régime réel d'un match — mêmes positions, mêmes pendules, table conservée — depuis un journal `-log engine=true` | **pas un changement** — **0,68 % des entrées en quiescence** sont des nulles manquées (répétition 0,60 %, cinquante coups 0,08 %), soit **40 % de toutes les positions nulles rencontrées**. ~2 600 recherches rejouées, 23 sept. 2026 | `git apply --check` : **non** — elle instrumentait aussi l'impression de `bestmove`, que le ponder a réécrite. La rejouer demande de porter ce bloc sur `bestmove_line` ; le lecteur, lui, est inchangé |
| `c22-nulle-horizon.patch` | **REJETÉ PAR SON CRITÈRE sur la base à fausses nulles — REMESURÉ sur C23 et FUSIONNÉ le 24 sept.** dans sa version portée, ligne suivante : le test de nulle passe avant l'aiguillage vers la quiescence, et la règle des cinquante coups cède devant le mat. Avec ses trois tests, qui échouent sur l'ancien code. Même contenu que le commit `05a9dc4`, révoqué aussitôt pour ne pas retenir la branche | **−10,44 ± 6,34 Elo**, 5 760 parties à `8+0,08`, 23 sept. 2026 — **régression significative, non fusionné**. 92 % des nulles qu'il ajoute à l'horizon sont fausses (C23) : à remesurer sur C23 (voir `tools/README.md`, section C22) | `git apply --check` : **non** depuis la fusion de C23, qui a réécrit le corps d'`is_repetition` juste avant l'endroit où il s'insère ; son code est entré, porté, par la ligne suivante |
| `c22-nulle-horizon-sur-c23.patch` | **FUSIONNÉ le 24 sept.** : le code de `c22-nulle-horizon.patch` à l'identique, porté sur `main` d'après C23 — le test de nulle avant l'aiguillage vers la quiescence appelle la fenêtre bornée au dernier coup nul. Même contenu que le commit `cd45ffa`, révoqué aussitôt, puis rétabli par révocation de la révocation | **+3,98 ± 6,26 Elo** en commun, 5 758 parties à `8+0,08` — deux matchs hétérogènes (+10,86 et −2,90, z = 2,15, runners étalonnés à 0,3 % près) ; aucune borne haute sous zéro dans aucune lecture : **fusionné au titre de la règle**, aucun gain revendiqué (voir `tools/README.md`, section « C22 sur C23 ») | `git apply --check` : **non** — son code est entré dans `main` |
| `c23-sonde-fenetre-coup-nul.patch` | sonde : combien des répétitions que voit la recherche ne tiennent qu'en remontant AU-DELÀ d'un coup nul ? Contient son lecteur, `tools/sonde-c23/` — `rejouer.py`, copie de celui de C22, et `sommer.py` | **pas un changement** — **87,8 %** des répétitions intérieures et **92,1 %** de celles de l'horizon sont fausses, à 87 à 95 % par deux coups nuls consécutifs. 30 parties à `8+0,08`, régime réel, 23 sept. 2026 | `git apply --check` : **non** depuis la fusion de C23 — elle instrumente le corps d'`is_repetition` que C23 a réécrit ; à rejouer sur `3236f12~2` |
| `c23-fenetre-coup-nul.patch` | **FUSIONNÉ le 23 sept. 2026** : la fenêtre de répétition s'arrête au dernier coup nul, comme `pliesFromNull` chez Stockfish. Avec ses quatre tests, et quatre défauts injectés tous attrapés. Même contenu que le commit `3236f12`, révoqué aussitôt pendant la mesure | **+2,65 ± 6,40 Elo**, 5 760 parties à `8+0,08` — pas d'effet décelable, fusionné au titre de la règle comme le critère écrit avant le disait (voir `tools/README.md`, section C23) | `git apply --check` : **non** — son code est entré dans `main` : un rejet levé, pas une régression |
| `d5-retrait-delta.patch` | candidat de **RETRAIT** de l'élagage delta en quiescence — à ne jamais fusionner | **PAS DE VERDICT** — SPRT tué par le plafond du job à 3 738 parties. Retrait **−1,49 ± 7,83**, IC `[−9,3 ; +6,3]`, LLR 0,06 sur ±2,94, bornes `[-5, 0]` à `8+0,08`. Un SPRT arrêté par l'horloge est biaisé **vers zéro** : la vraie valeur est plus négative que −1,49, jamais moins. L'élagage **reste dans `main`** | `git apply --check` : **oui**, sur `main` |
| `d6-sonde-budget.patch` | sonde : quelle formule de budget épuise la pendule, et ce qu'elle vaut | **pas un changement** — corrige un chiffre publié : dépenser la pendule vaut **0,54 à 0,70 pli**, pas ~1,36. Le budget par coup ne monte que de **× 1,32** et **sature** au plafond d'une allocation plate | `git apply --check` : **oui**, sur `main` — elle n'ajoute qu'un fichier |

**La dernière colonne n'est pas de la prose : elle est vérifiée.**
`engine/tests/rustines_attic.rs` confronte chaque `oui` / `non` au vrai
`git apply --check`, dans les deux sens — une rustine non déclarée et une
déclaration sans rustine font échouer autant qu'un verdict faux. C'est un
critère d'acceptation, donc il tourne en CI et par `tools/verify.sh`.

```sh
git apply --check tools/attic/c17-lmp.patch   # toujours, avant d'appliquer
git apply         tools/attic/c17-lmp.patch
```

**`c12-pvs.patch` ne s'applique plus**, et c'est normal : elle date d'avant
l'ardoise de coups, l'élagage delta et la futilité inverse. Elle reste **un
document**, pas un bouton — la lire pour retrouver la structure, la porter à la
main. C'est vérifié, pas supposé : `git apply --check` échoue sur
`engine/src/search.rs:215`.

## Les deux étaient rouvertes ; aucune ne l'est plus

**C17 est CLOS par une acceptation — la seule du répertoire.** <s>Il manque un
SPRT à cadence longue, pas du travail d'écriture.</s> Ce SPRT a été acheté le
21 sept. 2026 : **+22,85 ± 9,88 sur 2436 parties à `8+0,08`, H1**, et le seuil 6
est **fusionné dans `main`** par la PR&nbsp;#21. Le rejet conditionnel a été levé
dans le seul sens qui ferme une question — par une mesure au régime visé.

**Conséquence sur la rustine, et elle est exactement inversée.** Tant que C17
était retiré, `c17-lmp.patch` s'appliquait ; maintenant que son code est dans
`main`, **elle n'y applique plus**. Le projet garde ici « ce que le dépôt n'a
plus » : une rustine qui cesse de s'appliquer parce que son code est entré n'a
plus de raison d'être un bouton. Elle reste comme **document** — le seuil `12 +
d²`, lui aussi H1 (+17,24 ± 8,51) et non retenu, est toujours un `sed` d'un
caractère, mais sur le `LMP_BASE` de `main` désormais, pas sur cette rustine.

### Trois lignes de la table étaient fausses, et rien ne les gardait

**Vérifié le 22 sept. 2026 par `git apply --check` sur les sept rustines**, pas
relu : `c17-lmp.patch` et `c18-sonde-echec.patch` étaient annoncées applicables
et ne l'étaient plus, et la condition « APRÈS `c17-lmp.patch` » de
`d2-sonde-pv.patch` était devenue fausse. Les trois ont la **même cause
unique** : la fusion de C17 a déplacé `engine/src/search.rs` sous elles.

C'est le piège du renvoi périmé, dans sa forme la plus coûteuse : ce répertoire
existe pour qu'on ne réécrive pas de mémoire un code déjà écrit, et une colonne
« s'applique sur `main` ? » fausse envoie précisément faire ce travail-là.
**La source de vérité de cette colonne n'est pas la relecture, c'est
`git apply --check`** — une commande, sept secondes :

```sh
for p in tools/attic/*.patch; do
  git apply --check "$p" 2>/dev/null && echo "applique  $p" || echo "échoue    $p"
done
```

**À relancer après toute fusion qui touche `engine/src/`**, et à inscrire dans
la table. Aucun dispositif ne le fait aujourd'hui.

### C12 est clos le 21 septembre 2026, et cette fois sans condition

**Mesuré à la cadence cible, sur la base post-C19 et post-LMP, code réécrit à
la main : −0,82 Elo ± 8,19** sur 3400 parties. L'intervalle `[−9,0 ; +7,4]`
est centré sur zéro.

Ce chiffre **corrige le premier plus qu'il ne le confirme**. PVS n'est pas un
coût de 11 Elo : c'est un **néant**. Son économie de nœuds (÷1,07) et son coût
de re-recherche s'annulent, et il ne reste rien.

Et les deux motifs de réouverture sont épuisés :

- **par son rôle** — réfuté le 21 sept. au matin : l'épine PV porte 3,79 % des
  montées d'`alpha` que LMP détruit, soit ~1 Elo ;
- **par la cadence** — mesuré le 21 sept. au soir : à `8+0,08`, zéro.

**Il n'y a plus de condition nommée, donc plus rien à rouvrir.** La rustine
reste ici parce qu'elle a coûté du travail et qu'un futur changement de la
recherche pourrait un jour lui redonner de la matière à couper — mais ce serait
une question neuve, pas la réouverture de celle-ci.

<details><summary>Le raisonnement d'avant, conservé</summary>

**C12 — <s>par son rôle</s> par la cadence.** <s>Dans les moteurs forts, LMP et
la futilité ne s'appliquent qu'aux nœuds hors variante principale, et cette
distinction, c'est PVS qui la crée.</s> **Ce motif est RÉFUTÉ depuis le
21 sept. 2026** : la sonde `d2-sonde-pv.patch` a mesuré que l'épine PV porte
**3,79 % des montées d'`alpha` que LMP détruit**, donc que ce gatage vaut ~1 Elo
sur les 23 que LMP rapporte. Le mécanisme existe — une coupe sur l'épine est
4,8 fois plus dangereuse qu'ailleurs — et il est un ordre de grandeur trop petit
pour ce qu'il devait expliquer.

Le motif qui reste, et il est plus fort, est **la cadence**. PVS a été rejeté à
`1+0,01` (−10,89 ± 7,91), pré-D1. LMP, rejeté DEUX fois à la même cadence, est
accepté deux fois à `8+0,08`. L'écart que PVS aurait à combler est trois fois
plus petit que celui qu'a comblé LMP.

**Une raison fausse bloque le bon chantier la prochaine fois** : elle aurait
fait acheter un SPRT sur la paire PVS + LMP, six heures pour répondre à une
question déjà close.

</details>

## Ce qui a été mesuré SUR une combinaison, et qui ne tient dans aucune rustine

Le 21 sept. 2026, une branche `mesure/c18-c12-ensemble` a porté les deux
rustines C18 et C12 en même temps, pour compter les nœuds des quatre coins.
Elle ne contient aucun code propre et n'a donc pas de rustine à elle — mais
elle a rendu deux faits que sa suppression effacerait, et qu'une session qui
rouvrirait l'une des deux fiches redécouvrirait à ses frais.

| arbre | nœuds au banc, profondeur 7 |
|---|---|
| `main` | 114 028 |
| + C18 seul | 131 977 (× 1,157) |
| + C12 seul | 106 820 (÷ 1,067) |
| **+ les deux** | **127 108** |

**Les deux mécanismes ne sont pas indépendants.** Le produit des deux rapports
prédit 123 634 ; la mesure rend **127 108, soit +2,8 %**. Autrement dit
**l'économie de nœuds de PVS tombe de 6,3 % à 3,7 % en présence de
l'extension d'échec** : l'extension allonge les lignes forcées, où la fenêtre
nulle a le moins à couper. *(Vérifié par exécution le 22 sept. 2026, avant de
supprimer la branche — pas recopié d'un souvenir.)*

**Et la combinaison casse un test que C12 apporte et fait passer.**
`la_fenetre_nulle_rend_le_meme_score_que_la_fenetre_pleine` naît avec la
rustine PVS et passe sur `mesure/c12-pvs` ; empilée sous C18, elle échoue avec
**52 contre 51** sur
`r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1`. *(Les deux
exécutions faites le 22 sept. 2026, l'une après l'autre.)*

Ce n'est pas une régression de C18 : c'est l'**instabilité de fenêtre déjà
mesurée** — sur `main`, sans une ligne de PVS, le score d'un pari diffère de
celui de la fenêtre pleine dans **8,3 %** des cas, mesuré sur 153 positions et
trois paris chacune, élagage par compte désactivé comme dans le test — à
laquelle un second changement d'arbre donne une occasion de plus de se
manifester. **Une propriété qu'un test assertait sur UNE position redevient
fausse dès qu'on empile**, et c'est le piège que le dépôt a déjà payé sur les
gardes d'aspiration : un contrôle qui suppose une propriété doit la COMPTER
sur un échantillon.

## La règle

**Une rustine ici n'autorise rien.** Le protocole ne change pas : ce qui rentre
passe par un SPRT, à la cadence la plus longue qui rende encore un verdict.
Ce répertoire garantit seulement qu'on ne réécrira pas de mémoire un code déjà
écrit, testé et mesuré — et que la question restera rouvrable quand elle est
rouverte.

Y ajouter une rustine quand, et seulement quand, un rejet est **conditionnel**
et que la documentation nomme la condition. Un rejet sans condition n'a rien à
faire ici : il se referme.

**Et jamais un candidat de RETRAIT rejeté.** Les campagnes de revalidation (D5)
construisent des branches qui retirent un acquis pour le remesurer ; quand le
verdict est `H0` — l'acquis paie toujours — il n'y a rien à conserver, puisque
le code est resté dans `main`. C'est l'inverse exact de la raison d'être de ce
répertoire : on garde ici ce que le dépôt n'a plus. Les candidats
`mesure/sans-aspiration` (16 sept.) et `mesure/d5-trois-termes` (22 sept.) n'y
figurent donc pas, et leur absence n'est pas un oubli. Ce qu'il faut pour les
reconstruire tient dans la ligne de verdict : le commit de référence, le commit
candidat, et le nombre de nœuds du banc — qui vérifie qu'on a bien reconstruit
le même binaire.

**Vérifié le 23 sept. 2026, et le paragraphe ci-dessus était vrai d'un cas sur
deux.** `d5-trois-termes` porte bien ses trois éléments (candidat `adcbd14`,
référence `091e75e`, banc 88 495) ; **`sans-aspiration` n'en porte aucun** — sa
ligne de verdict ne donne que l'Elo, l'effectif et l'étalonnage. Le
reconstruire reste trivial (retirer l'aspiration de `main`), mais **rien ne
permettrait de vérifier qu'on a rebâti le même binaire**. C'est une perte
réelle et petite, inscrite plutôt que passée sous silence ; elle ne se répare
pas, le commit étant collecté.

**Un candidat de retrait NON TRANCHÉ, lui, se dépose** — et c'est pourquoi
`d5-retrait-delta.patch` est dans la table ci-dessus sans contredire la règle.
L'exclusion vise les candidats **rejetés** : quand `H0` est accepté, l'acquis
paie et le code est resté dans `main`, donc il n'y a rien à garder. Le SPRT de
delta a **expiré sans verdict** : la question reste ouverte, quelqu'un voudra
la reprendre, et refaire le diff de tête coûterait plus que de le lire.

### Ce que la suppression des branches `mesure/*` a réellement coûté

**Aucun code de production.** Vérifié branche par branche le 23 sept. 2026 :

| branche supprimée | ce qu'elle portait | récupérable ? |
|---|---|---|
| `mesure/c12-pvs` | changement | **oui** — `c12-pvs.patch` et `c12-pvs-2026-09-21.patch` |
| `mesure/c18-extensions-echec` | changement | **oui** — `c18-extension-echec.patch` |
| `mesure/c18-c12-ensemble` | combinaison des deux | **oui** — appliquer les deux rustines ; ses nœuds sont dans la table ci-dessus |
| `mesure/sans-aspiration` | retrait, **H0** | le code est dans `main` ; **le handle de vérification manque** |
| `mesure/d5-trois-termes` | retrait, **H0** | le code est dans `main` ; SHA et banc inscrits |
| `mesure/see-instrumentation` | **sonde** pour C19 | **non — le code est perdu.** Ses RÉSULTATS survivent dans la fiche C19 (57,2 % des captures notées paient un appel à `see`, et les nœuds des trois paliers). Elle aurait dû être une rustine : c'est la règle « une sonde jetable vit dans sa rustine », écrite *après* |

**Et la raison pour laquelle rien n'est récupérable est mesurée, pas
supposée** : `git fetch origin adcbd14` rend `INATTEIGNABLE`. **Aucune branche
`mesure/*` n'a jamais eu de pull request** — vérifié sur les trente-huit PR du
dépôt — donc `refs/pull/N/head` ne les protégeait pas, et leurs commits ont été
collectés.
