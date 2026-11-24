<!-- socle: couche=backlog zone=publique -->
# B-0081 — Faire garder par outillage_documente les scripts Python de tools/

> statut : ouvert · origine : J-2026-11-24-J · priorité : basse · lu : backlog@a129a103

`engine/tests/outillage_documente.rs` exige que chaque dispositif soit
nommé, avec son extension, dans une doc. Il énumère les fichiers par
répertoire et par extension, mais pour `tools/` il ne cherche que les
`.sh` : les scripts Python y échappent. Le contrôle `docs.outillage` du
socle ne les voit pas non plus, `tools/` n'étant pas dans `[tooling]
paths` des garde-fous.

La relecture de B-0079 l'a montré : sur le commit du retrait, remettre
le script retiré sans aucune doc laisse tous les contrôles au vert. Le
seul script Python de `tools/` qui reste, `tools/candidat-reseau.py`,
est documenté (`tools/README.md` et le skill `embarquer-un-reseau`) mais
rien ne le garde : sa doc pourrait disparaître sans qu'un contrôle le
voie.

Ajouter `.py` aux extensions de `tools` dans `dispositifs()`, et
`candidat-reseau.py` aux attendus de
`le_controle_voit_les_dispositifs_quil_doit_voir`. Les deux durcissent le
garde-fou, sans changer de valeur attendue. Vérifier d'abord quels `.py`
le parcours ramasserait : les scripts d'une rustine de l'attic, extraits
dans l'arbre, ne doivent pas y entrer.

## Fait quand

- [ ] `dispositifs()` voit les `.py` de `tools/`, et un test qui retire la doc de `tools/candidat-reseau.py` échoue, puis repasse avec elle
