# Une reprise n'ouvre pas un nouvel échange

`recaptureObservation` décrit les prises successives visibles dans l'historique et
la variante courte. C'est une observation du matériel, distincte du verdict du
classificateur et d'une preuve du meilleur coup. Elle ne lance pas de moteur.

Une capture qui reprend la pièce adverse venant de capturer remonte au début de
ces reprises avec `exchangeContext`. Le bilan depuis le début et celui depuis la
reprise gardent le point de vue du joueur qui vient de décider. Promotions et
prises en passant sont incluses dans les différences de matériel des plateaux.
Les coups intermédiaires et les captures d'autres pièces ne sont pas rattachés
arbitrairement au même échange. La note ne prétend pas évaluer toute la partie.

Quand le début manque dans un historique FEN, aucun total n'est annoncé. Quand
une autre reprise reste légale, le bilan reste ouvert. Une PV incohérente est
ignorée ; elle n'efface pas le fait historique de la reprise. La lecture est
limitée aux huit premiers demi-coups et s'arrête à la première fin de partie.

Dans `explainMove`, une reprise connue ne passe plus par `decisionCause`, dont le
gain local pouvait présenter un échange globalement perdant comme nouvel échange
gagnant. La note reste `context`, sans `concrete`, candidat ni bouton de preuve.
Une reprise qui donne immédiatement mat garde son explication légale. Cette
correction ne retire pas les autres parcours favorables de l'ancien explicateur
et ne démontre pas pourquoi une reprise est le meilleur choix disponible.
