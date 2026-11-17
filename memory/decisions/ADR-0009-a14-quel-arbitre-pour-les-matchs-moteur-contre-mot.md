<!-- socle: couche=decisions zone=publique -->
# ADR-0009 — A14 : Quel arbitre pour les matchs moteur contre moteur ? (Tranché — fastchess)

> statut : acceptée · date : 2026-09-13 · lu : decisions@27e30406

## Contexte

Arbitrage A14 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet. Entrées de la mémoire lues pour le faire : J-2026-09-13-E@7f38a071.

**Ce qu'est un arbitre.** Un programme qui lance deux moteurs UCI en processus fils, joue les parties entre eux, applique cadences et adjudication, détecte coups illégaux, plantages et pertes au temps, et rend un verdict — score, Elo, et SPRT avec arrêt anticipé.

**Pourquoi pas le nôtre.** Un arbitre écrit par nous reposerait sur notre compréhension d'UCI, la même qui a produit le moteur : **il serait aveugle exactement là où le moteur l'est**. Deux bugs de cette famille sont apparus le 13 sept. (encodage du roque, `quit` interrompant la recherche) ; un arbitre maison les aurait masqués. Second motif : **un SPRT faux ne plante pas**, il rend des verdicts erronés indéfiniment. Troisième : c'est de l'infrastructure, pas du moteur — même raisonnement qu'en A7.

**Comparaison mesurée.**

|   | cutechess-cli 1.5.1 | fastchess 1.8.2 |
| --- | --- | --- |
| Construction ici | Qt6, 27 paquets + Svg, ~120 Mo, index apt à rafraîchir, ~20 min | **make -j, zéro dépendance, ~3 min** |
| Cas de test SPRT | 3, bornes uniques | **12, quatre jeux de bornes** |
| Modèles SPRT | 1 — Jeffreys trinomial | **3 — normalisé, logistique, bayésien** |
| Statistique | trinomial seul | **trinomial + pentanomial** |
| Tests exécutés | 3/3 ✓ | 12/12 ✓, et 165/165 au total (923 assertions) |
| Ergonomie | exige `tc=` même avec `depth=` | `depth=` suffit |

**[Mesure]** **Le pentanomial est le point décisif.** Les parties se jouent par paires — même ouverture, couleurs inversées — et scorer la paire sur cinq issues plutôt que chaque partie isolément élimine la variance due au déséquilibre de l'ouverture. Concrètement : moins de parties pour la même confiance. cutechess n'en a pas, et sa sortie ne comporte aucune ligne `Ptnml`.

**Contre-essai.** **[Mesure]** 13 sept. 2026 — le **même match** (ShallowRed profondeur 4 contre profondeur 2, 12 ouvertures, des deux côtés, 24 parties) passé dans les deux arbitres :
fastchess **23 - 0 - 1**, Elo +668,84 · cutechess-cli **23 - 0 - 1**, Elo +668,8. **Accord exact.**
C'était aussi la **première fois que ShallowRed était piloté par un arbitre externe** : 48 parties au total, aucune plainte de protocole, aucun coup illégal, aucun plantage, aucune perte au temps. Validation de la couche UCI que nos propres tests ne pouvaient pas fournir.

## Décision

**Décision.** **[Décision utilisateur]** **13 sept. 2026 — fastchess comme arbitre de travail, cutechess-cli conservé comme contre-vérification.** Garder deux arbitres indépendants qui s'accordent répond mieux à l'inquiétude d'origine que le choix d'un seul.

## Conséquences

**À épingler.** fastchess est en version alpha : la ligne de commande peut bouger. Le script d'installation fixe un commit précis, pour la même raison qu'en A13.

**Erreur de parcours.** J'ai d'abord proposé d'écrire l'arbitre, sur la foi d'un « cutechess n'est pas installable » tiré d'un seul `apt-cache`. Puis j'ai recommandé fastchess parce qu'il compilait — un argument de commodité déguisé en argument technique. La comparaison ci-dessus n'existe que parce que Théo a refusé les deux. Voir J-2026-09-13-E.
