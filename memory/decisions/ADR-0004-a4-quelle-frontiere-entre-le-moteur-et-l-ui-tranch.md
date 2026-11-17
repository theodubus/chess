<!-- socle: couche=decisions zone=publique -->
# ADR-0004 — A4 : Quelle frontière entre le moteur et l'UI ? (Tranché — UCI)

> statut : acceptée · date : 2026-09-12 · lu : decisions@b8990b57

## Contexte

Arbitrage A4 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**Ce qu'est UCI.** *Universal Chess Interface*, protocole texte apparu vers 2000, standard de fait entre interfaces et moteurs. Le moteur est un **programme séparé** que l'interface lance en processus fils et pilote en lignes de texte sur stdin/stdout. Trois propriétés structurantes : **(1)** le moteur est sans mémoire — l'interface renvoie la position complète à chaque coup ; **(2)** l'interface impose un budget de temps, pas une profondeur ; **(3)** le moteur pense à voix haute via des lignes `info`, qui alimentent barre d'évaluation et flèches de variante. Transcription complète en §11.

**Argument.** UCI rend le moteur testable contre Stockfish, chargeable dans n'importe quelle GUI (Cute Chess, Arena), et classable sur les échelles standard. « Compétitif » devient un nombre au lieu d'une impression. Le contrat tient en une dizaine de commandes en entrée et cinq en sortie ; la boucle fait environ 200 lignes.

**Alternative écartée.** Faire du moteur une bibliothèque appelée directement par l'UI (crate Rust ou FFI). On perdrait le chargement dans les GUI existantes, les matchs automatisés contre Stockfish, le classement standard, et l'UI serait couplée aux structures internes. **Le gain de vitesse est nul** : le moteur réfléchit pendant des secondes, parser une ligne prend des microsecondes. Aucun argument de performance ne milite contre UCI.

**Conséquence.** Le moteur ne conserve **aucun état** entre deux commandes `position`. Pas de notion de partie, pas de PGN, pas de joueurs, pas de persistance, pas d'état d'interface — tout cela appartient à l'UI. Contrainte forte, et c'est précisément ce qui rend le moteur testable et remplaçable.

**Bénéfice concret.** L'UI peut piloter **n'importe quel moteur**, pas seulement le tien — donc comparer. Et le transport (processus fils, Web Worker, serveur) devient interchangeable sans toucher au moteur, ce qui est exactement pourquoi A8 peut attendre.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — UCI sur stdin/stdout, unique frontière.** Renforcé par le critère performance : sans UCI il n'y a aucun moyen de mesurer la force, donc aucun moyen de savoir si un changement améliore le moteur.

## Conséquences

**Détails différés.** À trancher en écrivant `uci.rs`, pas maintenant : supporter `ponder` (réfléchir pendant le tour adverse) ? les `setoption` (taille de la table de transposition, plafond Elo) ? `MultiPV` (plusieurs variantes, utile pour l'analyse de B5) ?
