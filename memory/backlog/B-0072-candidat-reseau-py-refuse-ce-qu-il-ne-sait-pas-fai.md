<!-- socle: couche=backlog zone=publique -->
# B-0072 — candidat-reseau.py refuse ce qu'il ne sait pas faire

> statut : ouvert · origine : J-2026-11-18-CX · après : B-0013 · lu : backlog@47705919

`tools/candidat-reseau.py` fait d'un réseau de `reseaux/` le réseau
embarqué d'un candidat. Il ignore sans le dire toute option qu'il ne
connaît pas et toute valeur de `seaux` autre que 10, et `largeur=N` ne
remplace que la ligne `HIDDEN = 256` : relevé par la relecture de B-0050
(J-2026-11-18-CX), éprouvé sur une copie du dépôt, où `seaux=16` rendait
0 en laissant quatre seaux de roi. Seuls les tests `nnue` en release le
rattrapent, s'ils sont lancés. Dès que B-0013 aura embarqué un réseau
d'une autre architecture que N9w50s800, les candidats suivants (B-0020,
puis B-0021 et B-0022) sortent de son domaine.

## Satisfait quand

- [ ] une option inconnue, ou une valeur qu'il ne prend pas en charge, le fait échouer avant d'écrire
- [ ] `largeur` et `seaux` partent de l'architecture en place, quelle qu'elle soit
- [ ] un test l'éprouve sur ces cas, lancé par `tools/verify.sh` et la CI
