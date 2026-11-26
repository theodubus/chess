<!-- socle: couche=backlog zone=publique -->
# B-0057 — Mesurer Lazy SMP au-delà de deux fils, et ses variantes

> statut : ouvert · origine : J-2026-11-17-AI · après : B-0065 · priorité : basse · lu : backlog@c40befb4

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Lazy SMP au-delà de deux fils, et ses variantes : décalage de profondeur
entre fils, coup du meilleur fil, historiques partagés, fils gardés d'un
coup à l'autre. Pas commencées ; chacune se mesure seule. Condition : une
machine à plus de deux cœurs physiques, que les runners de GitHub n'ont
pas. Inférence de l'agent, confiance moyenne : ces variantes servent la
diversité entre fils, sous-évaluée à deux fils.

Le jeu à quatre fils, Théo l'a remis à plus tard le 9 nov. 2026 (« *on
fera ça plus tard* », J-2026-11-18-AE). Sa machine porte 8 cœurs
physiques et 16 fils, un Intel Core i7 de 11ᵉ génération, un portable
selon lui, le modèle exact à vérifier : assez pour un match à quatre fils
contre quatre, une partie à la fois. D'abord notre mise à l'échelle, 4
fils contre 1 à `8+0,08` ; puis, éventuellement, la note 4CPU de la
CCRL. Un portable peut brider sa fréquence sous une charge longue :
symétrique pour les deux moteurs, à surveiller contre une échelle
extérieure.

## Satisfait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : chaque variante mesurée seule, à plus de deux cœurs physiques
