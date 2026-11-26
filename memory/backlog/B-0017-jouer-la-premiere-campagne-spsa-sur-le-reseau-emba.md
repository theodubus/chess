<!-- socle: couche=backlog zone=publique -->
# B-0017 — Jouer la première campagne SPSA sur le réseau embarqué

> statut : ouvert · origine : D-0004 · après : B-0013 · lu : backlog@c7f77d74

SPSA règle ensemble les marges de la recherche par paires de moteurs
perturbés. Son outillage est prêt depuis le 14 oct. 2026
(`.github/workflows/spsa.yml`, `tools/spsa/n19.txt`) et n'a joué qu'un
essai de chaîne. Il attendait un réseau « stabilisé » ; il se joue dès le
réseau de la séance embarqué, sur les runners pendant que la carte
entraîne : hypothèse de l'agent validée par Théo le 12 nov. 2026 (D-0004), notée « supposée ». Les réglages de la phase 4 laissés à leur plateau
(le bonus aux nœuds de coupure, le poids de la correction, la mémoire de
l'historique) y entrent ; le bonus aux nœuds de coupure, deux plis
entiers, s'y exprime en fraction de pli ou reste aux matchs, sans quoi sa
perturbation d'une unité vaudrait la moitié de sa valeur (plus bas, « Les
règles de la campagne »).

Jamais mesurés : son coût en parties, et ce qu'un réglage garde d'un
réseau au suivant. Cette campagne les mesure. Ce que fait l'outillage, et
pourquoi des réglages à la compilation : `tools/README.md`, « Régler par
SPSA » ; les règles de la campagne, ci-dessous, y étaient jusqu'au
24 nov. 2026 (J-2026-11-24-C). Le commentaire de `reglage!` (`engine/src/search.rs`) nomme encore
le pilote d'après son ancien nom en Python, devenu `tools/src/bin/spsa.rs` : à corriger
avec la campagne.

## Les règles de la campagne

- **Des grandeurs à plage large** : SPSA perturbe chaque paramètre de
  ± c, et un entier de petite plage — un seuil de profondeur de 3 à 8,
  un bonus de deux plis — ne se perturbe que d'une unité, 20 à 50 % d'un
  coup, où le bruit et l'arrondi dominent. `LMP_BASE`, de 2 à 14, en est
  la limite dans la première passe ; une grandeur plus étroite s'y
  exprime en fraction, comme la LMR en centièmes de pli, ou reste aux
  matchs. `NETWORK_MARGIN_PERCENT` reste figé : il multiplie l'aspiration
  et l'élagage delta, qui se règlent eux-mêmes.
- **La cadence du réglage est celle de la mesure**, `8+0,08` : un réglage
  appartient à sa cadence comme un verdict.
- **Le budget s'écrit avant** : jamais mesuré ici ; les moteurs amateurs
  publient de l'ordre de 20 000 à 80 000 parties pour une dizaine de
  paramètres, à cadence courte (de mémoire) ; ce qu'un job tient à `8+0,08`
  est dans F-0016.
- **Le verdict reste un match** : le `θ` final est un candidat comme un
  autre, sur un commit révoqué aussitôt, mesuré par `match.yml` contre
  `main`, son critère écrit avant (skills `lancer-un-match` et
  `rendre-un-verdict`). SPSA prédit bien sur son propre bruit, et rien
  d'autre.

## Satisfait quand

- [ ] la liste des paramètres et leurs plages sont écrites avant de lancer
- [ ] la campagne est jouée, son coût en parties et en heures de runner relevé
- [ ] le réglage final est mesuré en match contre `main`, comme un candidat, et son verdict écrit
- [ ] la règle de reprise à chaque réseau embarqué est écrite d'après ce coût
