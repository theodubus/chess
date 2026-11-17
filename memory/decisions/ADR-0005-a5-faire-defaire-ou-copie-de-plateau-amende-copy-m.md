<!-- socle: couche=decisions zone=publique -->
# ADR-0005 — A5 : Faire / défaire, ou copie de plateau ? (Amendé — copy-make)

> statut : acceptée · date : 2026-09-13 · lu : decisions@0c21a042

## Contexte

Arbitrage A5 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet. Entrées de la mémoire lues pour le faire : J-2026-09-12-C@85fa29a9.

Ses trois justifications tiennent-elles encore ? **n°1 (NNUE)** — survit au copy-make via une pile d'accumulateurs par ply. **n°2 (pile de répétition)** — nécessaire dans les deux cas, `hash()` est public. **n°3 (gain brut)** — mesuré négligeable : 47 M nœuds/s en copy-make, très au-dessus de ce qu'une recherche consomme.

**La bonne structure de dépendance est donc : A7 détermine A5, pas l'inverse.** A7 = maison → make/unmake, avec accroche NNUE gratuite. A7 = `cozy-chess` → copy-make imposé, delta NNUE externe.

**Les deux approches.** **Copy-make** : copier le plateau, jouer le coup sur la copie, jeter la copie. **Make/unmake** : jouer le coup sur le plateau, empiler ce qu'il détruit, annuler au retour. À empiler : pièce capturée, droits de roque, case d'en passant, compteur des 50 coups, hash Zobrist — peu, et fixe.

**Argument du brief.** Le profilage du moteur 2022 rapporte 8 808 908 appels à `deepcopy` pour un seul coup, soit 99 % du temps CPU. **[Limite connue]** — chiffres rapportés par une session antérieure, non re-vérifiés ici.

**Correction.** **[Inférence]** Supprimer la copie rapporte **au plus ×100**, pas ×3000. La représentation porte le reste de l'écart. Voir §1 et J-2026-09-12-C. **Ne pas justifier cette décision par le facteur 3000.**

**Nuance technique.** Avec des bitboards, **copy-make n'est pas absurde** : un `Board` fait 100 à 200 octets (8 à 12 `u64` plus quelques champs), soit deux ou trois lignes de cache. Des moteurs modernes copient et s'en portent bien. L'argument « la copie est lente » valait pour un `dict` Python de plusieurs kilo-octets ; il ne vaut plus pour 200 octets.

**Justification retenue.** Sous le critère performance, trois raisons par ordre de poids :

- **1 — NNUE.** L'accumulateur pèse 1 à 4 Ko, soit 10 à 40× le plateau. Le copier par nœud est rédhibitoire ; il faut appliquer le delta en descendant et le défaire en remontant. **C'est l'argument décisif.**
- **2 — La pile est nécessaire de toute façon** pour la détection de répétition (R4).
- **3 — Un gain brut marginal** : quelques pourcents de nœuds/seconde, pas un ordre de grandeur.

**Calibration.** **Ce choix ne vaut pas des centaines d'Elo.** La performance d'un moteur ne vit pas là : elle vit dans l'ordonnancement des coups, la table de transposition, les élagages et la qualité de l'évaluation. Ne pas confondre débit de nœuds et force.

## Décision

**Amendement.** **[Décision utilisateur]** **13 sept. 2026 — copy-make.** A7 ayant retenu `cozy-chess`, **copy-make est forcé** : ni `cozy-chess` ni `shakmaty` n'exposent d'`unmake`, et les champs de `Board` sont privés — on ne peut pas en écrire un. A5 devient alors sans objet.

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — `make_move` / `unmake_move`** avec pile d'annulation, jamais de copie. Pour la raison n°1, pas pour celle du brief.

## Conséquences

**Détail différé.** `unmake` restaure-t-il le hash Zobrist depuis la pile, ou le recalcule-t-il ? Restaurer est plus rapide ; recalculer sert de test d'invariant. Les deux peuvent coexister (recalcul en debug).
