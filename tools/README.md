# tools

Outillage de mesure. **Pas encore démarré.**

Un changement de recherche qui vaut 10 Elo demande des milliers de parties pour
être distingué du bruit. Sans protocole, on ajoute des choses qui affaiblissent
le moteur en croyant l'inverse.

À construire au plus tard quand la recherche existera :

- **Matchs moteur contre moteur** via `cutechess-cli` : nouvelle version contre
  version précédente, cadences courtes pour le volume.
- **Livre d'ouvertures** de positions équilibrées — sans lui, toutes les parties
  de test sont identiques et l'on ne mesure rien.
- **SPRT** : le test séquentiel décide « accepté » ou « rejeté » dès que les
  données suffisent, au lieu d'un nombre fixe de parties.

En attendant, `cargo run --release --bin shallowred -- bench` mesure la
vitesse — pas la force. Les deux sont nécessaires et ne se remplacent pas.
