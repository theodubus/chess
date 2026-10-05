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
| `c19-see-ordering.patch` | échange statique dans l'ordonnancement des coups | **pas de SPRT** — effet mesuré sous le seuil de résolution d'un job (~17 Elo), signe estimé négatif | `git apply --check` : **non** depuis la génération par étapes (A18, 24 sept. 2026) — elle s'insère dans la note des captures de `score_move`, déplacée dans `tactical_score`. Elle s'appliquait jusque-là SUR l'élagage en quiescence ; la remesurer demande de la porter sur l'étage tactique |
| `d2-sonde-pv.patch` | sonde : les dégâts de LMP sont-ils sur l'épine PV ? | **pas un changement** — c'est la mesure qui a clos D2 sans match. 3,79 % des dégâts sur l'épine, soit ~1 Elo | `git apply --check` : **non** depuis la génération par étapes (A18, 24 sept. 2026) — elle instrumente la boucle de `negamax`, qui tire désormais ses coups du `MovePicker`. Elle s'appliquait directement sur `main` de la fusion de C17 à A18 ; la rejouer demande de la porter |
| `c18-sonde-echec.patch` | sonde : que resterait-il à gagner à une extension d'échec ? | **pas un changement** — 1,39 % de l'arbre, et 77 % des nœuds en échec sont déjà en quiescence. Le dimensionnement a été suivi d'un match, voir ci-dessous | `git apply --check` : **non** — échoue sur `engine/src/search.rs:837` depuis la fusion de C17. La sonde reste lisible ; la rejouer demande de la porter |
| `c18-extension-echec.patch` | extension d'échec, bornée par le ply | **−5,01 Elo ± 8,11**, 3400 parties à longueur fixe, `8+0,08`, 21 sept. 2026 | `git apply --check` : **non** — C22 est entré dans `main` le 24 sept. et déplace le contexte de `negamax` où elle s'insère. À porter comme C22 l'a été, le jour où on la remesure |
| `c12-pvs-2026-09-21.patch` | PVS réécrit à la main sur le moteur post-C19 et post-LMP | **−0,82 Elo ± 8,19**, 3400 parties à longueur fixe, `8+0,08`, 21 sept. 2026 | `git apply --check` : **oui**, sur `main` — **reportée le 26 sept. 2026** sur l'inférence NNUE, qui ajoutait ses propres champs de test là où elle s'ancre : `git apply --3way`, deux conflits de contexte, et les mêmes lignes ajoutées et retirées, vérifié en comparant leurs multiensembles. **Son test `la_fenetre_nulle_rend_le_meme_score_que_la_fenetre_pleine` échoue sur `main`** — déjà sur `bfe92fb`, AVANT ce report, vérifié : elle s'applique, elle n'est pas pour autant un candidat prêt à mesurer |
| `d6-sonde-ordonnancement.patch` | sonde : que peut épargner un générateur par étapes ? | **pas un changement** — 85 % des coups générés par `negamax` ne sont jamais cherchés, mais l'ordonnancement ne pèse que 26,2 % du temps. Plafond **11,5 %**, soit **0,21 pli** | `git apply --check` : **non** — son objet est écrit : la génération par étapes (A18, 24 sept. 2026) a réécrit `ordered_moves` et la boucle de `negamax` qu'elle instrumente. Sa mesure reste celle qui a dimensionné A18, et se rejoue sur `d01183d` |
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
| `a18-generation-par-etapes.patch` | **FUSIONNÉ le 24 sept. 2026** : la génération par étapes (A18) — `negamax` tire ses coups d'un `MovePicker` par étages, le partage tactique/tranquille devient exact (la case de prise en passant n'est plus une cible que pour un pion, dans la quiescence aussi), cinq tests neufs et quatorze défauts injectés tous attrapés. Même contenu que le commit `087edb8`, révoqué aussitôt par `908ed46` | **+23,10 ± 6,39 Elo à `8+0,08`**, 5 740 parties, deux jobs homogènes mis en commun — gain démontré, fusionné au titre de son critère écrit avant (`tools/README.md`, section A18). Sonde : n/s × 1,09, +0,17 ± 0,07 pli. Hors partie : temps −10,7 à −11,3 %, arbre inchangé | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation, le 24 sept. 2026 : un rejet levé, pas une régression |
| `a20-continuation.patch` | **FUSIONNÉ le 25 sept. 2026** : A20, l'historique de continuation — chaque tranquille noté par le papillon plus sa note sachant chacun des deux coups qui précèdent le nœud, par pièce colorée et case d'arrivée ; la table apprend des mêmes coupures que le papillon, se conserve d'un coup à l'autre et se vide à `ucinewgame`. Cinq tests neufs. Même contenu que le commit `54e6c60`, révoqué le temps de sa mesure par `99df7ca` | **+12,56 Elo ± 4,35 à `8+0,08`**, 11 620 parties, quatre jobs homogènes (z ≤ 1,17), zéro perte au temps — gain démontré, fusionné sur son critère écrit avant (`tools/README.md`, section A20), au-dessus de ce que l'arbre seul promettait. L'arbre à la profondeur 10, rejoué sur 4 951 positions de parties, table conservée : **−3,1 %**, exactement celui de la variante `chk` de `a20-variantes-ordonnancement.patch` (305 090 247 nœuds). Crible au candidat : 39, les mêmes | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation : un rejet levé, pas une régression |
| `c24-laisser-finir-literation.patch` | **FUSIONNÉ le 24 sept. 2026** : C24, premier candidat de l'allocation inégale — l'échéance dure passe du budget à 2,2 budgets, la douce de 0,5 à 0,44, pour qu'une itération entamée ne soit presque plus jetée ; échéances extraites dans `deadlines_ms`, fonction pure testée. Même contenu que le commit `7274844`, révoqué le temps de sa mesure par `40afb49` | **+44,64 ± 6,24 Elo à `8+0,08`**, 5 760 parties, deux jobs homogènes (z = 0,12) — gain démontré, fusionné sur son critère écrit avant (`tools/README.md`, section C24). Sonde : temps × 1,00, plis −0,00 ± 0,09 — ce que l'écran prédisait (+0,05). **Le gain ne se voit pas en plis moyens ; il se voit dans l'accord avec l'oracle** (80,8 → 83,9 %), dont la lecture, +39 à +68, a tenu | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation, le 24 sept. 2026 : un rejet levé, pas une régression |
| `c24-sonde-allocation.patch` | sonde : où un surcroît de temps change-t-il la décision, et où un temps retiré ne coûte-t-il rien ? Parties entières, une table par camp ; avant chaque coup, une recherche prolongée jusqu'à six budgets depuis une COPIE de la table, rétablie ensuite. Contient son instrumentation (copie de la table, effort à la racine), la sonde `alloc-probe` et son lecteur `tools/sonde-alloc/analyser.py` | **pas un changement** — **18,7 % du temps dépensé était jeté** dans des itérations interrompues ; laisser finir l'itération vaut +0,65 pli d'écran (C24), la répartition par la stabilité +0,05 à +0,35 de plus. 60 parties à `8+0,08`, 6 400 coups, 24 sept. 2026. Section 6 du lecteur, ajoutée le même jour : C24 coup par coup — **+0,05 pli de profondeur moyenne**, accord 80,8 → 83,9 %. Section 7 : C25 — les probabilités par classe de stabilité, les douces calibrées au temps moyen de C24, et le supplément sur C24, moitiés tenues à l'écart | `git apply --check` : **oui**, sur `main` — et par-dessus C24 |
| `c25-stabilite.patch` | **FUSIONNÉ au verdict du 24 sept. 2026** : C25, par-dessus C24 — une échéance douce par classe de stabilité du coup (1,825 / 0,885 / 0,513 / 0,257 budget : il vient de changer, stable depuis 2 à 3 itérations, 4 à 6, 7 et plus), proportionnelle à la probabilité mesurée qu'une itération de plus le change ; la dure à 3 budgets, bornée par la pendule. Même contenu que le commit `41d590f`, révoqué le temps de sa mesure par `c4c356c` | **+7,87 ± 6,08 Elo à `8+0,08`**, 5 740 parties, deux jobs homogènes (z = 0,19), zéro perte au temps — gain démontré, fusionné sur son critère écrit avant (`tools/README.md`, section C25). Sous l'attendu (+12 à +25) : le taux de conversion de C24 ne s'est pas transféré, comme la réserve écrite avant le prévoyait | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation : un rejet levé, pas une régression |
| `c26-sonde-controle.patch` | sonde : que fait la gestion du temps aux coups qui précèdent un contrôle à coups comptés ? Aucune instrumentation du moteur — un lecteur de journal cutechess `-debug all`, `tools/sonde-controle/analyser.py`, qui porte aussi la commande du match à `40/8` | **pas un changement** — sur `main` avec C25, 60 parties à `40/8` le 24 sept. 2026 : **5,3 % des cycles affamés**, le 39ᵉ coup dépensant jusqu'à 97 % de sa pendule et laissant 50 ms au 40ᵉ ; à trois coups du contrôle, un coup à 96,7 %. Zéro perte au temps, marge minimale 44 ms. C'est le mécanisme que C26 corrige (`tools/README.md`, section C26) | `git apply --check` : **oui**, sur `main` — elle n'ajoute qu'un fichier |
| `c26-controle-annonce.patch` | **FUSIONNÉ le 25 sept. 2026** : C26 — quand l'interface annonce `movestogo` = n ≥ 2, la dure est bornée pour que chacun des n − 1 coups suivants garde au moins la moitié de sa part plate ; sans `movestogo` annoncé, rien ne change. Même contenu que le commit `6daf7d7`, révoqué le temps de sa mesure par `3189a95` | **+2,43 ± 6,01 Elo à `40/8`**, 6 000 parties, deux jobs homogènes (z = 0,83), zéro perte au temps — aucune borne haute sous zéro, fusionné au titre de la règle d'un correctif (`tools/README.md`, section C26). Sonde : 5,3 % de cycles affamés avant, aucun après | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation : un rejet levé, pas une régression |
| `a20-sonde-ordonnancement.patch` | sonde : que laisse l'ordre des coups tranquilles sur la table ? Compte l'étage des coupeurs et l'**union** des sous-arbres cherchés avant le coupeur — propagée de fils en père, la somme nœud par nœud comptant deux fois les emboîtements —, ventilée par étage ; et des rangs contrefactuels du coupeur sous cinq ordres, **biaisés vers l'ordre joué** : le coupeur est le premier qui coupe dans CET ordre (`tools/README.md`, section A20). L'arbre est inchangé au nœud près. Contient son lecteur, `tools/sonde-a20/analyser.py`, qui porte aussi la commande du match | **pas un changement** — 120 parties à `8+0,08`, 25 sept. 2026 : 81,8 % des coupures au premier coup, l'étage tranquille n'en rend que 4,9 % ; union 41,6 % des nœuds, dont **10,9 % dans l'étage tranquille, soit 0,23 pli au plus** pour un ordre parfait | `git apply --check` : **non** depuis la fusion d'A20 — écrite sur `main` d'avant la continuation, dont les champs et le contexte du sélecteur occupent les lignes qu'elle instrumente ; elle se rejoue sur `a08af76` |
| `a20-variantes-ordonnancement.patch` | **variante de MESURE**, pas un candidat : cinq raffinements de l'ordre des coups tranquilles dans un même binaire, choisis par la variable d'environnement `A20` — coup de réfutation (`cm`), continuation à un et deux plis vidée à chaque coup (`ch`) ou conservée (`chk`), papillon conservé (`hk`), malus du papillon (`malus`) ; sans elle, `main` au nœud près. Contient le rejoueur `tools/sonde-a20/rejouer-profondeur.py` : les parties d'un journal cutechess, chaque `go` remplacé par `go depth D`, table et historiques conservés d'un coup à l'autre | **pas un changement** — rejeu de 4 951 recherches à la profondeur 10, 25 sept. 2026 : **continuation conservée −3,1 %** de nœuds, seule sous le seuil de −2 % ; malus −1,2 % ; réfutation et continuation vidée +1,2 % ; papillon conservé +4,4 % (`tools/README.md`, section A20) | `git apply --check` : **non** depuis la fusion d'A20 — sa variante `chk` y est ENTRÉE, écrite proprement, et l'expérience touche les mêmes lignes ; elle se rejoue sur `a08af76` |
| `c27-distance-au-mat.patch` | **FUSIONNÉ le 25 sept. 2026** : C27, l''élagage par distance au mat à l'entrée de `negamax` — une borne de mat héritée ne remonte plus comme un score hors de portée, et la table ne reçoit plus rien hors de ±MATE. Le test `une_borne_de_mat_heritee_ne_sort_jamais_de_la_plage`, et l'assistant `max_abs_stored_score` de `tt.rs`. Même contenu que le commit `bb6e4c0`, révoqué le temps de sa mesure par `e5589d1` | **−3,56 ± 5,97 Elo** à `8+0,08` sur 5 760 parties, deux jobs homogènes, zéro perte au temps — aucune borne haute sous zéro, fusionné au titre de la règle d'un correctif ; banc identique au nœud près aux profondeurs 7 à 14 (`tools/README.md`, section C27) | `git apply --check` : **non** sur `main` — son code y est entré, par révocation de la révocation |
| `c27-sonde-hors-plage.patch` | sonde : combien de recherches stockent un score hors de ±MATE, et où l'élagage par distance au mat couperait — deux compteurs sur l'ancien code, émis en `info string sonde-c27` avant chaque `bestmove`, sans rien changer au jeu. Contient son lecteur, `tools/sonde-c27/lire.sh`, qui porte aussi la commande du match. Un troisième compteur, `bornee`, est inutilisable (il compte le bornage trivial d'une borne infinie) | **pas un changement** — 60 parties à `8+0,08`, 25 sept. 2026 : **1,82 % des recherches** stockent un score hors plage, le correctif couperait dans **4,80 %** (`tools/README.md`, section C27) | `git apply --check` : **non** sur `main` depuis la fusion de C27, dont elle instrumente les lignes ; elle se rejoue sur `3aa5986` |
| `a21-reseau-embarque.patch` | **FUSIONNÉ le 28 sept. 2026** : A21, étape 4 — le réseau du premier entraînement (`reseaux/shallowred-768x128-40.bin`, 768x128, 40 superlots) embarqué dans le binaire par `include_bytes!` et chargé une fois par `nnue::embedded`, évaluation par défaut de la couche UCI ; `EvalFile` annonce `<embedded>`, `<none>` rend la faite main, un chemin charge un fichier, la chaîne vide revient au défaut. `Search::new` évalue toujours à la main : le banc ne bouge pas. Le test `le_reseau_embarque_evalue_comme_son_entraineur` rejoue à chaque build la confrontation de l'étape 3. Même contenu que le commit `e944248`, révoqué le temps de sa mesure par `1a6c912`, rétabli par `5cf8f34` | **+330,61 ± 19,21 Elo à `8+0,08`** contre son parent, l'évaluation faite main — 2 000 parties, deux jobs homogènes (z = −1,21), zéro perte au temps : gain démontré, fusionné sur son critère écrit avant (`tools/README.md`, A21, « Étape 4 — VERDICT »). Crible au candidat : total 140, les mêmes survivants que `main` | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation : un rejet levé, pas une régression |
| `d6-sonde-budget.patch` | sonde : quelle formule de budget épuise la pendule, et ce qu'elle vaut | **pas un changement** — corrige un chiffre publié : dépenser la pendule vaut **0,54 à 0,70 pli**, pas ~1,36. Le budget par coup ne monte que de **× 1,32** et **sature** au plafond d'une allocation plate | `git apply --check` : **oui**, sur `main` — elle n'ajoute qu'un fichier |
| `n7-sonde-adjudication.patch` | sonde : l'adjudication de gain du générateur NNUE (`WIN_ADJ_SCORE`, 2 000) garde-t-elle sa prudence à l'échelle du réseau ? Le seuil se lit dans `SONDE_ADJ`, chaque partie imprime son numéro, son résultat, sa longueur et si elle a été adjugée ; les mêmes parties se rejouent sans adjudication. Contient son lecteur, `tools/sonde-n7/` — `rejouer.sh` et `lire.py` | **pas un changement** — 29 sept. 2026, 3 000 parties par passe : au réseau, **0,50 %** des parties adjugées finissent autrement jouées jusqu'au bout (8 nulles sur 1 603, aucun renversement), **0** à la faite main ; sous le critère de 2 %, la vague au réseau continue (`tools/README.md`, section n° 7) | `git apply --check` : **oui**, sur `main` |
| `c29-seaux.patch` | **FUSIONNÉ le 30 sept. 2026** : C29, les seaux — une clé désigne quatre entrées de seize octets alignées sur une ligne de cache ; une autre position prend la place de celle qui vaut le moins, sa profondeur moins huit par recherche écoulée (la règle de Stockfish 16, lue au tag `sf_16`) ; la même position garde la politique d'avant. Avec ses tests. Même contenu que le commit `90ac6e3`, révoqué le temps de sa mesure par `0ce32fc`, rétabli par `fc2c9cf` sans sa variante de mesure à 2 Mio (`2d44626`) ; le test d'emplacement du départage, écrit après le crible, est venu avec la fusion | **sous pression, 2 Mio des deux côtés : +30,13 ± 5,60 Elo** à `8+0,08` sur 6 000 parties — gain démontré dans chaque job (+36,62 et +23,66, z = 2,27, deux runners au même point de fonctionnement) ; **au défaut, 16 Mio : +1,85 ± 5,51**, aucune régression démontrée. Fusionné sur son critère écrit avant (`tools/README.md`, section C29) | `git apply --check` : **non** — son code est ENTRÉ dans `main` par la révocation de sa révocation : un rejet levé, pas une régression |
| `n7-sonde-angle-mort.patch` | sonde : le réseau, qui n'a vu aucune position d'avant le seizième demi-coup, décide-t-il moins bien en ouverture, à difficulté égale ? Pertes du réseau et de la faite main à 200 000 nœuds, jugées par Stockfish 16 à la profondeur 16, par tranche de demi-coups — parties du livre et vraies ouvertures ; le rapport des deux, la faite main pour témoin. Un script, `tools/sonde-angle-mort/sonde.py`, et son mode d'emploi | **pas un changement** — 30 sept. 2026, 1 482 positions : **pas d'angle mort décelable**, le rapport réseau / faite main vaut 0,77 à 0,84 de celui du milieu de partie en ouverture, intervalles contenant 1 (`tools/README.md`, section n° 7) | `git apply --check` : **oui** |
| `c31-nulle-quiescence.patch` | C31 : la quiescence teste la nulle par règle après chaque coup qui ne remet pas la pendule à zéro — en échec, une parade tranquille —, et empile chaque position sur le chemin comme `negamax`. Avec ses trois tests, qui échouent sur `main`, et le commentaire de `negamax` corrigé. Même contenu que le commit `5d8c68c`, révoqué le temps de sa mesure par `1e61ae3` | **ARRÊTÉ PAR SON CRITÈRE le 30 sept. 2026** — **−2,43 ± 5,36** en commun à `8+0,08` sur 6 000 parties, mais le match 1 seul, −7,88 ± 7,61, met la borne haute sous zéro ; le critère, écrit avant, se lit sur chaque match comme sur l'ensemble. Aucun coût démontré pour autant ; zéro avertissement de nulle côté candidat, cinq côté référence. Remesurer demande un fait technique neuf (`tools/README.md`, section C31) | `git apply --check` : **oui** |
| `c31-sonde-nulle-quiescence.patch` | sonde : combien de parades tranquilles la quiescence cherche-t-elle, et combien tombent sur une nulle par règle — répétition, cinquante coups, matériel insuffisant ? Compteurs remis à zéro à chaque `bestmove` et imprimés juste avant ; porte le correctif de C31 avec elle. Contient son lecteur, `tools/sonde-c31/sommer.py`, qui somme un journal fastchess `engine=true` | **pas un changement** — 30 sept. 2026, 40 parties à `8+0,08`, 4 686 recherches : **97 918 nulles par répétition et 37 991 par les cinquante coups**, 0,02 % des nœuds de quiescence, dans **61,4 % des recherches** (`tools/README.md`, section C31) | `git apply --check` : **oui** |
| `b8-sonde-marges.patch` | sonde : les trois marges en unités d'évaluation — futilité inverse, élagage delta, aspiration — couvrent-elles au réseau l'erreur qu'elles couvraient à la faite main ? Journalise, pendant de vraies parties, des nœuds de futilité et des captures de l'élagage delta choisis par compteur (variable `SONDE_B8`), et chaque itération à fenêtre. Contient ses lecteurs, `tools/sonde-b8/lire.py` — qui rejoue hors partie les nœuds et les captures — et `tools/sonde-b8/facteurs.py` — les facteurs qui égalisent les taux | **pas un changement** — 30 sept. 2026, 2 × 40 parties à `8+0,08` : l'élagage delta se trompe **24 fois plus** au réseau, l'aspiration échoue **2,66 fois plus** et y dépense 34 % des nœuds ; la futilité inverse tient. Facteurs qui égalisent : × 2,5 et × 2,0 (`tools/README.md`, section B8). **Rebasée le 1er oct.** sur le code fusionné de B8 : elle journalise la décision de l'élagage delta à la marge mise à l'échelle, et c'est elle qui remesure le facteur d'un nouveau réseau — **le 2 oct. pour N2L et L0** (2,60 et 2,61, dans la plage) : son lecteur rejoue un réseau non embarqué par `SONDE_B8_EVALFILE` | `git apply --check` : **oui** |
| `b8-marges-reseau.patch` | B8 : quand le réseau joue, l'aspiration et l'élagage delta — gain de la pièce prise et marge — prennent le facteur 2,24, moyenne géométrique des facteurs qui ramenaient leurs taux d'échec et de faute sur ceux de la faite main ; la faite main garde ses marges au bit près. Avec ses deux tests. Même contenu que le commit `791e6e4`, révoqué le temps de sa mesure par `6835c55` | **FUSIONNÉ le 1er oct. 2026** — **+50,50 ± 5,37** en commun à `8+0,08` sur 6 000 parties ; l'attendu, 0 à +25, réfuté par le haut (`tools/README.md`, section B8) | `git apply --check` : **non** — son code EST dans `main` depuis `b711a54`, la révocation révoquée : un rejet levé, pas une régression. Document d'histoire |
| `n9-sonde-coup-nul.patch` | sonde et variantes de MESURE du n° 9, choisies par la variable d'environnement `N9` — `gate` (coup nul seulement si l'évaluation statique atteint bêta), `r33` et `r34` (R = 3 + profondeur / 3 ou / 4), `iir`, et depuis le deuxième écran `imp-rfp`, `imp-lmp`, `imp-lmr` (*improving* dans la futilité inverse, l'élagage par compte de coups, LMR) et `see-cap` (une capture perdante sautée dans la recherche principale), et depuis le troisième écran `fp:a:b:dmax` (la futilité aux nœuds frontières, marge `a + b·d` en unités du réseau, jusqu'à la profondeur `dmax`), combinables par `+` ; sans elle, `main` au nœud près (banc 107 548). Compte les essais de coup nul, leurs coupures et les nœuds de leurs recherches — l'UNION, au coup nul le plus extérieur —, selon l'évaluation statique contre bêta, les nœuds de profondeur ≥ 4 sans coup de la table, la part des nœuds où *improving* est vrai, les captures que `see-cap` sauterait avec celles qui, cherchées, montent `alpha`, et, par profondeur 1 à 6 et par seau de 50 de l'écart `alpha − évaluation statique`, les coups tranquilles cherchés éligibles à la futilité et ceux qui montent `alpha` ; `info string sonde-n9` avant chaque `bestmove`. Contient son rejoueur, `tools/sonde-n9/rejouer.py` : le rejoueur d'A20, flux en parallèle, `go depth D` ou `go nodes N` | **pas un changement** — l'écran du 5 oct. 2026, 5 276 positions de parties à la profondeur 10 et 12 : 52 % des essais sous bêta, qui coupent 1,8 % du temps ; recherches de coup nul 20,0 puis 30,7 % de l'arbre ; arbres de chaque variante ; deuxième écran : *improving* vrai dans 78 % des nœuds, 53 % des captures éligibles sautables dont 0,5 % montent `alpha` ; troisième écran : la courbe de la futilité, une marge de 100 à la profondeur 1 saute 69 % des tranquilles éligibles et détruit 1,5 % des montées d'`alpha` (`tools/README.md`, n° 9) | `git apply --check` : **non** — C32, entré dans `main`, réécrit le coup nul que la sonde instrumente ; elle se rejoue au commit `1f99a69` |
| `c32-reduction-coup-nul.patch` | C32 : la réduction du coup nul croît avec la profondeur, `null_move_reduction(depth) = 3 + depth / 3`, avec son test. Même contenu que le commit `4270eef`, révoqué le temps de sa mesure par `467f707` | **FUSIONNÉ** — +40,90 ± 5,34 Elo à `8+0,08`, deux jobs homogènes contre `18a3805` ; rejeu −18,5 % à la profondeur 10, −26,5 % à la 12 (`tools/README.md`, n° 9) | `git apply --check` : **non** — son code est ENTRÉ dans `main` le 5 oct. 2026 : un rejet levé, pas une régression |
| `c32b-reduction-coup-nul-d4.patch` | C32b, le second point de C32 : `3 + depth / 4`. Même contenu que le commit `b52e0d3` pris depuis `main` — la rustine porte le code entier, pas l'écart à C32 —, révoqué par `610428f` | **gain, non retenu** — +38,31 ± 5,24 contre `18a3805` ; C32 l'emporte au point, comme le critère le disait d'avance | `git apply --check` : **non** — C32, entré dans `main`, réécrit les mêmes lignes |
| `c33-garde-coup-nul.patch` | C33 : le coup nul seulement si l'évaluation statique atteint bêta, `null_move_worth_trying`, avec son test ; l'évaluation du nœud calculée au plus une fois, partagée par la futilité inverse. Même contenu que le commit `94e84bb`, révoqué par `cd12cf2` | **gain** — +11,12 ± 3,68 contre `18a3805`, quatre jobs, l'amplitude hétérogène (+4,5 à +20,4) ; en attente du groupe de la composition | `git apply --check` : **non** — écrite sur `main` d'avant C32, qui en change le contexte — le coup nul dans `search.rs`, et les références du banc ; le commit reste atteignable, et c'est lui que la composition reprend |
| `c34-iir.patch` | C34 : la réduction itérative interne — un pli de moins sans coup de la table, à partir de la profondeur 4, hors racine — `iir_depth`, avec son test. Même contenu que le commit `99178f5`, révoqué par `f504a84` | **gain** — +7,50 ± 3,69 contre `18a3805`, quatre jobs ; en attente du groupe de la composition | `git apply --check` : **non** — écrite sur `main` d'avant C32, qui en change le contexte — le coup nul dans `search.rs`, et les références du banc ; le commit reste atteignable, et c'est lui que la composition reprend |
| `c35-improving-futilite.patch` | C35 : le drapeau *improving* — pile d'évaluations par ply, `is_improving`, l'évaluation du nœud partagée avec la futilité inverse — et son usage dans la futilité inverse, `rfp_depth` : un pli de marge de moins quand la position s'améliore. Même contenu que le commit `d0513da`, révoqué par `c3233e9` | **régression démontrée** — −8,51 ± 3,76 Elo contre `18a3805` à `8+0,08`, quatre jobs homogènes, borne haute −4,75 ; **non fusionné**, pour −16,9 % d'arbre (section « N° 9, deuxième écran — VERDICT ») | `git apply --check` : **non** — écrite sur `main` d'avant C32, qui en change le contexte — le coup nul dans `search.rs`, et les références du banc ; le commit reste atteignable, et c'est lui que la composition reprend |
| `c37-improving-lmr.patch` | C37 : le même *improving*, et son usage dans LMR, `late_move_reduction` : un pli de réduction de plus quand la position se dégrade. Même contenu que le commit `cefbcfb`, révoqué par `2550eec` | **sans effet décelable** — +0,75 ± 3,69 Elo contre `18a3805` à `8+0,08`, quatre jobs homogènes ; **non fusionné**, pour −16,6 % d'arbre (section « N° 9, deuxième écran — VERDICT ») | `git apply --check` : **non** — écrite sur `main` d'avant C32, qui en change le contexte — le coup nul dans `search.rs`, et les références du banc ; le commit reste atteignable, et c'est lui que la composition reprend |
| `c38-see-recherche-principale.patch` | C38 : à la profondeur ≤ 6, une capture qui perd plus de 100 × la profondeur à l'échange statique se saute dans la recherche principale, `see_prunable_main`. Même contenu que le commit `5b5c13e`, révoqué par `047f62b` | **gain** — +9,61 ± 3,71 Elo contre `18a3805` à `8+0,08`, quatre jobs ; en attente du groupe de la composition | `git apply --check` : **non** — écrite sur `main` d'avant C32, qui en change le contexte — le coup nul dans `search.rs`, et les références du banc ; le commit reste atteignable, et c'est lui que la composition reprend |
| `c39-futilite-frontieres.patch` | C39 : la futilité aux nœuds frontières — à la profondeur ≤ 6, un coup tranquille qui ne donne pas échec se saute quand l'évaluation du nœud plus `140 + 20·d`, en unités du réseau, n'atteint pas `alpha` ; la faite main en reçoit l'analogue par l'inverse du facteur de B8 (`network_margin`) ; l'évaluation du nœud partagée avec la futilité inverse ; et les références du banc. Même contenu que le commit `dfda892`, révoqué par `30256be` | **en mesure** — rejeu −26,6 % et −29,1 % ; match contre `18a3805` | `git apply --check` : **non** — les références du banc ont changé avec C32 ; son `search.rs`, lui, s'applique encore |
| `c36-improving-lmp.patch` | C36 : *improving* dans l'élagage par compte de coups — le seuil de `lmp_limit` quand la position s'améliore, la moitié sinon, calculé une fois par nœud (`lmp_threshold`), sur l'infrastructure de C35 ; et les références du banc. Même contenu que le commit `fd501a8`, révoqué par `a4f005b` | **gain** — +5,65 ± 3,75 Elo contre `18a3805` à `8+0,08`, quatre jobs ; en attente du groupe de la composition | `git apply --check` : **non** — écrite sur `main` d'avant C32, qui en change le contexte — le coup nul dans `search.rs`, et les références du banc ; le commit reste atteignable, et c'est lui que la composition reprend |
| `c36-sonde-compte.patch` | sonde de la mesure indépendante de C36 : le protocole exact de `lelagage_par_compte_retire_des_noeuds` — recherche froide, profondeur 7, faite main, avec et sans l'élagage — sur les positions d'un fichier, en test ignoré ; et `tools/sonde-c36/positions.py`, qui les extrait d'un journal cutechess `-debug all` | **mesure, pas de verdict** — sur `main`, l'élagage par compte grossit l'arbre de 661 des 4 684 positions de partie ; le test reformulé sur le banc (`0c14b63`), puis — une somme sur six positions bascule 2,7 % des fois — sur trente-six positions de parties (`556ecda`) | `git apply --check` : **oui** |
| `n9-sonde-futilite-inverse.patch` | sonde de la mesure indépendante du test de la futilité inverse, écrite pour la composition du n° 9 : le protocole exact de `la_futilite_inverse_retire_des_noeuds` — recherche froide, profondeur 7, faite main, avec et sans la futilité inverse — sur les positions d'un fichier, en test ignoré ; les positions se tirent par `tools/sonde-c36/positions.py` de `c36-sonde-compte.patch` | **mesure, pas de verdict** — sur `main`, la futilité inverse grossit l'arbre de 412 des 4 684 positions de partie et le réduit de 26 % au total ; sous le groupe composé, 523 et 23 % ; une somme sur six positions tirées au hasard bascule 3,1 % des fois sur `main` — le test se compte désormais sur trente-six positions de parties (`556ecda`, section « N° 9, la composition ») | `git apply --check` : **oui** |

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
