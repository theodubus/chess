<!-- socle: couche=demandes zone=publique -->
# D-0025 — Où garder une seconde copie des données d'entraînement qui servent encore

> date : 2026-11-23

## Décision demandée

Choisir où garder une seconde copie des quatre générations de données d'entraînement qui servent encore (75 Go), avant que GitHub ne les efface entre le 18 et le 29 janv. 2027.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs écrit en Rust ; son évaluation est un réseau de neurones que tu entraînes sur ta carte graphique, à partir de parties que le moteur joue contre lui-même sur les machines gratuites de GitHub (les runners). Ces parties, des milliards de positions notées par un réseau (l'étiqueteur), sont les données d'entraînement.

**Le chantier.** GitHub garde chaque lot de données produit sur ses runners (un artefact) 90 jours, puis l'efface. Le 12 nov. 2026, tu as répondu : pas de copie de ce qui ne sert plus. Le 17 nov., tu as fait passer ce sujet devant le reste si son échéance approchait ; ce soir, tu as reporté la mise à jour du socle (l'outil qui tient la mémoire du projet), et il passe devant. L'agent a dit ce qui sert encore, génération par génération : une génération est une campagne de parties notées par un même étiqueteur, numérotée comme les chantiers du projet (n° 18, n° 20…).

**La question.** Après ces dates, ta machine porte la seule copie de ce qui sert : il faut décider si une seconde copie se fait, et où, avant le 18 janv., la première date qui touche une génération qui sert.

**Les mots.** Une *séance* est une séance d'entraînement de réseaux sur ta carte. Un réseau *mesuré* a joué ses matchs contre un autre ; *embarqué*, il est dans le moteur et joue : c'est *le réseau qui joue*. La *base* d'un réseau candidat est celui contre lequel il se mesure, entraîné sur les mêmes données. La *recette* est le jeu de réglages de l'entraînement. Un *job* est une tâche sur un runner, six heures au plus ; un registre du dépôt garde, pour chaque job, de quoi le rejouer. L'Elo mesure un écart de force : 100 Elo d'écart, c'est ~64 % des points. Go et Mo sont des puissances de 1 000, Gio de 1 024 : 2 Gio valent 2,15 Go. *Le journal* est l'historique du projet dans le dépôt ; un identifiant `J-…`, `B-…` ou `D-…` y désigne une entrée, un sujet ou une demande, et `@…` la version lue.

