"""Conversion à blanc du carnet de bord (HTML) en Markdown — sujet B-0005.

Usage : python3 -I tools/carnet-vers-md.py <carnet.html> <dossier de sortie>

N'écrit que dans le dossier de sortie. Rend :
  journal/AAAA-MM[-n].md  les entrées du journal du carnet, par mois, les
                          plus anciennes d'abord, au format du journal du socle
  rubriques/<id>.md       les autres rubriques, une par fichier, et ce que la
                          page porte hors de ses rubriques : son bandeau, sa
                          navigation, son pied
  rapport.txt             les comptes, et le verdict de fidélité

Fidélité : tout le texte que la page affiche est dans un fichier écrit et un
seul, et les caractères de mot de la source de chaque fichier s'y retrouvent,
tous et dans l'ordre, ce que la conversion ajoute mis à part. Sinon le code
de sortie est 1.
"""
import collections
import pathlib
import re
import sys
from html.parser import HTMLParser

VIDES = {"br", "meta", "link", "img", "hr", "input"}
# Ce que la page n'affiche pas : hors de la conversion comme de son contrôle.
IGNORES = {"head", "title", "style", "script"}
TITRES = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
BLOCS_IMBRIQUES = ("ul", "ol", "dl", "table", "div", "pre", "h3", "h4")
HORS_RUBRIQUES = {"header": "bandeau", "nav": "navigation", "footer": "pied"}
BUDGET_JOURNAL = 80000
EN_TETE_JOURNAL = "<!-- socle: couche=journal zone=publique -->\n"
# Ce que la conversion ajoute de son chef et qui porte des caractères de mot
# (la cible d'un lien, le numéro d'un item, `<s>`) s'écrit entre ces deux
# marques : le contrôle de fidélité le retire, l'écriture retire les marques.
AJOUT, FIN = "\x02", "\x03"


class Noeud:
    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.parent, self.enfants = tag, dict(attrs or {}), parent, []

    @property
    def classes(self):
        return (self.attrs.get("class") or "").split()

    def trouve(self, pred):
        for e in self.enfants:
            if isinstance(e, Noeud):
                if pred(e):
                    yield e
                yield from e.trouve(pred)


class Noeud_tmp(Noeud):
    def __init__(self, enfants):
        super().__init__("tmp")
        self.enfants = list(enfants)


