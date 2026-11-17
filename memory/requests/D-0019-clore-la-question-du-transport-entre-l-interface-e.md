<!-- socle: couche=demandes zone=publique -->
# D-0019 — Clore la question du transport entre l'interface et le moteur (ADR-0010), et sous quelle forme

> date : 2026-11-17

## Décision demandée

Comment clore la question du transport entre l'interface et le moteur, ouverte depuis le 12 sept. 2026 : par une décision nouvelle qui dit la règle que les faits ont établie, par un simple abandon, ou en la laissant ouverte.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, qui parle UCI (*Universal Chess Interface*, le protocole texte standard entre une interface d'échecs et un moteur), avec une interface en TypeScript qui pilote n'importe quel moteur UCI, celui-ci compris. Le dépôt est à toi ; l'agent qui écrit cette demande travaille sur le moteur et sa mémoire, d'autres agents sur l'interface.

**Le chantier.** Le socle est l'outillage installé le 11 nov. 2026 qui tient la mémoire du projet en fichiers (faits, décisions, journal, backlog, demandes comme celle-ci) et en vérifie les règles. Tu as demandé, le 17 nov. 2026, de finir de l'adopter, puis de le mettre à jour vers sa version nouvelle depuis un dépôt entièrement conforme, et seulement ensuite de reprendre le moteur. Un des derniers sujets : l'ancien carnet de bord du projet, tenu jusqu'en novembre, numérotait ses arbitrages A1, A2… ; recopiés en décisions de la mémoire (des ADR, *Architecture Decision Records*, une par fichier), ils sont tous tranchés sauf A8, le transport, resté « proposé ».

**La question.** A8 demandait, le 12 sept. 2026, comment l'interface parlerait au moteur : une application de bureau qui lance le moteur comme processus fils (Tauri, Electron) ; une page web qui fait tourner le moteur compilé en WebAssembly ; ou un serveur qui détient le processus du moteur et lui relaie les commandes par HTTP ou WebSocket. Il a été laissé ouvert, « non bloquant », parce que UCI, l'unique frontière entre le moteur et le reste du monde, tranchée le même jour, rend le transport interchangeable sans toucher au moteur. Depuis, l'interface en a pris deux, sans que la question soit close.

Ce qui est en service aujourd'hui, lu dans `ui/README.md` :

- **en local**, `npm run dev` ouvre l'interface dans le navigateur et un pont Node privé, qui détient le processus du moteur et lui parle par HTTP et WebSocket, sur la même adresse que la page : la troisième forme d'A8, mais sur ta machine. Le README ajoute : « Le transport reste réservé au développement local ; le déploiement de production n'est pas choisi par cette interface. » — un « déploiement de production » serait une interface servie à d'autres que toi, sur un serveur ;
- **sur GitHub Pages**, depuis ta décision du 27 oct. 2026, le binaire du moteur lui-même, compilé en WebAssembly, tourne dans le navigateur, sans serveur : la deuxième forme ;
- **aucune application de bureau** n'existe.

Le sujet du backlog qui porte cette demande croyait que les faits avaient choisi le bureau et le WebAssembly : c'est faux pour le bureau, corrigé ici.

Deux liens notés à l'époque ne pèsent plus. La licence AGPL (la GPL, plus l'obligation de publier le source d'un programme offert par le réseau) ne sert concrètement qu'à un moteur sur serveur ; elle a été gardée le 12 sept. sans attendre A8, et sa décision le dit : « A8 peut désormais retenir n'importe quel transport, le moteur distant inclus, sans que la licence pose question. » Et le WebAssembly était un argument du choix de Rust pour le moteur : la version web le réalise.

Une décision de la mémoire ne se réécrit pas : seul son statut change. Une décision « proposée » ne peut devenir que « acceptée », « rejetée » ou « abandonnée » ; « remplacée » n'existe que pour une décision déjà acceptée. ADR-0010 dit « En attente » dans son corps : l'accepter telle quelle n'aurait pas de sens, et la seule façon de la clore est « abandonnée », avec ou sans une décision nouvelle qui dit ce qui tranche.

**Le texte de la décision nouvelle, si tu valides**, titre « Le transport se choisit côté interface, et le moteur n'en dépend pas » :

> A8 est tranché par l'usage, pas par un choix d'avance. Le moteur ne connaît que UCI ; chaque transport s'écrit côté interface, sans une ligne dans `engine/`. Deux sont en service au 17 nov. 2026 : le pont local pour le développement, le WebAssembly pour la version web. Aucun n'est exclu, ni le bureau, ni un serveur ; en ajouter un ne demande pas de décision du moteur. Le détail, et ce qui change, vit dans `ui/README.md`, qui fait foi.