**Ce qui sert, et pourquoi** (le détail est dans l'inventaire, lié plus bas) :
- **n° 21 et n° 22, 61 Go** : les données de la séance d'architecture de novembre, celle du réseau deux fois plus large qui sera bientôt mesuré puis embarqué. Ses réseaux, leur base et les architectures suivantes s'entraînent dessus ; le n° 22, étiqueté par le réseau qui joue, est aussi le stock des entraînements à venir, et la référence d'un test prévu de l'étiquetage (B-0023). Expirent les 24 et 29 janv.
- **n° 20 et (e), 13,5 Go** : les données du réseau qui joue aujourd'hui ; (e) a le même étiqueteur, avec une recherche deux fois plus longue par coup (10 000 nœuds de recherche au lieu de 5 000). Un réglage de recette se mesure contre ce réseau, sur ces données ; elles ne servent plus dès que le réseau suivant est embarqué, ce qui n'a pas de date : sa mesure et son embarquement attendent la mise à jour du socle. Expirent les 18 et 19 janv.

**Ce qui ne sert plus**, et expire sans copie, selon ta réponse du 12 nov. : trois générations de septembre et d'octobre (~3 Go, la première le 24 déc.), notées par l'évaluation écrite à la main (la *faite main*) ou par des réseaux des centaines d'Elo plus faibles ; le n° 18 (8,5 Go), noté par un vieux réseau, qui à quantité d'entraînement égale n'ajoutait rien au réseau (+0,25 ± 4,71 Elo, en octobre).

**Ta copie.** Tu as téléchargé ces générations pour les séances d'octobre et de novembre. Qu'elles soient encore sur ta machine, complètes, l'agent ne peut pas le voir : `disque` et `refuser` supposent que oui. Les ~600 artefacts ont leur taille dans les registres, de quoi te faire vérifier ta copie si tu le veux.

**Ce qui est vérifié pour les options.**
- **Une release de GitHub** (une page de téléchargements attachée au dépôt) accepte jusqu'à 1 000 fichiers de moins de 2 Gio chacun, sans limite de taille totale ni de bande passante (documentation de GitHub, lue à sa source le 23 nov.). Les quatre générations font 598 artefacts de ~125 Mo en moyenne. Le dépôt étant public, la release l'est aussi, comme les artefacts aujourd'hui ; ce sont des parties de notre moteur, sans données de tiers. Un workflow (un script que GitHub exécute sur ses runners) peut recopier les artefacts dans la release sans passer par ta connexion. L'agent l'écrit, mais ne pousse rien sous `.github/`, qu'il n'a pas le droit de modifier : tu l'ajoutes, puis tu le lances.
- **La regénération** : chaque partie dépend seulement d'un nombre de départ (la graine), de son numéro et de la longueur de la recherche, au commit du job, qui contient aussi l'étiqueteur ; un job se rejoue donc à l'identique, par construction, tant que ce commit reste dans le dépôt. Jamais éprouvé sur un artefact. Coût, à seize jobs à la fois, la limite que tu as fixée : ~1,5 jour de runners pour chacun des n° 20, (e) et n° 21, ~5 pour le n° 22, gratuits pour un dépôt public, mais rien d'autre ne tourne sur les runners pendant ce temps.
- Hugging Face, qui héberge des jeux de données, n'a pas pu être vérifié depuis la machine de l'agent : écarté.

## Éléments cités

- J-2026-11-23-Q@e33b2442 — l'inventaire des générations au journal : étiqueteur, volume, date, et pourquoi chacune sert ou non.
- B-0026@313a0972 — le sujet du backlog : dire ce qui sert encore, puis cette demande, avant chaque date d'expiration.
- D-0005@246fc680 — ta réponse du 12 nov. : pas de copie de ce qui ne sert plus.
- D-0016@fe4de17f — ta décision du 17 nov. : ce sujet passe devant si son échéance approche.
- D-0004@07480d37 — la limite de seize jobs à la fois sur les runners, qui fixe la durée d'une regénération.
- B-0012@4621f653 — le prochain match : le réseau deux fois plus large de la séance d'architecture contre sa base.
- B-0013@a6ecdb35 — l'embarquement du gagnant de cette séance, après quoi le n° 20 et (e) ne servent plus.
- B-0023@1467158b — un test prévu : étiqueter avec une recherche deux fois plus courte (1 250 nœuds par coup au lieu de 2 500), à comparer aux données du n° 22.
- B-0020@d3e6184f — une architecture suivante prévue (plus de variantes du réseau selon la case du roi), entraînée sur les mêmes données.
- B-0022@63f74a7c — une architecture suivante prévue, un réseau encore plus large, de même.
- 119b58d — le commit du dépôt public de la documentation de GitHub où la limite des releases a été lue.

## Où regarder

- [L'inventaire, J-2026-11-23-Q](https://github.com/theodubus/chess/blob/a8d4bac9abb9d25efa27a54be615dc0bf1435b71/memory/journal/2026-11-37.md) (le journal de novembre est découpé en fichiers numérotés, celui-ci est le 37ᵉ) : chaque génération, son étiqueteur, son volume, sa date, et pourquoi elle sert ou non. À vérifier : qu'aucune génération que tu comptais garder n'est dite « ne sert plus ».
- [B-0026](https://github.com/theodubus/chess/blob/a8d4bac9abb9d25efa27a54be615dc0bf1435b71/memory/backlog/B-0026-dire-quelles-donnees-d-entrainement-servent-encore.md) : le sujet et ses critères.

## Options

- **Une release de GitHub, remplie par un workflow.** L'agent écrit le workflow dès ta réponse ; tu l'ajoutes et le lances une fois par génération, le n° 20 d'abord, avant le 18 janv. Effort : quelques minutes pour toi, aucun envoi depuis ta connexion. Risque : que le workflow ne tienne pas dans un job pour le n° 22 ; il se découpe alors par vagues. S'il échoue, il reste le disque. Réversible : la release se supprime.
- **Un second disque chez toi.** Tu recopies 75 Go depuis ta machine. Effort : une copie, et un disque. Risque : les deux copies au même endroit. Réversible.
- **Pas de copie, la regénération en cas de perte.** L'agent rejoue d'abord un job du n° 20 et le confronte à son artefact, avant le 10 janv., pour que la regénération soit éprouvée avant la première expiration. Effort : un job et une comparaison ; en cas de perte, des jours de runners. Risque : un écart trouvé par l'essai renverrait à la release ou au disque, à huit jours de la première date.
- **Pas de seconde copie** : ta machine seule. Effort nul. Risque : une panne de son disque perd les données de la séance d'architecture, à regénérer sans essai préalable.
- **Une option par génération**, par exemple la release pour les n° 21 et n° 22 seulement : ta réponse les nomme.

## Conséquences

Si tu valides : l'agent écrit le workflow et te le donne à ajouter ; tu le lances, il vérifie que la release porte chaque artefact avec sa taille, et B-0026 se clôt. Si tu choisis le disque ou la regénération : l'agent consigne ton choix, fait l'essai de regénération si c'est elle, et B-0026 se clôt. Si tu choisis par génération : chacune suit son option. Si tu refuses : rien ne se copie, ta machine porte la seule copie après le 29 janv., et B-0026 se clôt. Sans réponse : rien ne se copie, et GitHub efface le n° 20 le 18 janv. ; l'agent te le rappelle à chaque récapitulatif de fin de tour d'ici là.

## Recommandation

La release de GitHub. Vérifié : ses limites, lues à la source, admettent ces 598 fichiers ; les quatre générations servent pour les raisons dites ; elles sont publiques aujourd'hui en artefacts. Supposé : qu'un workflow puisse lire les artefacts de jobs passés et les recopier dans le temps d'un job pour chacune des petites générations ; l'agent l'écrit pour s'arrêter proprement et reprendre là où il s'est arrêté si le temps manque. Non vérifié : l'état de ta copie.

## Réponses possibles

- `valider` — une release de GitHub, remplie par un workflow que l'agent écrit et que tu ajoutes.
- `disque` — un second disque chez toi ; l'agent n'écrit rien de plus.
- `regenerer` — pas de copie ; l'agent éprouve d'abord la regénération sur un job du n° 20, avant le 10 janv.
- `par-generation` — une option par génération, que ta réponse nomme.
- `refuser` — pas de seconde copie ; ta machine seule.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
