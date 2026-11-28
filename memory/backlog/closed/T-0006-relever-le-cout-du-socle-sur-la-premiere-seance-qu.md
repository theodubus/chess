<!-- socle: couche=backlog zone=publique -->
# T-0006 — Relever le coût du socle sur la première séance qui mène un lot ordinaire, avant sa passation

> statut : fait · origine : J-2026-11-28-A · besoin : B-0085 · lu : backlog@a029f8a7 · ref : J-2026-11-28-I

**Elle accompagne un lot ordinaire, elle n'en est pas un** : la séance qui
la prend mène d'abord son lot, puis, avant sa passation, fait le relevé
sur sa propre transcription et sur `.git/socle/hooks.log`, que le
conteneur emporte avec lui. Le livrable : le relevé dans le récap de la
séance et une entrée de journal qui le garde, puis la tâche et B-0085
clos avec la passation. Le texte de Théo, recopié mot pour mot de son
prompt de mise à jour du 28 nov. 2026 :

> **Le relevé d'après, sur ta première séance de travail ordinaire**
>
> Ton retour du 26 novembre sur le coût du socle a compté tes appels d'outil par nature, du compactage à la passation d'une séance qui menait un lot ordinaire de deux tâches (son §1 : 118 appels, dont 36 qui lancent une commande du socle et 12 pour les réveils et les tâches programmées), et il a classé par contrôle tes 56 refus du 12 au 26 novembre, sur 4 905 déclenchements des hooks (son §3). C'est la mesure d'avant des corrections qu'il a demandées, que la nouvelle version porte presque toutes. Je veux la mesure d'après, par la même méthode, sur ta première séance de travail qui mène un lot ordinaire une fois cette mise à jour fusionnée. La transcription de la séance et le journal des hooks se perdent avec son conteneur : le relevé se fait dans la séance même, avant sa passation.
>
> Pour que cette séance le sache, le besoin et la tâche de l'étape 6 recopient cette section jusqu'à sa fin. Le relevé tient en trois parties :
>
> 1. Les appels d'outil par nature, sur la transcription de la séance, de son début ou de son dernier compactage à sa passation : chaque appel classé par le nom de son outil et, pour le shell, selon que sa commande appelle le socle. Les natures : une commande du socle, en séparant les contrôles et le rangement du travail utile qu'elle accompagne (un commit, un push) ; un réveil de reprise ou une tâche programmée ; une correction après un refus ; le reste. Un appel mixte compte entier, comme la première fois. Les gestes uniques de cette mise à jour qui tombent dans la séance se comptent à part, comme une nature à eux : le tri de la réserve (point 18), le rangement de tes consignes (points 15 et 17), les demandes des points 9 et 13. Donne le total, puis le compte et la part de chaque nature, les gestes uniques compris, et ce qu'a fait la séance (ses lots, ses tâches, ses échanges avec moi).
> 2. Les refus par contrôle, dans le journal local des hooks, .git/socle/hooks.log, sur la même période : chaque ligne dont le deuxième champ est Refus, classée par son quatrième champ (l'étage et le contrôle, Stop:liens par exemple), avec la commande ou le message refusé, et dite fondée (une vraie faute, bien attrapée) ou à tort (rien de faux). Donne aussi le nombre de déclenchements de la période (toutes les lignes du journal) et la part des refus. Mets en regard les postes de ton §3 : les liens du dernier message (20), l'écriture supposée d'un fichier protégé (2), les opérations jugées externes (3), l'installeur (3), la remise en état d'un fichier protégé (3), la consigne citée sans empreinte (2). Si le journal manque ou ne couvre pas toute la séance, dis-le.
> 3. L'alerte de retard de l'état (point 19) : si une session de la séance a démarré sur une tête en retard sur sa passation, dis si socle state l'a dit en tête, sa ligne mot pour mot, et ce que tu as fait ensuite ; sinon, dis qu'aucune session n'a démarré en retard.
>
> Rends-moi le relevé dans le récap de cette séance, et clos la tâche et son besoin avec sa passation.

Les points 9, 13, 15, 17, 18 et 19 sont ceux du même prompt : le plafond
des consignes, celui des skills, le rangement des consignes selon leur
nature, la feuille de route en une forme, le tri de la réserve, l'alerte
de retard de l'état (J-2026-11-28-A). La séance de la mise à jour elle-même
n'est pas celle du relevé : elle ne menait aucun lot ordinaire.

## Fait quand

- [x] les appels d'outil de la séance, de son début ou de son dernier compactage à sa passation, sont comptés par nature : le total, le compte et la part de chacune, les gestes uniques de la mise à jour à part, et ce qu'a fait la séance
- [x] les refus de `.git/socle/hooks.log` sur la même période sont classés par contrôle, chacun dit fondé ou à tort, avec le nombre de déclenchements, la part des refus et les postes du §3 en regard, ou la lacune du journal dite
- [x] l'alerte de retard de l'état est relevée : sa ligne mot pour mot et la suite donnée, ou aucune session démarrée en retard
- [x] le relevé est rendu dans le récap de la séance et gardé au journal, et T-0006 et B-0085 sont clos avec la passation
