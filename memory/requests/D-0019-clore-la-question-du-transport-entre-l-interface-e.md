<!-- socle: couche=demandes zone=publique -->
# D-0019 — Clore la question du transport entre l'interface et le moteur (ADR-0010) en constatant les deux transports en service

> date : 2026-11-17

## Décision demandée

Clore la question du transport entre l'interface et le moteur, ouverte depuis le 12 sept. 2026, en consignant les deux transports qui sont en service, sans en exclure aucun pour plus tard.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, qui parle le protocole UCI, avec une interface en TypeScript qui pilote n'importe quel moteur UCI, celui-ci compris. Le dépôt est à toi ; d'autres agents travaillent sur l'interface.

**Le chantier.** Tu as demandé, le 17 nov. 2026, de finir tous les sujets d'adoption du socle (la mémoire et les règles de travail du dépôt) avant de reprendre le moteur, puis de mettre le socle à jour. Un de ces sujets : les arbitrages du carnet de bord, recopiés en décisions de la mémoire, n'en laissent qu'un seul encore « proposé », sans réponse : le transport.

**La question.** L'arbitrage A8 demandait, le 12 sept. 2026, comment l'interface parlerait au moteur : une application de bureau qui lance le moteur comme processus fils (Tauri, Electron) ; une page web qui fait tourner le moteur compilé en WebAssembly ; ou un serveur qui détient le processus du moteur et lui relaie les commandes par HTTP ou WebSocket. Il a été laissé ouvert, « non bloquant », parce que UCI rend le transport interchangeable. Depuis, l'interface en a pris deux sans que la question soit close.

Ce qui est en service aujourd'hui, lu dans `ui/README.md` :

- **en local**, `npm run dev` ouvre l'interface dans le navigateur et un pont Node privé qui détient le processus du moteur et lui parle par HTTP et WebSocket, sur la même adresse que la page ; c'est la troisième forme d'A8, mais sur ta machine, pas sur un serveur. Ce README dit lui-même : « Le transport reste réservé au développement local ; le déploiement de production n'est pas choisi par cette interface. » ;
- **sur GitHub Pages**, depuis ta décision du 27 oct. 2026, le binaire du moteur lui-même, compilé en WebAssembly, tourne dans le navigateur, sans serveur ; c'est la deuxième forme d'A8 ;
- **aucune application de bureau** n'existe.

Le sujet du backlog qui porte cette demande croyait que les faits avaient choisi le bureau et le WebAssembly : c'est faux pour le bureau, corrigé ici.

Deux couplages notés à l'époque ne pèsent plus. A8 devait dire si la licence AGPL servait à quelque chose (elle ne sert concrètement qu'à un moteur sur serveur) : tu as gardé l'AGPL le 12 sept. pour d'autres raisons, et la décision de licence dit elle-même que le transport peut désormais être n'importe lequel. Et le WebAssembly était un argument pour Rust : la version web le réalise.

Une décision de la mémoire ne se réécrit pas : la clore, c'est changer son statut, et consigner ce qui la tranche dans une décision nouvelle.

## Éléments cités

- ADR-0010@e83c3531 — l'arbitrage A8, le transport entre l'interface et le moteur, encore « proposé ».
- ADR-0028@675f2827 — ta décision du 27 oct. 2026 : une version web sur GitHub Pages, sans effet sur le moteur.
- ADR-0007@a83563c3 — ta décision du 12 sept. 2026 de garder la licence AGPL, qui délie la licence du transport.
- B-0039@2998d4fd — le sujet du backlog qui demande de te faire clore cette question.

## Où regarder

- [ADR-0010, l'arbitrage A8 tel que le carnet l'avait laissé](https://github.com/theodubus/chess/blob/7b4e7571d9379a1ed342e08c039d28670ad3460b/memory/decisions/ADR-0010-a8-transport-desktop-webassembly-local-ou-moteur-d.md) : vérifier les trois formes et le « non bloquant ».
- [`ui/README.md`, sections « Démarrer » et « Version web (GitHub Pages) »](https://github.com/theodubus/chess/blob/7b4e7571d9379a1ed342e08c039d28670ad3460b/ui/README.md) : vérifier les deux transports en service, et la phrase qui laisse la production ouverte.
- [ADR-0007, la licence](https://github.com/theodubus/chess/blob/7b4e7571d9379a1ed342e08c039d28670ad3460b/memory/decisions/ADR-0007-a6b-gpl-3-0-ou-agpl-3-0-tranche-agpl-3-0.md) : sa « Conséquence sur A8 ».

## Options

- `constater` — une décision nouvelle, acceptée, consigne les deux transports en service : le pont local pour le développement, le WebAssembly pour la version web ; aucun n'est exclu pour plus tard, UCI restant la seule frontière. ADR-0010 passe à « abandonnée », close par elle. Effort : quelques minutes, un commit de mémoire. Risque : nul, rien ne change dans le code. Réversible : une décision acceptée peut être remplacée.
- `abandonner` — ADR-0010 passe à « abandonnée » sans décision nouvelle : la question n'a plus d'objet, puisque UCI rend le transport interchangeable et que l'interface choisit le sien. Effort et risque nuls. La mémoire ne dit alors nulle part quels transports existent ; le README de l'interface le dit seul.
- `laisser-ouverte` — ADR-0010 reste « proposée », pour le jour où un déploiement de production se choisira ; le sujet du backlog est abandonné. Effort et risque nuls. La mémoire garde une question ouverte que rien ne fera avancer.

## Conséquences

- Si tu valides : la décision nouvelle s'écrit et ADR-0010 se clôt, dans le prochain lot de mémoire ; un sujet d'adoption de moins.
- Si tu refuses : dis laquelle des deux autres options tu veux ; à défaut, la question reste ouverte et le sujet est abandonné.
- Sans réponse : rien n'en dépend ; le sujet reste ouvert et retient seulement le jalon d'adoption, donc la mise à jour du socle.

## Recommandation

`constater`, c'est la réponse `valider`. Vérifié : les deux transports et l'absence d'application de bureau, lus dans `ui/README.md` et `ui/package.json` ce jour ; le découplage de la licence, lu dans ADR-0007. Supposé : que tu ne prévois pas de déploiement de production sur serveur à court terme ; si tu en prévois un, `laisser-ouverte` est la bonne réponse.

## Réponses possibles

- `valider` — l'option `constater` : une décision nouvelle consigne les deux transports en service, et ADR-0010 est close.
- `refuser` — ni constat ni clôture dans cette forme ; préciser `abandonner` ou `laisser-ouverte`.
- `abandonner` — ADR-0010 est abandonnée sans décision nouvelle.
- `laisser-ouverte` — ADR-0010 reste proposée, le sujet du backlog est abandonné.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
