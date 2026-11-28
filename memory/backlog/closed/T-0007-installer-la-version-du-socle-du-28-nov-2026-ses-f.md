<!-- socle: couche=backlog zone=publique -->
# T-0007 — Installer la version du socle du 28 nov. 2026, ses fichiers protégés approuvés, et revérifier B-0083 sur elle

> statut : fait · origine : J-2026-11-28-A · besoin : B-0084 · lu : backlog@295035aa · ref : ce commit

Le livrable : le commit de la mise à jour (3b4b9a0), ses 39 fichiers
protégés approuvés par D-0034, et la revérification de B-0083 dans un
clone jetable (J-2026-11-28-A). Écrite après coup : `socle close` refuse
de clore un besoin sans tâche faite (J-2026-11-28-B).

## Fait quand

- [x] l'installeur a posé la version du 28 nov. 2026, et `python3 .socle/socle verify --fast` passe sur elle
- [x] Théo a validé la demande qui cite chaque fichier protégé changé avec son empreinte
- [x] l'état neuf, lancé sur une tête en retard sur une passation en attente, le dit en tête
