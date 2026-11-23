<!-- socle: couche=demandes zone=publique -->
# D-0023 — Relever le plafond de la mémoire canonique de 16 000 à 20 000 octets

> date : 2026-11-23

## Décision demandée

Autoriser l'agent à relever de 16 000 à 20 000 octets le plafond du fichier des faits vérifiés, `memory/canonical.md`, pour que deux mesures y entrent et que le prochain réseau embarqué ait la place d'y être décrit.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs écrit en Rust, avec une interface à part ; son évaluation est un réseau de neurones entraîné sur ta carte graphique, et chaque changement se juge par des matchs joués sur les machines gratuites de GitHub.

**Le chantier.** Le socle, la mémoire du projet tenue dans le dépôt et vérifiée par des contrôles, finit d'être adopté. Le 17 nov. 2026, tu as voulu que `tools/README.md`, la documentation des outils de mesure, ne garde que le mode d'emploi des outils, et que tout le reste — 1,5 Mo de récits de chantiers, de verdicts de matchs et de réglages — aille à sa place dans la mémoire ; puis la mise à jour du socle vers sa version suivante. Le 18 nov., tu as validé le découpage de ce travail en huit lots, chacun une pull request que l'agent fusionne lui-même : le dernier part aujourd'hui.

**La question.** Ce découpage disait, mot pour mot : « Les faits ont un plafond de 16 Ko pour le fichier entier, parce qu'ils sont injectés à chaque démarrage et occupent la place de travail de l'agent [...]. Alors l'agent te demandera, à part, de relever ce plafond [...] ; si tu refuses, seuls les faits dont une règle ou un sujet ouvert dépend restent, les autres vont au journal avec leur récit. » Le fichier fait aujourd'hui 15 945 octets : il est plein.

**Les couches de la mémoire, en bref.** Les *faits* (`memory/canonical.md`) sont les mesures vérifiées dont le travail dépend ; l'agent les lit à chaque démarrage de session, avant toute autre chose. Le *journal* garde l'histoire, une entrée par événement : il ne se lit que quand on le cherche. Le *backlog* est la liste ordonnée des sujets à faire. `CLAUDE.md` porte les règles de travail, lu lui aussi à chaque démarrage (64 Ko). Le plafond est un *garde-fou* du socle, une ligne du fichier `.socle/guardrails.toml` ; l'assouplir demande ta validation.

**Ce qui entrerait, si tu valides** (~1,2 Ko) :
- **l'étalon du temps** : doubler le temps de réflexion vaut +107,7 ± 8,2 Elo (la mesure de force des échecs) et +1,38 ± 0,28 pli (un coup d'un camp) de profondeur, à la cadence où se jugent les changements. Chaque prévision chiffrée de l'agent passe par lui, et ton découpage le citait en exemple de fait. Il vit aujourd'hui dans une règle de `CLAUDE.md` : il en sortirait, la règle renvoyant au fait, donc **déplacé, pas recopié**, pour un coût de lecture à peu près nul ;
- **le tour de boucle** : faire étiqueter les données d'entraînement par le meilleur réseau, plus fort de ~40 Elo que l'étiqueteur d'avant, a rendu +10,15 ± 3,33 Elo au réseau entraîné dessus, à quantité de données égale. Il vit dans le sujet du backlog qui reprendra la génération de données, qui en tire sa règle ; en fait, il servirait aussi aux autres décisions sur les données, comme dire avant fin décembre lesquelles garder.

**Et la place du prochain réseau.** Le réseau qui joue sera bientôt remplacé par un réseau deux fois plus large, issu de la séance d'architecture de novembre. Le décrire, avec son facteur des marges (l'échelle où ses scores se lisent) et sa force mesurée, prendra quelques centaines d'octets de plus que les lignes d'aujourd'hui. À 20 000, il resterait ~2,8 Ko après les deux faits.

## Éléments cités

- D-0020@def0e671 — ton découpage du 18 nov. de la transition de la documentation, qui prévoyait cette demande si le plafond était dépassé.
- F-0009@5f81efcf — le fait des réglages ouverts du réseau, où le tour de boucle prendrait sa ligne.
- F-0007@78cbc142 — le fait qui décrit le réseau qui joue, à réécrire au prochain embarquement.
- B-0024@24256134 — le sujet qui reprendra la génération de données, où le tour de boucle vit aujourd'hui.
- B-0013@a6ecdb35 — le sujet qui embarquera le réseau deux fois plus large.

## Où regarder

- [memory/canonical.md](https://github.com/theodubus/chess/blob/1f6df6602ba6721a1c6b99422154355d79fc4559/memory/canonical.md) : les quatorze faits. Les plus longs sont les deux tables des réglages ouverts (3,3 et 2,8 Ko, une ligne par réglage) ; les plus courts, quatre faits que le socle écrit seul (moins de 0,5 Ko chacun).
- [.socle/guardrails.toml](https://github.com/theodubus/chess/blob/1f6df6602ba6721a1c6b99422154355d79fc4559/.socle/guardrails.toml) : la section `[budgets]`, où la ligne `"memory/canonical.md" = { max_bytes = 16000 }` changerait.
- [D-0020](https://github.com/theodubus/chess/blob/1f6df6602ba6721a1c6b99422154355d79fc4559/memory/requests/D-0020-decouper-la-transition-de-tools-readme-md-et-du-re.md) : son paragraphe « La limite à connaître », cité plus haut.

## Options

- **Relever à 20 000 octets.** La ligne des garde-fous change, puis les deux faits entrent, dans la pull request qui suivra celle d'aujourd'hui. Effort : un commit. Risque : ~300 jetons de plus lus à chaque démarrage pour les deux faits, ~1 000 quand le fichier sera plein, à comparer aux ~16 000 de `CLAUDE.md`. Réversible : rebaisser le plafond est libre, et les faits repartent au journal.
- **Garder 16 000 octets.** Rien ne change : l'étalon reste dans la règle, le tour de boucle dans le sujet du backlog, où ils servent déjà. Effort : nul. Risque : chaque fait nouveau, à commencer par le prochain réseau, oblige à en envoyer un autre au journal, moins lu. Réversible.
- **Condenser les faits existants**, sans relever : supposé, non mesuré, quelques centaines d'octets au plus, les tables des réglages ayant une ligne par réglage et les quatre faits automatiques étant déjà courts ; pas la place des deux faits.

## Conséquences

Si tu valides : le plafond passe à 20 000 et les deux faits entrent dans la pull request suivante. Si tu refuses : les deux mesures restent où elles sont, et chaque ajout aux faits se paiera d'un retrait. Sans réponse : rien ne change ; la question reviendra à l'embarquement du prochain réseau.

## Recommandation

Relever à 20 000 octets. Vérifié : le fichier fait 15 945 octets sur 16 000 ; les deux mesures et leurs intervalles sont au journal ; l'étalon serait déplacé de `CLAUDE.md`, pas recopié. Supposé : 2,8 Ko de marge suffiront pour le prochain réseau et sa force mesurée ; la version suivante du socle, pas encore lue, pourrait changer ses plafonds par défaut.

## Réponses possibles

- `valider` — le plafond passe à 20 000 octets, l'étalon du temps et le tour de boucle deviennent des faits.
- `refuser` — le plafond reste à 16 000 octets, les deux mesures restent dans la règle et dans le sujet du backlog.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
