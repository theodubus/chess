<!-- socle: couche=demandes zone=publique -->
# D-0027 — Relever le plafond de memory/canonical.md à 20 000 octets : budgets."memory/canonical.md".max_bytes

> date : 2026-11-23 · forme : séance · sujet : .socle/guardrails.toml

## Question posée

Posé à Théo dans le texte de la réponse de l'agent, le 23 nov. 2026 au soir : « Le plafond de `memory/canonical.md` : six faits de B-0078 doivent y entrer (~1,8 Ko) et il reste 514 octets sur 16 000. L'inventaire de ce soir a trouvé utiles tous les faits qui y restent : ton critère de D-0023 (« Si oui allonger le seuil ») dit donc de le relever, mais l'étiquette consignée de D-0023 est `refuser`, et relever un garde-fou demande ta validation. Réponds `valider` pour le passer à 20 000 octets, ou `refuser`, et je ferai de la place autrement. »

Note de consigne, ajoutée par l'agent et que Théo n'a pas lue : la ligne des garde-fous que cette réponse autorise à changer est `budgets."memory/canonical.md".max_bytes`, de 16000 à 20000, dans `.socle/guardrails.toml`. Une première consignation de la même réponse, D-0026, ne citait pas cette clé, et le contrôle `cliquet.garde-fous` l'a refusée pour ce changement.
