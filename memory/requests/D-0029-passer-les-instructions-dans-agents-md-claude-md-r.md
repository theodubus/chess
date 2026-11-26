<!-- socle: couche=demandes zone=publique -->
# D-0029 — Passer les instructions dans AGENTS.md, CLAUDE.md réduit à son import, budgets."AGENTS.md".max_bytes porté de 16000 à 65000, et les trois tests qui lisent CLAUDE.md (engine/tests/bench_reference.rs, engine/tests/pieges_fermes.rs, engine/tests/outillage_documente.rs) adaptés ?

> date : 2026-11-26 · forme : séance

## Question posée

AGENTS.md : confirmer en une phrase, par exemple « AGENTS.md, budget 65 000, les trois tests compris ». Elle couvre deux choses : le budget d'AGENTS.md porté de 16 000 à 65 000 octets, ce qui assouplit un garde-fou ; l'adaptation des trois tests qui lisent CLAUDE.md par son nom : engine/tests/bench_reference.rs, engine/tests/pieges_fermes.rs, engine/tests/outillage_documente.rs.
