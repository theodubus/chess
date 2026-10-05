# Analyse pédagogique : périmètre livré

5 octobre 2026. Fonctionnalité annexe de l’UI, limitée aux explications courtes
que les contrôles existants peuvent soutenir. L’élargissement des mécanismes
est clos. Une raison inconnue est une limite connue, pas une nouvelle tâche.

## Ce que l’on peut attendre

L’interface classe les coups à partir des évaluations du moteur. Séparément, elle
cherche une conséquence tactique courte : attaque exploitée, capture, reprise,
gain ou perte de matériel, mat court. Le texte et les repères utilisent les mêmes
faits légaux et le bilan après reprises. Une reprise garde son contexte dans
l’échange commencé ; une promotion est comptée avant sa capture éventuelle.

« Montrer pourquoi » part après la décision et montre le témoin utile. « Retour
au coup examiné » quitte la démonstration sans modifier la partie. Les variantes
brutes et observations complémentaires restent disponibles séparément.

## Limites assumées

- Un coup peut être classé sans raison expliquée. La majorité des raisons peut
  rester inconnue ; une baisse de score ne donne pas automatiquement sa cause.
- Les plans, la structure, l’activité durable, la sécurité globale du roi et les
  compensations positionnelles ne sont pas expliqués de façon fiable.
- Les combinaisons longues et les tactiques différées ne disposent pas d’une
  explication générale activée. Le prototype différé est resté hors produit,
  sans gain acceptable dans la mesure bornée.
- Une variante moteur illustre une continuation. Elle ne prouve pas toutes les
  réponses ni que chaque coup est forcé. Une preuve de mat court est un contrôle
  distinct ; aucun mat n’est transformé en bilan matériel.
- Un seul autre choix ne prouve pas le meilleur coup global ou son unicité.
  Plusieurs bonnes décisions peuvent exister.
- Les résultats dépendent du moteur et de son temps de recherche. Davantage
  de temps peut stabiliser un score sans produire l’explication manquante.
- Une FEN sans passé connu ne permet pas de reconstruire un échange antérieur.
  Une reprise en attente ou une compensation non résolue conserve son incertitude.
- Les tests logiciels, la CI et la légalité des repères ne valident pas à eux
  seuls l’utilité pédagogique du texte. La relecture est limitée aux cas nommés.

## Clôture

Les contrôles visuels sont terminés sur bureau et téléphone émulé : partie contre
bot, deux humains, import valide/refus invalide, clavier, démonstrations courtes,
retour avec dessins conservés et retentative. Aucun téléphone physique n’a été testé.

La sélection de [relecture finale](RELECTURE_ANALYSE.md) reste fixée à six cas.
Les corrections portent uniquement sur des textes trompeurs ou un parcours
défectueux dans le périmètre existant. Si une correction exige un nouveau modèle,
la cause conserve l’abstention ; aucun nouveau détecteur n’est ajouté.

Les besoins plus larges sont différés et ne déclenchent aucun travail automatique.
Voir la [backlog de clôture](BACKLOG_ANALYSE_PEDAGOGIQUE.md), le
[bilan tactique](src/review/understanding/TACTICAL_MILESTONE_REPORT.md) et le
[bilan du prototype différé](src/review/understanding/DELAYED_TACTICS_REPORT.md).
