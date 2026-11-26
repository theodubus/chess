<!-- socle: couche=backlog zone=publique -->
# T-0005 — Les messages d'échec des trois tests au vrai fichier d'instructions, après D-0030

> statut : ouvert · origine : J-2026-11-26-K · besoin : B-0082 · lu : backlog@1b24cafe

Un commit, si Théo valide D-0030 : les messages d'échec qui nomment encore
`CLAUDE.md` dans `larbre_de_recherche_ne_bouge_pas_en_silence`,
`chaque_dispositif_automatique_est_nomme_dans_la_documentation`,
`chaque_piege_archive_nomme_un_dispositif_qui_existe` et
`larchive_reste_atteignable_depuis_claude_md` nomment `AGENTS.md`, et cette
dernière fonction devient `larchive_reste_atteignable_depuis_les_instructions`,
mot pour mot comme D-0030 le dit. Aucune condition ne change. Refusée :
la tâche se clôt sans rien changer.

## Fait quand

- [ ] D-0030 répondue ; si validée, `python3 .socle/socle check` accepte le changement en la citant
- [ ] si validée, `tools/verify.sh` passe, et plus aucun message d'échec des trois tests ne renvoie à `CLAUDE.md` ; l'assertion qui exige qu'il existe (`le_parcours_trouve_la_documentation_du_depot`) reste, seule à faire tomber un test s'il disparaît
