# Bilan du périmètre tactique court — 4 octobre 2026

**Une base tactique fonctionne ; l'explication générale des décisions reste
hors de sa portée actuelle.** Le nombre de textes produits ne démontre pas leur
pertinence. La suite ne doit pas consister à reconnaître une position de plus
après chaque retour utilisateur.

## Ce qui a été mesuré

Le dernier passage utilise le code fonctionnel de `7408470`, après les gardes
de clôture d'échange et la migration des occasions favorables. Rapport conservé :
`dev/pedagogy-audit-final-data.json`, aperçu
`/dev/pedagogy-audit.html?sample=final` avec `npm run dev`.

Les trois PGN, les six revues, les deux binaires et les classifications sont
identiques au premier passage. Les **126 décisions défavorables moteur × partie**
restent le dénominateur ; il ne s'agit pas de 126 coups distincts. Les évaluations
initiales à 250 ms sont réutilisées, seules les explications sont recalculées.
Chaque décision, y compris les refus, est conservée. Les tests vérifient la même
liste d'indices/verdicts, les résultats réutilisés et la légalité des repères.

| Passage | Conséquences soutenues par les contrôles | Raisons non confirmées | Calculs indisponibles |
|---|---:|---:|---:|
| Initial | 7 | 117 | 2 |
| Menace ignorée | 7 | 118 | 1 |
| Pièce exposée | 11 | 111 | 4 |
| Clôture du jalon | 11 | 112 | 3 |

Ce dernier passage **n'apporte aucun gain net de couverture**. Une sortie
ShallowRed précédemment inconnue, 16… Fxh3 dans `7rzcutsf`, est soutenue ;
26. Ff1 de la même partie cesse de l'être car les recherches divergent.
Stockfish termine cette fois le contrôle de 22… Cfxd5 de `7b44wxzu`, mais sans
confirmer de cause. Les autres conséquences soutenues sont conservées.
Ces changements ne sont ni des validations humaines ni des gains garantis entre
versions : les recherches réelles peuvent varier.

| Moteur / partie | Décisions | Soutenues | Non confirmées | Indisponibles |
|---|---:|---:|---:|---:|
| ShallowRed / 7b44wxzu | 17 | 0 | 17 | 0 |
| ShallowRed / 7rzcutsf | 29 | 2 | 27 | 0 |
| ShallowRed / 1hi3aveq | 16 | 2 | 14 | 0 |
| Stockfish 16 / 7b44wxzu | 15 | 2 | 13 | 0 |
| Stockfish 16 / 7rzcutsf | 36 | 3 | 30 | 3 |
| Stockfish 16 / 1hi3aveq | 13 | 2 | 11 | 0 |

Les onze sorties se répartissent entre quatre pièces exposées, trois défenses
abandonnées et quatre mats courts. Les illustrations comportent deux à six
positions, à partir du coup étudié. Toutes les relectures sémantiques de cet audit
restent `pending` : **le taux d'explications correctes et le nombre d'erreurs
pédagogiques ne sont pas mesurés**. Aucun « zéro erreur » ne se déduit des tests.

92 raisons non confirmées n'ont déclenché aucune tentative de vérification ;
vingt autres ont été examinées sans produire d'explication. Ces compteurs décrivent
le contrôleur, pas une annotation de l'idée échiquéenne manquante. Les diagnostics
comprennent notamment des lignes différentes, des défenses non établies et une
recherche instable. Trois réponses Stockfish sans score exact/PV utilisable ont
interrompu le contrôle. Aucune de ces sorties n'est comptée comme une réussite.

## Coût observé

Budgets 300/900 ms, plafond partagé 12 s, deux candidats et quatorze recherches
maximum. Le chronomètre couvre extraction, démarrage et contrôle pédagogique ;
la revue initiale et le rendu navigateur sont exclus. Le 95e centile utilise
le rang supérieur dans la série triée.

| Moteur | Décisions mesurées | Médiane | 95e centile | Maximum |
|---|---:|---:|---:|---:|
| ShallowRed | 62 | 299 ms | 4 273 ms | 4 963 ms |
| Stockfish 16 | 64 | 342 ms | 5 629 ms | 7 761 ms |

Il n'y a pas de dépassement du délai dans ce dernier passage. Les trois délais
épuisés du passage précédent restent dans son rapport. Ces temps locaux dépendent
de la charge et ne garantissent ni la latence ni la fluidité du produit.

## Occasions favorables et relecture

L'essai favorable est séparé : cinq positions de développement avec deux moteurs,
dix essais, six textes et quatre abstentions. Les fourchettes des deux camps et
le clouage dont la pression reste inchangée sont expliqués. Le clouage qui change
aussi les reprises et le sacrifice avec compensation restent sans explication.
Quatre recherches libres par essai ; aucune mauvaise alternative obligatoire,
aucune prétention de meilleur coup ou de choix unique.

Le 4 octobre, Théo juge correctes les explications présentées : fourchettes des
deux camps, clouage et Dxd4 adverse. Il souligne leur caractère **basique**.
Cette validation ne concerne pas les 126 décisions de l'audit, les compensations
complexes ni le parcours mobile. Les essais construits de pièce exposée (dix
textes sur dix-huit essais) restent également du développement.

La dernière CI lue sur `7408470` réussit :
[UI](https://github.com/theodubus/chess/actions/runs/37232166982),
[Rust PR](https://github.com/theodubus/chess/actions/runs/37232167015),
[Rust push](https://github.com/theodubus/chess/actions/runs/37232164733).
Elle vérifie 844 tests unitaires et 137 tests pont/moteurs, lint, types et build.
Cette référence précède le présent rapport ; elle ne vaut pas relecture humaine.

Le contrôle visuel reste ouvert. CUA interrogé de nouveau le 4 octobre ne donne
aucun navigateur ni application. Les rendus statiques, les PGN rejoués et les
tests de filtrage des moments ne remplacent pas l'utilisation bureau/mobile,
humain/bot et deux humains.

## Conséquence pour la suite

Les motifs sont surtout extraits autour de la décision et de la première réponse.
Allonger la PV ou le temps moteur ne construit pas automatiquement le lien entre
le coup étudié et une menace plus tardive. Ajouter une famille pour chaque
exemple continuerait à augmenter le travail sans garantir une couverture utile.

La voie intermédiaire à expérimenter est décrite dans
[DELAYED_TACTICS_PLAN.md](DELAYED_TACTICS_PLAN.md) : lire les mêmes concepts dans
plusieurs positions d'une suite courte, puis contrôler leur lien avec la décision.
Cela reste une hypothèse d'architecture, pas une capacité déjà livrée. Les plans
positionnels généraux ne sont pas inclus implicitement dans cette expérience.

Reproduction depuis `ui/`, hors exécution des tests lisant les instantanés :

```bash
# Le fichier final conserve les revues à réutiliser ; les contrôles sont recalculés.
npm run pedagogy:audit -- --stockfish /chemin/stockfish --reuse-review --output dev/pedagogy-audit-final-data.json
```

Avant une nouvelle mesure, conserver l'ancien rapport ailleurs pour ne pas
effacer les variations et abstentions. Détails de sélection et provenance :
[AMATEUR_AUDIT.md](AMATEUR_AUDIT.md).
