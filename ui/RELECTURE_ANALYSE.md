# Relecture finale — sélection fixée

5 octobre 2026. Six cas, sans ajout automatique. Les deux premiers textes ont
déjà reçu l’accord de Théo le 4 octobre. Les quatre autres restent à relire.
Cette relecture ne mesure pas une couverture générale et ne rouvre pas le
chantier des tactiques différées.

## Ce qui est demandé

Pour les **cas 3 à 6 seulement**, dire si le texte est clair ou trompeur, et si
les repères éventuels montrent seulement le nécessaire. Une réponse courte
comme « 3 clair ; 4 trompeur parce que… ; 5 clair ; 6 clair » suffit.
Pour une abstention, il s’agit de juger si l’interface exprime honnêtement son
incertitude, pas de trouver une nouvelle explication à coder.

Les cas figés utilisent les instantanés déjà conservés. Aucun moteur supplémentaire
ni nouveau calcul ne sont nécessaires pour les ouvrir. Le cas 4 utilise aussi
le parcours réel d’import PGN ; les captures permettent de relire sans importer.

Les liens ci-dessous visent le serveur local de cette relecture, port 5180.
Pour le rouvrir après arrêt, depuis la racine du dépôt :

```bash
npm --prefix ui run dev -- --port 5180
```

Ce lancement démarre le front et son pont ensemble, avec le binaire local existant.
Sur un serveur déjà lancé ailleurs, reprendre le même chemin `/dev/…` avec son port.

## Les six cas

| Cas | Situation et attente | État |
|---|---|---|
| 1 | Clouage exploité : la contrainte du cavalier puis les reprises conduisent au bilan montré. | Texte approuvé le 4 octobre |
| 2 | Dxd4 : prendre une tour avec la dame puis perdre cette dame conduit à −4, reprises incluses. | Texte approuvé le 4 octobre |
| 3 | a8=D puis Txa8 : promotion +8, perte de la dame −9, bilan −1. | À relire |
| 4 | fxe3 après …Cxe3 : une reprise dans un échange commencé, sans affirmer que cette reprise ouvre un gain. | À relire |
| 5 | Tb1, …Txb1+, Dxb1 : la capture de la tour est compensée par la reprise ; pas de faux récit de gain net. | À relire |
| 6 | Coup classé « Gaffe » dans une partie réelle, sans raison courte confirmée : abstention explicite. | À relire |

### Cas 1 et 2 — déjà relus

[Ouvrir le clouage](http://127.0.0.1:5180/dev/pedagogy-review.html?sample=opportunity&case=pin-retreat&engine=ShallowRed)
et [ouvrir Dxd4](http://127.0.0.1:5180/dev/pedagogy-review.html?sample=exposure&case=moved-capture&engine=ShallowRed).
Ce sont des exemples construits de développement, pas des mesures indépendantes.

### Cas 3 — promotion capturée

[Ouvrir le cas 3](http://127.0.0.1:5180/dev/pedagogy-review.html?sample=exposure&case=moved-promotion&engine=ShallowRed)
ou [voir la capture](dev/relecture/cas-3.png).
Le repère commence après la promotion et montre ensuite la capture. L’autre
choix évoqué dans le contexte n’est pas présenté comme l’unique bon coup.

### Cas 4 — reprise dans un échange déjà commencé

[Voir la capture du parcours réel](dev/relecture/cas-4.png).
Pour le reproduire : ouvrir [l’UI](http://127.0.0.1:5180), importer le texte de
[relecture-reprise.pgn](dev/relecture-reprise.pgn), puis aller à la position finale,
« Après 9. fxe3 ».

Le texte observé indique : « Ce coup est une reprise dans un échange déjà commencé.
Une nouvelle reprise reste possible : le bilan de cet échange n’est pas encore
établi. » La recherche réelle n’a pas confirmé la suite …Dxe3+ de la fixture
logicielle : aucun bilan global de cette suite n’est donc affirmé ici.
Le classement et le score peuvent varier avec la recherche ; la note de contexte
ne transforme pas la reprise en nouvel échange gagnant.

### Cas 5 — compensation, abstention

[Ouvrir le cas 5](http://127.0.0.1:5180/dev/pedagogy-review.html?sample=exposure&case=moved-defended&engine=ShallowRed)
ou [voir la capture](dev/relecture/cas-5.png).
Le contrôle refuse une explication de perte courte : la reprise compense la
capture montrée. L’écran n’invente ni un gain de cinq points ni une démonstration
causale. Il ne prétend pas expliquer la valeur positionnelle de Tb1.

### Cas 6 — gaffe sans raison confirmée

[Ouvrir le cas 6](http://127.0.0.1:5180/dev/pedagogy-audit.html?sample=final&game=7rzcutsf&engine=Stockfish&ply=32)
ou [voir la capture](dev/relecture/cas-6.png).
L’instantané de Stockfish classe 16…Fxh3 défavorablement. Les contrôles conservés
n’établissent pas de raison courte : aucun « Montrer pourquoi » n’est proposé.
La raison reste inconnue dans le périmètre actuel ; ce cas n’ajoute pas une tâche.

## Portée du contrôle

Les liens sélectionnent explicitement leur cas, leur moteur et, pour l’audit,
leur demi-coup. Un paramètre absent des données est refusé plutôt que remplacé
silencieusement par le premier exemple. Les pages figées n’ajoutent aucune
classification à une partie jouée et ne modifient aucun PGN utilisateur.

Contrôle visuel du 5 octobre : Chromium local, bureau 1440 × 1000 et téléphone
émulé 390 × 844. Les six cas, le clavier, le retour et les limites de l’UI ont
été vérifiés sans erreur JavaScript ni débordement horizontal. Les parcours
partie contre bot, deux humains, import valide/refus invalide, perte courte,
mat déjà joué, retour avec dessins conservés et retentative ont aussi été vérifiés.
Les captures
documentent ce passage, pas un test sur téléphone physique ni une validation
humaine des textes restants.

Les [limites du produit](ANALYSE_PEDAGOGIQUE.md) restent la référence.
