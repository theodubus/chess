#!/usr/bin/env python3
"""Fait d'un réseau de `reseaux/` le réseau embarqué, pour un candidat.

    python3 tools/candidat-reseau.py <dépôt> <fichier de base> "<doc, une phrase>" [largeur=N] [seaux=10]

Écrit dans la session du 5 nov. 2026 (n° 22), rangé au dépôt le 11 nov. :
il vivait dans le conteneur, qu'un changement de session efface. Ensuite :
`cargo fmt -p shallowred`, les tests `nnue` en release, puis le candidat
commité et révoqué aussitôt (`tools/README.md`, « C3 — N10 et N10r10 :
VERDICT »). `largeur=N` remplace `HIDDEN = 256` ; `seaux=10` passe les
seaux de roi de quatre à dix — les deux lignes que `tools/seance-c3.sh`
change pour bâtir l'entraîneur, et chacune doit changer exactement une
ligne.

`<fichier de base>` : `e5nw50-768x4hm-256-s8-400` — on lit `.bin` et
`.sortie.txt` à côté. Remplace le bloc de doc d'EMBEDDED, son
`include_bytes!`, la référence de la sortie dans le test de confrontation et
la table CONFRONTATION elle-même, recopiée de la section « 3. Le moteur
contre l'entraîneur » de la sortie. Refuse si la sortie n'a pas ses 18
lignes, ou si son critère n'est pas tenu (médian ≤ 15, maximal ≤ 50).
"""
import re
import sys
import textwrap

depot, base, doc = sys.argv[1], sys.argv[2], sys.argv[3]
options = dict(a.split("=", 1) for a in sys.argv[4:])
nnue = f"{depot}/engine/src/nnue.rs"
sortie = open(f"{depot}/reseaux/{base}.sortie.txt", encoding="utf-8").read()

i = sortie.rindex("== 3. Le moteur contre l'entraîneur ==")
lignes = []
critere = None
for ligne in sortie[i:].splitlines()[1:]:
    m = re.match(r"\s*(-?\d+)\s+(-?\d+)\s+écart\s+\d+\s+(.+?)\s*$", ligne)
    if m:
        lignes.append((m.group(3), int(m.group(1)), int(m.group(2))))
        continue
    m = re.match(r"\s*écart médian (\d+) \(admis 15\), maximal (\d+) \(admis 50\)", ligne)
    if m:
        critere = (int(m.group(1)), int(m.group(2)))
        break
assert len(lignes) == 18, f"{len(lignes)} lignes de confrontation"
assert critere and critere[0] <= 15 and critere[1] <= 50, f"critère : {critere}"

s = open(nnue, encoding="utf-8").read()

# Le bloc de doc et l'include.
a = s.index("/// Le réseau que le binaire embarque")
b = s.index("const EMBEDDED: &[u8] = include_bytes!(", a)
c = s.index("\n", b) + 1
corps = "\n".join("/// " + l for l in textwrap.wrap(doc, 74))
s = (
    s[:a]
    + corps
    + "\n"
    + f'const EMBEDDED: &[u8] = include_bytes!("../../reseaux/{base}.bin");\n'
    + s[c:]
)

# La référence de la sortie dans le test.
s, n = re.subn(
    r"relevés dans `reseaux/[^`]+\.sortie\.txt`",
    f"relevés dans `reseaux/{base}.sortie.txt`",
    s,
)
assert n == 1, n

# La table.
a = s.index("        const CONFRONTATION: [(&str, i32, i32); 18] = [\n")
b = s.index("        ];\n", a) + len("        ];\n")
table = "        const CONFRONTATION: [(&str, i32, i32); 18] = [\n"
for fen, moteur, bullet in lignes:
    table += f'            ("{fen}", {moteur}, {bullet}),\n'
table += "        ];\n"
s = s[:a] + table + s[b:]
# L'architecture, si le réseau n'est pas celui de la base.
if "largeur" in options:
    s, n = re.subn(r"(?m)^pub const HIDDEN: usize = 256;$",
                   f"pub const HIDDEN: usize = {int(options['largeur'])};", s)
    assert n == 1, f"HIDDEN : {n} lignes"
if options.get("seaux") == "10":
    s, n = re.subn(r"(?m)^    king_buckets: Some\(KING_BUCKETS_4\),$",
                   "    king_buckets: Some(KING_BUCKETS_10),", s)
    assert n == 1, f"seaux : {n} lignes"
open(nnue, "w", encoding="utf-8").write(s)
print(f"{base} : 18 lignes, médian {critere[0]}, maximal {critere[1]}")
