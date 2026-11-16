<!-- socle: couche=demandes zone=publique -->
# D-0015 — Valider le changement des deux tests du journal que D-0014 impose

> date : 2026-11-16 · sujet : engine/tests/bench_reference.rs

## Décision demandée

Autoriser le changement de deux tests de `engine/tests/bench_reference.rs`,
`le_parcours_ecarte_le_journal_de_la_memoire_et_rien_d_autre` et
`une_ligne_illisible_n_est_refusee_que_hors_du_journal`, que rend
nécessaire ta décision de ce soir d'écarter aussi les demandes et les
décisions du test des chiffres du banc.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, qui parle le
protocole UCI (le protocole standard entre un moteur et une interface),
avec une interface en TypeScript. Tu le développes pour en faire le
moteur le plus fort possible, et des agents y travaillent sous les règles
du socle, l'outillage de mémoire et de contrôles installé le 11 nov. 2026.

**Le chantier.** L'adoption du socle, que tu as voulue finie avant tout
travail sur le moteur (12 nov.), touche à sa fin. Il reste à déplacer le
carnet de bord, la page où les sessions consignaient leur travail depuis
septembre, dans la mémoire du socle : le dossier `memory/`, dont les
couches sont des sous-dossiers. Son journal y est converti depuis ce
soir, et le test des chiffres du banc est alors tombé. Tu as choisi ce
soir, le 16 nov., d'en écarter le journal, puis d'en écarter aussi les
demandes et les décisions : « oui, écarte aussi les demandes et
décisions ».

**La question.** La règle du socle (politique d'autonomie, point 2) veut
qu'un test existant ne change ni ne disparaisse sans une validation
humaine qui le nomme. Ta réponse de ce soir valide l'extension, mais ne
nomme pas les deux tests écrits pour le journal, qui doivent changer avec
elle. Le contrôle du socle qui garde les valeurs attendues des tests
refuse donc le push. Il faut ton accord sur ces deux tests, par leur nom.

**Le test des chiffres du banc.** Le banc est la mesure déterministe du
moteur : le nombre de nœuds (de positions) qu'il explore sur six
positions fixes. Ce test parcourt tous les fichiers Markdown du dépôt, et
exige que chaque ligne qui annonce ce nombre, reconnue à une expression
fixe qui sert de marqueur, porte le chiffre actuel. Une ligne qui
porte le marqueur sans chiffre lisible, dite illisible, le fait échouer :
c'est ainsi qu'une entrée du carnet, qui racontait la conception du test
en citant la forme de cette ligne, l'a fait tomber. Trois couches de la
mémoire sont gelées, et ne peuvent donc pas être tenues à jour : le
journal (`memory/journal`, en ajout seul), les demandes de décision comme
celle-ci (`memory/requests`, figées par leur réponse ; leurs identifiants
commencent par D) et les décisions d'architecture (`memory/decisions`,
encore vide). C'est pourquoi tu les as écartées.

**Pourquoi des tests d'aujourd'hui comptent comme existants.** Ils sont
sur la pull request ouverte, déjà poussée ; le contrôle juge ce qui
change par rapport à elle. Ta décision sur le journal ne pouvait pas les
nommer : ils sont nés de son exécution.

**Les deux tests**, et ce qui change :

1. `le_parcours_ecarte_le_journal_de_la_memoire_et_rien_d_autre` vérifie,
   sur le dépôt, qu'aucun fichier du journal n'est parcouru et que **tout
   autre** fichier Markdown de la mémoire l'est. Avec l'extension, cette
   seconde assertion devient fausse, puisque les demandes ne sont plus
   parcourues. Il devient `le_parcours_ecarte_les_couches_gelees_et_rien_d_autre` ;
   le cœur du changement :

   ```rust
   // avant : tout fichier de la mémoire hors du journal est attendu
   let attendus: Vec<&String> = memoire
       .iter()
       .filter(|n| !n.starts_with("memory/journal/"))
       .collect();
   // après : tout fichier hors des trois couches gelées
   let gelee = |n: &str| {
       ["memory/journal/", "memory/requests/", "memory/decisions/"]
           .iter()
           .any(|g| n.starts_with(g))
   };
   let attendus: Vec<&String> = memoire.iter().filter(|n| !gelee(n)).collect();
   ```

2. `une_ligne_illisible_n_est_refusee_que_hors_du_journal` crée un dépôt
   factice dans un dossier temporaire, y pose une même ligne illisible
   dans un fichier ordinaire, dans un autre dossier nommé « journal » et
   dans le journal, et vérifie que seules les deux premières sont lues, et
   refusées. Il reste vrai, mais ne prouve rien des demandes ni des
   décisions. Il devient `une_ligne_illisible_n_est_refusee_que_hors_des_couches_gelees` :
   la ligne est aussi posée dans les demandes et les décisions, où elle
   n'est jamais lue, et dans des dossiers « requests » et « decisions »
   hors de la mémoire, où elle est lue et refusée. Les fichiers lus
   attendus passent de deux à quatre.