C'est une règle plutôt qu'un état : elle ne vieillit pas quand l'interface change de transport, puisqu'elle renvoie le détail au README de l'interface.

## Éléments cités

- ADR-0010@e83c3531 — l'arbitrage A8, le transport entre l'interface et le moteur, encore « proposé ».
- ADR-0004@0ea472d9 — l'arbitrage A4, UCI unique frontière entre le moteur et l'interface.
- ADR-0003@0aa2d71e — l'arbitrage A3, le choix de Rust pour le moteur.
- ADR-0028@675f2827 — ta décision du 27 oct. 2026 : une version web sur GitHub Pages, sans effet sur le moteur.
- ADR-0007@a83563c3 — la décision du 12 sept. 2026 de garder la licence AGPL, qui délie la licence du transport.
- B-0039@2998d4fd — le sujet du backlog qui demande de te faire clore cette question.

Le suffixe après `@` est l'empreinte de la version lue de chaque entrée.

## Où regarder

- [ADR-0010, l'arbitrage A8 tel que le carnet l'avait laissé](https://github.com/theodubus/chess/blob/7b4e7571d9379a1ed342e08c039d28670ad3460b/memory/decisions/ADR-0010-a8-transport-desktop-webassembly-local-ou-moteur-d.md) : les trois formes et le « non bloquant ».
- [`ui/README.md`, sections « Démarrer » et « Version web (GitHub Pages) »](https://github.com/theodubus/chess/blob/7b4e7571d9379a1ed342e08c039d28670ad3460b/ui/README.md) : les deux transports en service, et la phrase qui laisse la production ouverte.
- [ADR-0007, la licence](https://github.com/theodubus/chess/blob/7b4e7571d9379a1ed342e08c039d28670ad3460b/memory/decisions/ADR-0007-a6b-gpl-3-0-ou-agpl-3-0-tranche-agpl-3-0.md) : sa « Conséquence sur A8 », citée plus haut.

## Options

Chacune clôt le sujet B-0039 et libère le jalon de l'adoption, sauf l'absence de réponse.

- `constater` — la décision nouvelle ci-dessus, acceptée ; ADR-0010 passe à « abandonnée », close par elle. Ce qu'elle apporte de plus qu'un abandon : un agent qui lit la mémoire, celui du moteur comme ceux de l'interface, y trouve la règle (le transport ne touche jamais `engine/`) au lieu d'une question abandonnée sans raison. Effort : un commit de mémoire. Risque : nul, aucun code ne change. Réversible : une décision acceptée peut être remplacée.
- `abandonner` — ADR-0010 passe à « abandonnée » sans décision nouvelle : la question n'a plus d'objet, UCI rendant le transport interchangeable. Effort et risque nuls. La mémoire ne dit alors nulle part ce qui l'a close ; le README de l'interface dit seul quels transports existent.
- `laisser-ouverte` — ADR-0010 reste « proposée », pour le jour où tu voudrais choisir un transport de production comme une décision du projet et non de l'interface ; le sujet B-0039 est abandonné. Effort et risque nuls. La mémoire garde une question ouverte que rien ne fera avancer.

## Conséquences

- Si tu valides : la décision nouvelle s'écrit telle que citée, et ADR-0010 se clôt, dans le prochain lot ; un sujet d'adoption de moins.
- Si tu refuses : dis laquelle des deux autres options tu veux, ou réponds-la directement ; à défaut, la question reste ouverte et le sujet est abandonné, comme `laisser-ouverte`.
- Sans réponse : le sujet reste ouvert, et retient le jalon de l'adoption, donc la mise à jour du socle et la reprise du moteur. Le reste de l'adoption, la transition de la documentation des outils surtout, prendra plusieurs jours : une réponse dans ce délai ne retarde rien.

## Recommandation

`constater`, c'est la réponse `valider`. Vérifié : les deux transports et l'absence d'application de bureau, lus ce jour dans `ui/README.md` et `ui/package.json` (ni Tauri ni Electron) ; la phrase de la licence, citée de sa décision ; les statuts permis, lus dans le format de la mémoire. Supposé : que tu ne veux pas faire du transport de production une décision du projet ; si tu le veux, `laisser-ouverte`.

## Réponses possibles

- `valider` — l'option `constater` : la décision nouvelle citée s'écrit, et ADR-0010 est close.
- `refuser` — ni constat ni clôture dans cette forme ; préciser `abandonner` ou `laisser-ouverte`.
- `abandonner` — ADR-0010 est abandonnée sans décision nouvelle, et B-0039 clos.
- `laisser-ouverte` — ADR-0010 reste proposée, et B-0039 est abandonné.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
