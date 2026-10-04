# Retraite fermée et conséquence matérielle directe

Raccordement du 4 octobre 2026, sous `ui/**`, sans modification du moteur.
La portée est `observed-consequence` : mécanisme et bilan dans les recherches,
pas une preuve que toutes les défenses perdent ni que la sortie était unique.

## Faits et questions

`closedRetreats` exige une victime restée sur sa case, une sortie auparavant
légale sans perte matérielle locale immédiate, et le bloqueur réellement déplacé
par le coup examiné. La menace arrive au coup adverse suivant. Une sortie
simplement supprimée, ancienne ou déjà exposée ne suffit pas.

`RestrictionEffectVerification` recherche librement avant la décision et après
le coup, puis après la menace si le premier choix moteur correspond à celle
de l'hypothèse. Deux budgets indépendants 300/900 ms, au plus six recherches,
3 600 ms nominaux ; délai commun de 12 s, connexions comprises. Historique UCI
complet, `Engine`/`FocusedAnalysis`, cache/arrêt du contrat `BoundedVerification`.
Aucune alternative, `MultiPV`, `searchmoves` ou sonde avec trait artificiel dans
les questions moteur.

## Lien entre restriction et perte

Le témoin suit la même identité de pièce. Trois liens sont admis :

- la nouvelle attaque capture la victime restée sur sa case ;
- la première défense de la victime capture le nouvel attaquant, puis la
  réponse adverse immédiate reprend la victime ;
- la victime tente une sortie déjà inventoriée comme exposée après la menace,
  puis est immédiatement capturée par l'attaquant identifié de cette sortie.
  Des prises préparatoires peuvent précéder ce déplacement, mais le bloqueur
  doit encore fermer la retraite d'origine. Une nouvelle perte sans ce lien
  ne démontre pas la restriction.

Chaque recherche doit fournir son propre lien physique, un bilan négatif
identique depuis **avant la décision**, et un échange clôturé. Les captures ou
défenses peuvent différer entre les deux recherches : elles illustrent le même
mécanisme, sans imposer une seule ligne. Scores exacts en centipions, différence
de chaque évaluation entre budgets au plus 100 cp : seuil de développement,
pas mesure de pertinence pédagogique. Une perte compte aussi lorsque son camp
reste gagnant selon le score.

Le suivi conserve prises, reprises, promotions, échecs intermédiaires et
compensations immédiates. Huit demi-coups au maximum après la décision. L'attaque
initiale ne consomme pas la limite des coups calmes ; plusieurs coups calmes
après cette menace, reprise encore pendante, mat, nulle et compensation empêchent
de publier une perte matérielle confirmée. La disponibilité d'une reprise ne
prouve pas qu'elle soit bonne : le choix effectif du moteur reste explicite.

## Texte et illustration

`restrictionDraft` contrôle de nouveau positions/historique, hypothèse, routes,
captures et bilans. Il raconte bloqueur → attaque → capture/reprise → bilan,
sans comparaison obligatoire. La première position est déjà après la décision.
Le repère garde les reprises utiles ; un choix calme final qui atteste le refus
de reprendre peut devenir une note, sans supprimer capture, promotion ou échec.
`directExplanation` rejoue toutes les étapes avant affichage dans la revue.

Les cas construits couvrent compensation incluant la prise initiale, défense
par une autre pièce, sortie exposée, échange préparatoire, couleurs inversées,
reprise pendante, menace/score instable, retraite rouverte, autre victime,
réponse UCI bornée, cache, annulation et rapport périmé. Ils ne sont pas un
échantillon indépendant.

Les essais réels 300/900 ms soutiennent Dd2/…f4 et sa transformation noire avec
ShallowRed et Stockfish 16. L'aperçu à budgets 200/600 ms conserve aussi les
abstentions, dont Stockfish sur la transformation noire lors de cette mesure.
Une recherche plus longue peut confirmer un cas sans garantir tous les cas.

Restent : compensations positionnelles/différées, surcharge et défenses
combinées plus longues, plans de finale, pertinence sur de nouvelles parties
et relecture du parcours visuel. La classification du coup n'est jamais déduite
de ce détecteur et aucune qualité générale comparable à Chess.com n'est annoncée.
