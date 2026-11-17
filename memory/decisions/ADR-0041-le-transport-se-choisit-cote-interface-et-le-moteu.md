<!-- socle: couche=decisions zone=publique -->
# ADR-0041 — Le transport se choisit côté interface, et le moteur n'en dépend pas

> statut : acceptée · date : 2026-11-17 · ref : D-0019, ADR-0010@e83c3531 · lu : decisions@52b5a77c

## Contexte

L'arbitrage A8 du carnet (ADR-0010@e83c3531), posé le 12 sept. 2026,
demandait comment l'interface parlerait au moteur : une application de
bureau, le moteur en WebAssembly dans le navigateur, ou un serveur qui
détient son processus. Il était resté « proposé », non bloquant, UCI
rendant le transport interchangeable (ADR-0004@0ea472d9). Le 17 nov. 2026, deux
transports sont en service, aucun choisi d'avance : en local, un pont
Node privé qui détient le processus du moteur et lui parle par HTTP et
WebSocket (`ui/README.md`, « Démarrer ») ; sur GitHub Pages, le binaire
du moteur compilé en WebAssembly, dans le navigateur (ADR-0028@675f2827). Aucune
application de bureau n'existe. Théo, interrogé par D-0019@3cbac288, a répondu
« constater ».

## Décision

A8 est tranché par l'usage, pas par un choix d'avance. Le moteur ne
connaît que UCI ; chaque transport s'écrit côté interface, sans une ligne
dans `engine/`. Deux sont en service au 17 nov. 2026 : le pont local pour
le développement, le WebAssembly pour la version web. Aucun n'est exclu,
ni le bureau, ni un serveur ; en ajouter un ne demande pas de décision du
moteur. Le détail, et ce qui change, vit dans `ui/README.md`, qui fait
foi.

## Conséquences

ADR-0010 passe à « abandonnée », close par celle-ci : une décision
proposée ne peut devenir que acceptée, rejetée ou abandonnée, et son
corps, « en attente », ne s'accepte pas tel quel. Rien ne change dans le
code. La décision renvoie le détail au README de l'interface, et ne
vieillit donc pas quand l'interface change de transport. La défaire : une
décision nouvelle qui la remplace, par exemple le jour où un transport
de production engagerait le moteur.
