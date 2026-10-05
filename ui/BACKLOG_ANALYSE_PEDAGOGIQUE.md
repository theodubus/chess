# Analyse pédagogique — clôture et limites

Mis à jour le 5 octobre 2026. Périmètre : `ui/**`, moteur Rust inchangé,
UCI comme seule frontière. Branche `codex/ui-polish`, [PR #111](https://github.com/theodubus/chess/pull/111).

**Le périmètre fonctionnel est fermé.** L’analyse est une fonctionnalité annexe
et ne justifie pas des dizaines de sessions supplémentaires. Aucune nouvelle
famille, nouveau corpus ou itération du prototype différé n’est prévue.
Une raison inconnue reste une limite connue, pas une tâche à ajouter.

Le [périmètre livré](ANALYSE_PEDAGOGIQUE.md) décrit les garanties et limites.
Le plan A–E et le journal initial sont dans la
[backlog historique](BACKLOG_ANALYSE_PEDAGOGIQUE_HISTORIQUE.md) ; les anciennes
ambitions de ce journal ne sont pas des tâches actives.

## Travaux de clôture, liste fixée

- [x] Raccorder les conséquences tactiques adverses et favorables existantes,
  avec les mêmes faits pour le texte, le bilan et le court témoin.
- [x] Garder le contexte des reprises, compter les promotions, refuser les
  compensations non résolues et séparer classement et raison du coup.
- [x] Borner le calcul, l’annulation, les caches et la publication d’un résultat.
  Retry masqué et annotations désactivées ne cherchent pas de raison cachée.
- [x] Faire le bilan du périmètre tactique et fermer l’expérience différée,
  sans raccordement du prototype au produit faute de gain acceptable.
- [x] Documenter les limites dans l’UI et les documents de référence. Remplacer
  les anciens suivis périmés par cet état ; conserver les mesures historiques.
- [x] Terminer le contrôle visuel bureau et téléphone émulé : partie contre bot,
  deux humains, import PGN valide/refus invalide, clavier, démonstrations de perte
  et de mat, retour avec dessins conservés et retentative sans solution affichée.
  Vérifié le 5 octobre avec Chromium local, sans erreur JavaScript ni débordement
  horizontal ; ce n’est pas un test sur téléphone physique. Les pages figées
  refusent les liens invalides et commencent le témoin à sa première position.
- [ ] Terminer la relecture humaine de la sélection **fixée à six cas** :
  les deux premiers textes sont déjà approuvés ; les cas 3–6 restent à relire.
  Voir [RELECTURE_ANALYSE.md](RELECTURE_ANALYSE.md). Aucun nouveau cas ne s’ajoute
  automatiquement. Une correction qui demanderait un nouveau modèle garde
  l’abstention au lieu d’ouvrir un chantier.

Les vérifications logicielles et visuelles peuvent être terminées indépendamment
de cette dernière relecture. L’absence d’un avis humain reste documentée ; elle
ne devient ni une validation implicite ni une recherche générale à poursuivre.

## Contrat conservé

Expliquer ce que le coup change et comment la conséquence éclaire son verdict.
Pour une erreur, montrer sa conséquence directe, sans imposer un meilleur coup
de remplacement. Un seul autre choix ne prouve ni le meilleur coup ni son unicité.

- Distinguer fait légal, hypothèse, confirmation moteur et classement du coup.
- Inclure reprises et promotions dans le bilan. Une reprise peut être le meilleur
  choix dans un échange globalement perdant ; une première prise neutre ne reçoit
  pas rétroactivement la perte d’une autre pièce.
- Partir après le coup étudié, montrer seulement le nécessaire et revenir
  explicitement au coup examiné. Garder les étapes indispensables du témoin.
- Une FEN sans passé connu, une reprise en attente, une compensation, un score
  instable ou un résultat UCI inutilisable conservent leur incertitude.
- Une continuation moteur ne prouve pas toutes les réponses légales. Les mats
  courts ont leur contrôle distinct ; aucun mat n’est converti en centipions.
- Développement, centre ou mobilité ne remplacent pas une cause inconnue.
- Les tests et la CI ne valident pas à eux seuls la pertinence pédagogique.

## Mesures conservées, sans promesse de couverture générale

| Mesure | Décisions moteur × partie | Soutenues | Inconnues | Indisponibles |
|---|---:|---:|---:|---:|
| Audit tactique de clôture | 126 | 11 | 112 | 3 |
| Trois nouvelles parties du bilan différé, couche existante | 91 | 6 | 85 | 0 |

Ces sorties ne sont pas des validations humaines. Elles montrent notamment que
la majorité des raisons reste inconnue. Les positions construites de développement
et le corpus publié déjà utilisé pour régler le code ne permettent pas de déduire
une pertinence générale.

Sur les mêmes 126 décisions, puis les 91 nouvelles : **zéro contraste différé
accepté et zéro nouvelle explication confirmée**. Les six contre-épreuves
construites (trois positions × deux moteurs) ont donné un candidat corroboré et
cinq refus, sans texte publiable. L’expérience reste hors produit et n’ajoute
aucune recherche au parcours utilisateur.

Coûts, versions, abstentions et provenance :
[rapport tactique](src/review/understanding/TACTICAL_MILESTONE_REPORT.md),
[audit amateur](src/review/understanding/AMATEUR_AUDIT.md),
[rapport différé](src/review/understanding/DELAYED_TACTICS_REPORT.md).
La CI du commit fonctionnel `2a18c35` a été lue :
[UI](https://github.com/theodubus/chess/actions/runs/37238608985),
[Rust PR](https://github.com/theodubus/chess/actions/runs/37238608955),
[Rust push](https://github.com/theodubus/chess/actions/runs/37238606490) réussies,
869 tests unitaires / 70 fichiers et 137 tests pont / 10 fichiers.
La validation de la présente clôture se lit séparément dans les checks de la PR.

## Maintenance ultérieure

Les plans, compensations positionnelles et combinaisons longues sont différés.
Ils ne reprennent qu’à la demande explicite du propriétaire, avec un nouveau
budget et un objectif mesurable. Ne pas ajouter une phrase par symptôme ni
transformer les inconnus des audits en centaines de cas à reconnaître.

Lire `ui/CLAUDE.md`, rester dans `ui/**` et exécuter toute nouvelle position
avec chess.js avant de l’inscrire. Les contrats, commandes de vérification et
rapports sont indexés dans le [README du module](src/review/understanding/README.md).