class Arbre(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.racine = self.ici = Noeud("racine")

    def handle_starttag(self, tag, attrs):
        n = Noeud(tag, attrs, self.ici)
        self.ici.enfants.append(n)
        if tag not in VIDES:
            self.ici = n

    def handle_endtag(self, tag):
        n = self.ici
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.ici = n.parent

    def handle_data(self, data):
        self.ici.enfants.append(data)


def ajout(texte):
    return AJOUT + texte + FIN


def propre(texte):
    return texte.replace(AJOUT, "").replace(FIN, "")


def lettres(texte):
    """Les caractères de mot d'un texte, à la suite, les ajouts de la
    conversion retirés : ce que le contrôle de fidélité compare."""
    return re.sub(r"\W+", "", re.sub(AJOUT + "[^" + FIN + "]*" + FIN, "", texte))


def source(n):
    """Le texte qu'un nœud affiche, dans l'ordre du document."""
    return "".join(e if isinstance(e, str) else source(e) for e in n.enfants
                   if isinstance(e, str) or e.tag not in IGNORES)


def places(n, sauf=()):
    """Les places des enfants d'un nœud, sans ceux qu'on écarte. Un fichier
    se déclare par ses places : le texte que le contrôle compare et celui
    qu'il tient pour converti en sortent tous deux, et ne peuvent pas
    diverger."""
    return [(n, k) for k, e in enumerate(n.enfants) if not any(e is x for x in sauf)]


def texte(des_places):
    """Le texte affiché à ces places, dans leur ordre."""
    out = []
    for n, k in des_places:
        e = n.enfants[k]
        if isinstance(e, str):
            out.append(e)
        elif e.tag not in IGNORES:
            out.append(source(e))
    return "".join(out)


def feuilles(des_places):
    """Les textes affichés à ces places et sous elles qui portent un
    caractère de mot, chacun par sa place dans l'arbre."""
    out = {}
    for n, k in des_places:
        e = n.enfants[k]
        if isinstance(e, str):
            if re.search(r"\w", e):
                out[(id(n), k)] = e
        elif e.tag not in IGNORES:
            out.update(feuilles(places(e)))
    return out


def code(texte):
    texte = re.sub(r"\s+", " ", texte).strip()
    if not texte:
        return ""
    if "`" in texte:
        return "`` " + texte + " ``"
    return "`" + texte + "`"


def brut(n):
    return "".join(e if isinstance(e, str) else brut(e) for e in n.enfants)


def protege(texte):
    """Aucune ligne du corps ne commence comme un titre ou une ligne de
    métadonnées : elle créerait une entrée que rien ne définit."""
    return "\n".join(("\\" + l) if re.match(r"\s*(#|>)", l) else l for l in texte.split("\n"))


def ligne(n, proteger=False, tete=""):
    """Le contenu en ligne d'un nœud, en Markdown (les `<br>` rendent un saut
    de ligne). Un bloc imbriqué — liste, tableau, encadré — sort à part, entre
    deux lignes vides, et un `<p>` ouvre un paragraphe. `proteger` échappe les
    lignes de texte qui commenceraient comme un titre ou une citation, jamais
    celles qu'un bloc imbriqué a rendues ; `tete` s'écrit devant le premier
    texte."""
    segs, cur = [], [tete]

    def clos():
        s = re.sub(r"[ \t]+", " ", "".join(cur))
        s = re.sub(r" ?\n ?", "\n", s).strip()
        cur.clear()
        if s:
            segs.append(protege(s) if proteger else s)

    for e in n.enfants:
        if isinstance(e, str):
            cur.append(re.sub(r"\s+", " ", e))
            continue
        t = e.tag
        if t in IGNORES:
            continue
        if t == "br":
            cur.append("\n")
        elif t in ("strong", "b"):
            x = ligne(e).strip()
            cur.append(f"**{x}**" if x else "")
        elif t in ("em", "i"):
            x = ligne(e).strip()
            cur.append(f"*{x}*" if x else "")
        elif t == "code":
            cur.append(code(brut(e)))
        elif t in ("s", "del"):
            x = ligne(e).strip()
            cur.append(ajout("<s>") + x + ajout("</s>") if x else "")
        elif t == "a":
            x, h = ligne(e).strip(), e.attrs.get("href", "")
            cur.append(f"[{x}]({ajout(h)})" if h and not h.startswith("#") else x)
        elif t == "span" and ("tag" in e.classes or "st" in e.classes):
            cur.append(f"**[{brut(e).strip()}]**")
        elif t == "span" and {"num", "idx", "ref"} & set(e.classes):
            cur.append(brut(e).strip() + " — ")
        elif t == "sup":
            cur.append("^" + brut(e).strip())
        elif t == "p":
            # Un paragraphe qui ouvre le nœud reste sur la ligne de `tete`.
            debut = "".join(cur)
            if debut.strip() == tete.strip():
                cur.clear()
            else:
                clos()
                debut = ""
            x = ligne(e, proteger, debut)
            if x:
                segs.append(x)
        elif t in BLOCS_IMBRIQUES:
            clos()
            x = blocs(Noeud_tmp([e]), 0).strip()
            if x:
                segs.append(x)
        else:
            cur.append(ligne(e))
    clos()
    return "\n\n".join(segs)


def sur_une_ligne(texte):
    return re.sub(r"\s*\n\s*", " ", texte)


def indente(texte):
    """La suite d'un item de liste, en retrait sous sa puce."""
    lignes = texte.split("\n")
    return "\n".join(lignes[:1] + [("  " + l) if l else "" for l in lignes[1:]])


def rangs(n):
    """Les rangs d'un tableau, sans ceux d'un tableau imbriqué dans une case."""
    for e in n.enfants:
        if isinstance(e, Noeud):
            if e.tag == "tr":
                yield e
            elif e.tag in ("thead", "tbody", "tfoot"):
                yield from rangs(e)


def tableau(n):
    lignes = []
    for tr in rangs(n):
        cellules = [sur_une_ligne(ligne(c)).replace("|", "\\|") or " " for c in tr.enfants
                    if isinstance(c, Noeud) and c.tag in ("td", "th")]
        if cellules:
            lignes.append(cellules)
    if not lignes:
        return ""
    larg = max(len(r) for r in lignes)
    lignes = [r + [" "] * (larg - len(r)) for r in lignes]
    out = ["| " + " | ".join(lignes[0]) + " |", "|" + " --- |" * larg]
    out += ["| " + " | ".join(r) + " |" for r in lignes[1:]]
    return "\n".join(out)


def definitions(n):
    """Les termes d'une liste de définitions, chacun avec les définitions qui
    le suivent jusqu'au terme d'après, à travers les `div` qui les habillent."""
    groupes = []

    def marche(m):
        for e in m.enfants:
            if not isinstance(e, Noeud):
                continue
            if e.tag == "dt":
                groupes.append((e, []))
            elif e.tag == "dd":
                if not groupes:
                    groupes.append((None, []))
                groupes[-1][1].append(e)
            elif e.tag != "dl":
                marche(e)

    marche(n)
    return groupes


def fil(n):
    """Le bandeau d'état de la page : un paragraphe par ligne du bandeau et,
    dans son fil daté, un par point d'état — chacun commence à son étiquette
    en `<b>`. Le « · » qui les séparait s'en va."""
    out = []

    def rend(morceaux):
        x = re.sub(r"\s*·$", "", ligne(Noeud_tmp(morceaux), True))
        if x:
            out.append(x)

    for sp in n.enfants:
        if isinstance(sp, str) or sp.tag != "span":
            rend([sp])
            continue
        cur = []
        for c in sp.enfants:
            entame = any(isinstance(x, Noeud) or x.strip() for x in cur)
            if isinstance(c, Noeud) and c.tag == "b" and entame:
                rend(cur)
                cur = []
            cur.append(c)
        rend(cur)
    return "\n\n".join(out)


def blocs(n, niveau):
    """Le contenu en blocs d'un nœud, en Markdown."""
    out, courant = [], []

    def vide():
        if courant:
            x = ligne(Noeud_tmp(courant), True)
            if x:
                out.append(x)
            courant.clear()

    for e in n.enfants:
        if isinstance(e, str):
            courant.append(e)
            continue
        t = e.tag
        if t in IGNORES:
            continue
        if t == "p":
            vide()
            x = ligne(e, True)
            if x:
                out.append(x)
        elif t in TITRES:
            vide()
            x = sur_une_ligne(ligne(e))
            if x:
                out.append("#" * min(6, TITRES[t] + niveau) + " " + x)
        elif t in ("ul", "ol"):
            vide()
            items = []
            for k, li in enumerate(c for c in e.enfants if isinstance(c, Noeud) and c.tag == "li"):
                x = indente(ligne(li))
                puce = ajout(f"{k + 1}.") if t == "ol" else "-"
                if x:
                    items.append(f"{puce} {x}")
            if items:
                out.append("\n".join(items))
        elif t == "dl":
            vide()
            for dt, dds in definitions(e):
                tete = f"**{ligne(dt)}.** " if dt is not None else ""
                if not dds and tete:
                    out.append(tete.strip())
                for k, dd in enumerate(dds):
                    x = ligne(dd, True, tete if k == 0 else "")
                    if x:
                        out.append(x)
        elif t == "table":
            vide()
            x = tableau(e)
            if x:
                out.append(x)
        elif t == "pre":
            vide()
            out.append("```" + ajout("text") + "\n" + brut(e).strip("\n") + "\n```")
        elif t in ("div", "section", "header", "main", "footer", "nav", "article"):
            vide()
            x = fil(e) if "vitals" in e.classes else blocs(e, niveau)
            if x.strip():
                if "box" in e.classes or "dead" in e.classes:
                    x = "\n".join("> " + l if l else ">" for l in x.strip().split("\n"))
                out.append(x.strip())
        else:
            courant.append(e)
    vide()
    return "\n\n".join(out)


def entree(n):
    """Une entrée du journal du carnet : son identifiant (ou None), le nœud
    et le texte de son horodatage, son titre, son corps. Un identifiant ne
    vaut que si l'horodatage est exactement « sa date · lui »."""
    quand = next(n.trouve(lambda e: e.tag == "span" and "when" in e.classes))
    quand_txt = brut(quand).strip()
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2}) · (J-\1-[A-Z]+)", quand_txt)
    titre_n = next(n.trouve(lambda e: e.tag == "h3"), None)
    titre = sur_une_ligne(ligne(titre_n)) if titre_n is not None else ajout("(sans titre)")
    reste = Noeud_tmp([e for e in n.enfants if e is not quand and e is not titre_n])
    return (m.group(2) if m else None), quand, quand_txt, titre, blocs(reste, 1).strip()


