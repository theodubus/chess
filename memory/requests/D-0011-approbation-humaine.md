<!-- socle: couche=demandes zone=publique -->
# D-0011 — Approuver un changement fait par l'humain lui-même

> date : 2026-11-16 · origine : `socle approve`

## Décision demandée

L'humain approuve un changement qu'il a fait lui-même sur un garde-fou ou un fichier protégé.

## Contexte

Écrite et validée d'un seul geste par `socle approve`, une commande que le hook de l'agent refuse : elle ne sert qu'à l'humain, pour que ses propres changements protégés restent visibles et tracés. Raison donnée : D-0009@3703a5ea : ne garder au démarrage et en fin de tour que les hooks du socle

## Éléments cités

- `.claude/settings.json` — fichier protégé modifié par l'humain lui-même ; empreinte nouvelle `sha256:8a19cbcf8ff2fc06`.

## Où regarder

Le diff du commit qui porte cette demande ; les fichiers et clés cités ci-dessus, voir [le format des demandes](../../.socle/engine/socle/FORMAT.md).

## Options

Approuver garde le changement : effort nul, risque porté par l'humain, réversible par un nouveau changement approuvé. Ne pas approuver laisse la CI refuser le changement, ce qui est réversible et sans effort.

## Conséquences

Si l'humain valide, la CI accepte le changement cité. S'il refuse, la CI le refuse. Sans réponse, rien ne passe : cette demande naît avec sa réponse.

## Recommandation

Vérifié : les empreintes et les clés citées ci-dessus sont celles de l'arbre au moment de l'approbation. Supposé : rien, l'humain décide seul.

## Réponses possibles

- `valider` — la CI accepte le changement cité.
- `contexte-insuffisant` — sans objet ici ; présent parce que toute demande le propose.
