<!-- socle: couche=backlog zone=publique -->
# B-0026 — Dire quelles données d'entraînement servent encore, avant leur expiration

> statut : fait · origine : D-0005 · priorité : haute · ref : J-2026-11-23-R · lu : backlog@b87fe472

Les données que GitHub garde expirent entre le 24 déc. 2026 et le 29 janv.
2027 (F-0005, corrigé le 17 nov. : les générations antérieures au n° 18
expirent les 24 et 28 déc. et le 5 janv.) ;
après, la machine de Théo en porte la seule copie. Théo, le 12 nov. 2026 :
pas de copie de ce qui ne sert plus ; pour le reste, il n'a pas d'avis
arrêté (D-0005). Il faut donc d'abord dire ce qui sert.

Ce que la documentation des outils laisse lire, à vérifier : la séance
d'architecture n'a appris que les générations n° 21 et n° 22 ; les
générations d'avant, étiquetées par des réseaux plus faibles, ont été
laissées de côté.

Les générations d'avant le n° 18 n'ont pas de registre `tools/*-jobs.tsv` :
leurs runs, leurs comptes et le K qui regénère chaque job (K = parties +
écartées, la même graine) sont au journal — la première vague d'A21
(J-2026-11-18-BD), la vague au réseau du n° 7 (J-2026-11-18-BE), celle du
n° 13 (J-2026-11-18-BY).

Les garder chez GitHub ne coûte rien : la documentation de facturation ne
mesure le stockage des artefacts que pour un dépôt privé, et celui-ci,
public, en portait 86,5 Go le 6 nov. 2026 sans qu'un envoi ait été refusé
(J-2026-11-23-J). Les supprimer avant leur date ne libérerait rien, et
couperait la perte tenue à l'écart sur les jobs supprimés.

Théo a mis le moteur derrière l'adoption du socle (D-0006), puis
derrière la transition de la documentation et la mise à jour du socle
(D-0016, D-0018), ce sujet excepté si son échéance approche (D-0016). Le
23 nov. 2026, il a remis la mise à jour, le socle n'étant pas prêt
(D-0024) : ce sujet passe devant, en commençant par les générations qui
expirent les 24 et 28 déc. (J-2026-11-23-O).

## Satisfait quand

- [x] chaque génération est dite « sert encore » ou « ne sert plus », avec sa raison et sa date d'expiration (J-2026-11-23-Q)
- [x] pour celles qui servent : la demande d'une seconde copie est posée à Théo, avec le volume, les lieux possibles et leur coût, et il y a répondu (D-0025, `disque` ; la copie : B-0077)
- [x] chaque génération tranchée avant sa propre date : le 24 déc. 2026 pour la première (toutes le 23 nov., J-2026-11-23-Q et J-2026-11-23-R)
