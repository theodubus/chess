<!-- socle: couche=backlog zone=publique -->
# B-0012 — Mesurer N10r10h512 contre N10h512

> statut : ouvert · origine : J-2026-11-12-B · après : B-0011, B-0044 · lu : backlog@4625b88c

Les dix seaux de roi paient-ils encore à 512 unités ? Écrit le 10 nov.
2026, au verdict des largeurs, avant le match (J-2026-11-18-CS) :

- **le candidat** : N10r10h512, poussé par `tools/seance-c3.sh` sur la
  branche `reseau/c3` (`4c15e0c`), 7 881 792 octets, la taille calculée à
  la main ; intégré à `reseaux/`, puis embarqué sur un commit révoqué
  aussitôt par `tools/candidat-reseau.py` avec `largeur=512 seaux=10` ;
- **la référence** : N10h512, candidat `745d569`, au même code au bit
  près — `git diff` sur `engine/` ne porte que `nnue.rs` ; sinon il se
  recommite sur le code du jour ;
- **le match** : quatre travaux de 2 800 parties à `8+0,08` par
  `.github/workflows/match.yml`, binaire AVX2 des deux côtés, réunis par
  `tools/mettre-en-commun.sh`, relevés par le skill `rendre-un-verdict` ;
- **l'attendu**, écrit avant : +3 à +18, vers +10, confiance faible — les
  seaux suivant le volume comme à 256 unités, où dix contre quatre rendait
  +14,77 ± 3,27 (J-2026-11-18-CR) ;
- **le critère du match**, écrit le 18 nov. 2026, avant lui, sur le modèle
  des précédents (J-2026-11-18-CE) : **N10r10h512 passe devant si la borne
  basse de l'intervalle mis en commun est au-dessus de zéro ; sinon
  N10h512**, en tête au point des largeurs. Un écart positif non démontré
  ne suffit pas : la composition doit démontrer ;
- **le critère de la séance**, écrit avant elle (J-2026-11-18-CR) — le
  réseau embarqué bat N9w50s800, borne basse au-dessus de zéro —, se juge
  ensuite par le match direct du gagnant contre N9w50s800, dans B-0013,
  jamais par une chaîne de matchs ;
- **la perte tenue à l'écart** des deux réseaux, et l'ordre qu'elle
  prédit, écrits avant le match : le premier point de B-0071, quatre
  minutes de runner, qui ne décide rien.

## Fait quand

- [ ] les quatre travaux sont relevés, leurs avertissements lus
- [ ] le verdict est écrit au journal, avec son intervalle et son homogénéité
- [ ] le gagnant des deux réseaux est nommé