Le contrôle tient un test renommé pour un test supprimé : c'est pourquoi
la demande nomme les deux noms d'aujourd'hui.

**L'urgence est faible, vérifié** : aucune demande actuelle ne porte le
marqueur, et les rubriques du carnet encore à poser non plus ; seul son
journal le porte, et il est déjà écarté.

## Éléments cités

- D-0014@3a7be903 — ta décision de ce soir, une demande consignée en séance : écarter aussi les demandes et les décisions du test des chiffres du banc.
- D-0013@87f802b7 — ta décision de ce soir, juste avant : écarter le journal de la mémoire de ce test.
- B-0037@54a27c02 — le sujet du backlog (la liste des sujets à faire, dans `memory/backlog`) qui porte l'extension ; il reste ouvert jusqu'à ta réponse.
- pull request 295 — la pull request ouverte qui pose le journal du carnet ; les deux tests y sont depuis ce soir.

Le suffixe après « @ » est l'empreinte de la version lue de chaque entrée.

## Où regarder

- Le premier test, tel qu'il est sur la pull request :
  [bench_reference.rs, ligne 389](https://github.com/theodubus/chess/blob/89bd7ff5a31fd56bd6dc94a98da2564308a45488/engine/tests/bench_reference.rs#L389)
  — y vérifier la boucle finale, qui exige tout fichier de la mémoire hors
  du journal : c'est elle que l'extension rend fausse.
- Le second, au même endroit :
  [bench_reference.rs, ligne 448](https://github.com/theodubus/chess/blob/89bd7ff5a31fd56bd6dc94a98da2564308a45488/engine/tests/bench_reference.rs#L448).
- La pull request : https://github.com/theodubus/chess/pull/295.
- La version changée n'est pas poussée, puisque le push est refusé sans
  ton accord : son cœur est cité plus haut.

## Options

- **Valider.** Les deux tests changent comme décrit. Effort : nul de ton
  côté, le changement est écrit et éprouvé. Risque : faible, voir la
  recommandation. Réversible : un commit.
- **Refuser.** Les deux tests restent tels quels. Le premier interdit
  alors l'extension : ta décision de ce soir sur les demandes et les
  décisions reste écrite, mais ne s'exécute pas, et le test continue
  d'exiger un chiffre à jour dans ces deux couches. Effort : nul. Risque :
  celui que tu as écarté ce soir, un test qui tombe un jour sur une
  citation gelée qu'on ne peut plus corriger ; il ne se présente pas
  aujourd'hui. Réversible.

Écartée : garder le second test tel quel et en ajouter un troisième pour
les demandes et les décisions. Le premier demanderait ta validation quand
même, et le dépôt garderait deux tests qui se recouvrent, dont l'un
porterait un nom plus étroit que ce qu'il prouve.

## Conséquences

- **Si tu valides** : je commite le changement, le pousse sur la pull
  request 295, la fusionne à CI verte, et clos B-0037.
- **Si tu refuses** : le changement est jeté, B-0037 est abandonné sur ta
  réponse, ta décision de ce soir est consignée comme non exécutée, et la
  pull request 295 se fusionne telle qu'elle est.
- **Sans réponse** : le changement attend, non commité dans le dépôt. La
  pull request 295 se fusionne sans lui, et le lot suivant avance (poser
  les autres rubriques du carnet, dont ses dix-huit arbitrages, les
  décisions que tu y as prises, en décisions de la mémoire), puisqu'il ne
  porte pas le marqueur.

## Recommandation

Valider : c'est la suite mécanique de ta décision de ce soir.

Vérifié : avec le changement, les treize fonctions de test du fichier
passent. Sept versions délibérément fausses de l'exclusion font chacune
tomber au moins un cas : le journal, les demandes ou les décisions
retirés de l'exclusion ; le backlog ajouté ; un dossier écarté par son
seul nom (« journal », « requests » ou « decisions ») où qu'il soit, au
lieu de son chemin dans la mémoire. Rejoué sur les commits à pousser, le
contrôle du socle ne refuse que ces deux tests, et rien d'autre.

Supposé : qu'une fois ces deux noms validés, ce contrôle les accepte ; il
lit les noms dans le texte d'une demande validée, et je ne peux pas
l'éprouver sans ta réponse.

## Réponses possibles

- `valider` — les deux tests changent comme décrit, et l'extension part sur la pull request 295.
- `refuser` — les deux tests restent tels quels, l'extension ne part pas, et B-0037 est abandonné.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
