<!-- socle: couche=demandes zone=publique -->
# D-0003 — Continuer l'installation du socle à l'étape 4, ou réinstaller

> date : 2026-11-11 · forme : séance

## Question posée

L'installation du socle sur chess s'est arrêtée à son étape 3, le
11 novembre 2026, sur un constat que le prompt d'installation déclarait
bloquant : l'installeur, lancé avec l'adaptateur de chess donné en fichier,
n'a rien dit du JavaScript du dossier `ui/`. Ce message n'est émis qu'en
détection automatique des langages ; rien n'est posé pour ce JavaScript, et
la CI du socle ne lance aucune commande pour lui.

Deux suites étaient proposées à Théo :

- `continuer` — reprendre à l'étape 4 sur l'arbre de travail tel qu'il
  est : ce que l'agent recommandait, ce qui est posé étant conforme ;
- `reinstaller` — attendre un socle corrigé, commiter l'essai, changer de
  branche et relancer l'installeur.