def main():
    origine, sortie = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    html = origine.read_text(encoding="utf-8")
    a = Arbre()
    a.feed(html)
    rapport = [f"source : {origine.stat().st_size} octets"]
    fautes = [f"la page porte la marque {m!r}, que la conversion se réserve"
              for m in (AJOUT, FIN) if m in html]
    couverts, ecrits, compte = set(), set(), collections.Counter()
    (sortie / "journal").mkdir(parents=True, exist_ok=True)
    (sortie / "rubriques").mkdir(parents=True, exist_ok=True)

    def ecrit(dossier, nom, libelle, markdown, des_places, admises=()):
        """Confronte un fichier, tel qu'il va s'écrire, au texte de ses
        places, puis l'écrit, marques retirées. Les places `admises`
        comptent comme converties sans passer par la comparaison :
        l'appelant les a vérifiées autrement."""
        s, m = lettres(texte(des_places)), lettres(markdown)
        siennes = set(feuilles(list(des_places) + list(admises)))
        compte["fichiers"] += 1
        compte["lettres"] += len(s)
        if s != m:
            k = next((i for i, (x, y) in enumerate(zip(s, m)) if x != y), min(len(s), len(m)))
            fautes.append(f"{dossier}/{nom} : la source et son Markdown divergent au caractère de mot {k} — "
                          f"source « …{s[max(0, k - 40):k + 40]}… », Markdown « …{m[max(0, k - 40):k + 40]}… »")
        if couverts & siennes:
            fautes.append(f"{dossier}/{nom} : du texte déjà converti ailleurs")
        couverts.update(siennes)
        if (dossier, nom) in ecrits:
            fautes.append(f"{dossier}/{nom} : écrit deux fois")
        ecrits.add((dossier, nom))
        contenu = propre(markdown)
        (sortie / dossier / nom).write_text(contenu, encoding="utf-8")
        rapport.append(f"{libelle} : {len(contenu.encode()):>7} octets")

    par_mois, vus = collections.defaultdict(list), set()
    sans_id, hors = ([], []), collections.defaultdict(lambda: ([], []))

    def section(s):
        ident = s.attrs.get("id") or "sans-identifiant"
        if ident != "journal":
            ecrit("rubriques", f"{ident}.md", f"rubrique {ident:<11}", blocs(s, 0).strip() + "\n", places(s))
            return
        entrees = [e for e in s.enfants
                   if isinstance(e, Noeud) and e.tag == "div" and "entry" in e.classes]
        for e in entrees:
            j, quand, quand_txt, titre, corps = entree(e)
            if j is None:
                sans_id[0].append(f"### {quand_txt} — {titre}\n\n{corps}")
                sans_id[1].extend(places(e))
                continue
            if j in vus:
                fautes.append(f"{j} : un identifiant pour deux entrées")
            vus.add(j)
            par_mois[j[2:9]].append((j, titre, corps, e, quand))
        # Le titre et le chapeau de la rubrique, que ses entrées ne portent pas.
        reste = Noeud_tmp([c for c in s.enfants if not any(c is e for e in entrees)])
        ecrit("rubriques", "journal.md", "rubrique journal    ", blocs(reste, 0).strip() + "\n",
              places(s, sauf=entrees))

    def marche(n):
        for k, e in enumerate(n.enfants):
            if isinstance(e, str) or e.tag in IGNORES:
                continue
            if e.tag == "section":
                section(e)
            elif next(e.trouve(lambda x: x.tag == "section"), None) is not None:
                marche(e)
            else:
                md = blocs(Noeud_tmp([e]), 0).strip()
                if not md and not feuilles([(n, k)]):
                    continue
                nom = HORS_RUBRIQUES.get(e.tag, "hors-rubriques")
                hors[nom][0].append(md)
                hors[nom][1].append((n, k))

    marche(a.racine)
    for nom, (textes, des_places) in hors.items():
        ecrit("rubriques", f"{nom}.md", f"hors rubriques, {nom:<10}",
              "\n\n".join(x for x in textes if x) + "\n", des_places)

    total, n_entrees = 0, 0
    for mois in sorted(par_mois):
        # Par jour, puis par lettre : A à Z avant AA.
        entrees = sorted(par_mois[mois], key=lambda x: (x[0][:12], len(x[0]), x[0]))
        fichier, des_places, admises = 1, [], []
        courant = ajout(EN_TETE_JOURNAL.strip()) + "\n# " + ajout(f"Journal — {mois}") + "\n"

        def nom(fichier):
            return f"{mois}.md" if fichier == 1 else f"{mois}-{fichier}.md"

        for j, titre, corps, e, quand in entrees:
            # L'identifiant et la date sont des ajouts : l'horodatage de la
            # source, dont la forme est vérifiée, ne se compare pas.
            bloc = (f"\n## {ajout(j)} — {titre}\n\n> " + ajout(f"type : carnet · date : {j[2:12]}")
                    + f"\n\n{corps}\n")
            if len(propre(courant + bloc).encode()) > BUDGET_JOURNAL and courant.count("\n## ") > 0:
                ecrit("journal", nom(fichier), f"journal {nom(fichier):<13}", courant, des_places, admises)
                fichier, des_places, admises = fichier + 1, [], []
                courant = (ajout(EN_TETE_JOURNAL.strip()) + "\n# "
                           + ajout(f"Journal — {mois}, suite {fichier}") + "\n")
            courant += bloc
            des_places += places(e, sauf=[quand])
            admises += [x for x in places(e) if e.enfants[x[1]] is quand]
            total += len(propre(bloc).encode())
            n_entrees += 1
        ecrit("journal", nom(fichier), f"journal {nom(fichier):<13}", courant, des_places, admises)
    if sans_id[0]:
        ecrit("rubriques", "journal-sans-identifiant.md", "journal, sans identifiant",
              "\n\n".join(sans_id[0]) + "\n", sans_id[1])
    rapport.append(f"journal : {n_entrees} entrées à identifiant, {total} octets ; "
                   f"{len(sans_id[0])} sans identifiant")
    gros = sorted(((len(propre(x[2]).encode()), x[0]) for m in par_mois.values() for x in m), reverse=True)[:5]
    rapport.append("plus grosses entrées : " + ", ".join(f"{j} {o} o" for o, j in gros))

    oublies = [x for place, x in feuilles(places(a.racine)).items() if place not in couverts]
    if oublies:
        fautes.append(f"{len(oublies)} texte(s) de la page hors de tout fichier écrit, "
                      f"dont « {oublies[0].strip()[:80]} »")
    mots = len(re.findall(r"\w+", source(a.racine)))
    rapport.append(f"fidélité : {compte['fichiers']} fichiers, {mots} mots affichés dans la page, "
                   f"{compte['lettres']} caractères de mot confrontés ; non affichés, donc ignorés : "
                   + ", ".join(sorted(IGNORES)))
    if fautes:
        rapport.append(f"INFIDÈLE — {len(fautes)} faute(s) :")
        rapport.extend("  " + f for f in fautes)
    else:
        rapport.append("FIDÈLE — tout le texte affiché est dans un fichier écrit, sans perte et dans l'ordre")
    (sortie / "rapport.txt").write_text("\n".join(rapport) + "\n", encoding="utf-8")
    print("\n".join(rapport))
    sys.exit(1 if fautes else 0)


if __name__ == "__main__":
    main()
