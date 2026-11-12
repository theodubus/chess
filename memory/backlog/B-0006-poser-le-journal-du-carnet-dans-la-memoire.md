<!-- socle: couche=backlog zone=publique -->
# B-0006 — Poser le journal du carnet dans la mémoire

> statut : ouvert · origine : D-0005 · après : B-0005 · lu : backlog@0b9dd3b4

Deuxième lot du déplacement du carnet (B-0003) : son journal, 207 entrées
datées du 12 sept. au 10 nov. 2026, passe dans le journal de la mémoire,
un fichier par mois, entier : Théo a décidé le carnet public sans tri
(D-0006). Les entrées gardent leurs identifiants : aucun ne tombe sur un
identifiant d'ici, le journal du socle commençant le 11 nov. Deux entrées
du carnet n'ont pas d'identifiant et vont avec son contexte historique.
Rien ne change dans `CLAUDE.md`.

## Fait quand

- [ ] le compte d'entrées posées égale celui du carnet
- [ ] aucune référence morte ni copie nouvelle : `python3 .socle/socle verify --fast` passe sans avertissement nouveau
- [ ] le journal du mois de l'import dit ce qui a été posé
