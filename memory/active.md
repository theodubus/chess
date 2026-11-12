<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'adoption du socle, entière, avant tout travail sur le moteur : Théo, le
12 nov. 2026 (D-0006, D-0008). Le jalon B-0031 dit ce que « finie » veut
dire.

**En pause à la demande de Théo** (J-2026-11-12-K) : ne rien relancer
avant son signal, pour économiser de l'usage. Une mise à jour du socle
est prête ; il donnera lui-même le prompt d'installation.

Où en est le travail : la branche de développement porte la sortie du
mode adoption (B-0001) et la conversion à blanc du carnet (B-0005),
poussées, **sans pull request ouverte**. La revue du script de
conversion est revenue, ses constats notés et pas encore traités.

## Prochaines étapes

À la reprise, dans l'ordre : traiter les cinq constats de la revue du
script `tools/carnet-vers-md.py` (J-2026-11-12-L), dont le bandeau du
carnet, qu'il ne convertit pas ; ouvrir la pull request et la fusionner à CI
verte ; clore B-0001 puis B-0005 ; poser le journal du carnet (B-0006),
public sans tri (D-0007) ; puis ses autres rubriques (B-0007) et
`CLAUDE.md` en trois lots (B-0008 à B-0010).

Attend Théo : la demande sur les hooks en double du démarrage et de la
fin de tour (D-0009), que B-0002 et B-0004 attendent.

Le registre des réglages ouverts n'est écrit que dans `tools/README.md`,
sous-section « La file ». Les données d'entraînement expirent chez GitHub
à partir du 14 janv. 2027 (F-0005, B-0026).

Livraison, confirmée par Théo : une branche de développement, une seule
pull request ouverte à la fois, fusionnée par l'agent à CI verte, tous
les contrôles finis, par la méthode « merge ».
