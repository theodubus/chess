# Brouillons à relire — 3 octobre 2026

Ces deux exemples sont **construits**, pas extraits d'une partie utilisateur.
Les positions et captures ont été exécutées avec chess.js. Le contrôle UCI ciblé
avec ShallowRed et Stockfish (200 puis 600 ms) soutient les deux contributions
conditionnelles. Cela valide ces témoins, **pas** la pertinence générale des
explications. Les résultats peuvent changer avec les recherches.

Les brouillons restent hors de l'interface active. `relationDraft` les produit
seulement si la perte et le contraste sont soutenus aux deux budgets ; aucune
phrase n'est publiée si la confirmation manque. Les scores des fixtures unitaires
sont simulés et ne servent pas de preuve échiquéenne pour cette page.

## Défenseur déplacé : Cb4

Position avant le coup, Noirs au trait :

```text
rnb2bk1/ppq2p1p/2pp1rp1/3n4/8/2BPPN2/PPP1BPPP/RN1Q1RK1 b - - 0 1
```

Le cavalier d5 protège la tour f6 par une reprise légale après Fxf6. Cb4 retire
cette possibilité. L'alternative a6 conserve le cavalier ; ce n'est pas une
affirmation que a6 est le meilleur coup.

**Une défense abandonnée**

> Le cavalier noir en d5 a quitté cette case pour b4. Après Fxf6, la reprise par
> ce défenseur n'est plus disponible et la perte matérielle des Noirs augmente
> dans la variante vérifiée.

> Avec a6, la reprise Cxf6 restait possible : le moteur l'utilise et le bilan
> matériel est moins défavorable.

Illustration :

- Départ **après Cb4**, ligne c3–f6 et case du défenseur identifiées.
- Fxf6 : la tour est prise, sans rejouer Cb4 ni poursuivre le développement.
- Comparaison : départ après a6, Fxf6 puis Cxf6.

Le bilan conditionnel est −5 points pour les Noirs dans la branche jouée, −2
avec la reprise. La tour est perdue dans les deux cas : parler de « pièce sauvée »
serait faux. Le score comparatif et la reprise effective, pas la seule présence
du cavalier, sont nécessaires à l'attribution.

## Ligne ouverte : dxe4

Position avant le coup, Blancs au trait :

```text
rnbr1b1k/ppp1qppp/4pn2/8/4p3/3P3N/PPP1BPPP/RNBQ1RK1 w - - 0 1
```

Le pion d3 ferme la colonne entre la tour noire d8 et la dame blanche d1.
Prendre e4 le retire du trajet. L'alternative d4 garde un obstacle sur cette
colonne ; elle n'est pas présentée comme le meilleur coup.

**Une ligne laissée ouverte**

> Ce coup dégage la ligne d8–d1 pour l'adversaire. Le moteur l'exploite par Txd1,
> qui prend la dame blanche en d1.

> Avec d4, un obstacle restait sur cette ligne et la capture directe n'était pas
> disponible. La variante calculée conserve la pièce.

Illustration :

- Départ **après dxe4**, trajet d8–d1 dégagé.
- …Txd1 puis Txd1 : montrer la capture et la reprise, plutôt que la seule perte
  de dame. Le bilan inclut le pion pris par dxe4.
- Comparaison : **une seule position après d4**, pion d4 repéré et ligne arrêtée
  sur cet obstacle. Les coups ultérieurs de la PV ne sont pas illustrés.

Le témoin Stockfish du contrôle ciblé ferme ce bilan à −3 points pour les Blancs.
Le témoin ShallowRed gardait aussi …Cxe4, une autre capture immédiate, et atteignait
−4. Cette différence reste dans les preuves. La séparation entre preuve de
compensation et illustration strictement nécessaire reste à améliorer : le texte
ne prétend pas que …Cxe4 constitue l'explication de l'ouverture de la colonne.

## Limites à vérifier avant activation

- Ne pas confondre contribution conditionnelle et cause unique du verdict.
- Une capture ou un score amélioré seul ne suffit pas ; les autres défenseurs,
  menaces, compensations et variantes instables peuvent empêcher l'attribution.
- Les positions dépouillées des fixtures sont aussi testées : plusieurs restent
  sans brouillon réel, notamment quand le roi remplace une défense ou qu'un mat
  sort du contrat matériel actuel.
- Ces exemples demandent une relecture pédagogique, un corpus issu de nouvelles
  parties et une réduction du coût avant de remplacer l'ancien explicateur.

Reproduire depuis `ui/` :

```bash
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/usr/games/stockfish npm exec -- vitest run dev/understanding.test.mjs -t 'relations causales' --reporter=verbose --silent=false --disableConsoleIntercept
```

Chaque rapport imprime les deux passes, les commandes conditionnelles, les
témoins, les refus, les coûts et les étapes du brouillon. Pour les seuls contrats
logiciels : `npm run test:understanding`.
