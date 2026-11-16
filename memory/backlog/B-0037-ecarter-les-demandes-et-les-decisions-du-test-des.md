<!-- socle: couche=backlog zone=publique -->
# B-0037 — Écarter les demandes et les décisions du test des chiffres du banc

> statut : ouvert · origine : J-2026-11-16-D · après : D-0013, D-0015 · lu : backlog@880d2ed1

Le test des chiffres de référence du banc (`engine/tests/bench_reference.rs`)
parcourt tous les fichiers Markdown du dépôt. Il en écarte le journal de la
mémoire depuis D-0013, au motif que le journal est en ajout seul : un
chiffre qu'il porte est une trace datée, qu'on ne peut pas mettre à jour.

La relecture du correctif a relevé que ce motif vaut aussi ailleurs dans
la mémoire. Une demande qui a reçu sa réponse est gelée, puisque la
réponse porte l'empreinte de son texte, et le corps d'une décision l'est
aussi. Le test les parcourt pourtant encore. Il l'a montré en refusant
D-0013 elle-même, dont la question citait son marqueur ; la question a dû
être reformulée par rapport à ce que Théo avait lu.

Une demande ou une décision qui citerait une ligne de référence avec son
chiffre ferait tomber le test au prochain changement de l'arbre, sans
correction possible. Le lot B-0007 posera dix-huit arbitrages du carnet
en décisions, avec leurs citations : c'est là que le cas peut se
présenter.

D-0013 ne couvre que le journal. Étendre l'exclusion assouplit encore le
test : c'est à Théo de le décider.

## Fait quand

- [x] Théo a dit si les demandes et les décisions sont écartées à leur tour
- [ ] le test et ses cas suivent sa réponse, ou le sujet est abandonné sur elle
