"""Conversion à blanc du carnet de bord (HTML) en Markdown — sujet B-0005.

Usage : python3 -I tools/carnet-vers-md.py <carnet.html> <dossier de sortie>

N'écrit que dans le dossier de sortie. Rend :
  journal/AAAA-MM[-n].md  les entrées du journal du carnet, par mois, les
                          plus anciennes d'abord, au format du journal du socle
  rubriques/<id>.md       les autres rubriques, une par fichier
  rapport.txt             les comptes
"""
import collections
import pathlib
import re
import sys
from html.parser import HTMLParser

VIDES = {"br", "meta", "link", "img", "hr", "input"}
BUDGET_JOURNAL = 80000
EN_TETE_JOURNAL = "<!-- socle: couche=journal zone=publique -->\n"


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


def code(texte):
    texte = re.sub(r"\s+", " ", texte).strip()
    if not texte:
        return ""
    if "`" in texte:
        return "`` " + texte + " ``"
    return "`" + texte + "`"


def brut(n):
    return "".join(e if isinstance(e, str) else brut(e) for e in n.enfants)


def ligne(n):
    """Le contenu en ligne d'un nœud, en Markdown, sur une ligne logique
    (les `<br>` rendent un saut de ligne)."""
    out = []
    for e in n.enfants:
        if isinstance(e, str):
            out.append(re.sub(r"\s+", " ", e))
            continue
        t = e.tag
        if t == "br":
            out.append("\n")
        elif t in ("strong", "b"):
            x = ligne(e).strip()
            out.append(f"**{x}**" if x else "")
        elif t in ("em", "i"):
            x = ligne(e).strip()
            out.append(f"*{x}*" if x else "")
        elif t == "code":
            out.append(code(brut(e)))
        elif t in ("s", "del"):
            x = ligne(e).strip()
            out.append(f"<s>{x}</s>" if x else "")
        elif t == "a":
            x, h = ligne(e).strip(), e.attrs.get("href", "")
            out.append(f"[{x}]({h})" if h and not h.startswith("#") else x)
        elif t == "span" and ("tag" in e.classes or "st" in e.classes):
            out.append(f"**[{brut(e).strip()}]**")
        elif t == "span" and {"num", "idx", "ref"} & set(e.classes):
            out.append(brut(e).strip() + " — ")
        elif t == "sup":
            out.append("^" + brut(e).strip())
        elif t in ("ul", "ol", "dl", "table", "p", "div", "pre", "h3", "h4"):
            out.append("\n" + blocs(Noeud_tmp([e]), 0).strip() + "\n")
        else:
            out.append(ligne(e))
    s = "".join(out)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" ?\n ?", "\n", s)
    return s.strip()


def protege(texte):
    """Aucune ligne du corps ne commence comme un titre ou une ligne de
    métadonnées : elle créerait une entrée que rien ne définit."""
    return "\n".join(("\\" + l) if re.match(r"\s*(#|>)", l) else l for l in texte.split("\n"))


def tableau(n):
    rangs = []
    for tr in n.trouve(lambda e: e.tag == "tr"):
        cellules = [ligne(c).replace("\n", " ").replace("|", "\\|") or " " for c in tr.enfants
                    if isinstance(c, Noeud) and c.tag in ("td", "th")]
        if cellules:
            rangs.append(cellules)
    if not rangs:
        return ""
    larg = max(len(r) for r in rangs)
    rangs = [r + [" "] * (larg - len(r)) for r in rangs]
    out = ["| " + " | ".join(rangs[0]) + " |", "|" + " --- |" * larg]
    out += ["| " + " | ".join(r) + " |" for r in rangs[1:]]
    return "\n".join(out)


def blocs(n, niveau):
    """Le contenu en blocs d'un nœud, en Markdown."""
    out, courant = [], []

    def vide():
        if courant:
            x = ligne(Noeud_tmp(courant))
            if x:
                out.append(protege(x))
            courant.clear()

    for e in n.enfants:
        if isinstance(e, str):
            courant.append(e)
            continue
        t = e.tag
        if t in ("p",):
            vide()
            x = ligne(e)
            if x:
                out.append(protege(x))
        elif t in ("h2", "h3", "h4", "h6"):
            vide()
            x = ligne(e).replace("\n", " ")
            if x:
                out.append("#" * min(6, {"h2": 2, "h3": 3, "h4": 4, "h6": 5}[t] + niveau) + " " + x)
        elif t in ("ul", "ol"):
            vide()
            items = []
            for k, li in enumerate(c for c in e.enfants if isinstance(c, Noeud) and c.tag == "li"):
                x = ligne(li).replace("\n", "\n  ")
                puce = f"{k + 1}." if t == "ol" else "-"
                if x:
                    items.append(f"{puce} {x}")
            if items:
                out.append("\n".join(items))
        elif t == "dl":
            vide()
            for d in e.trouve(lambda c: c.tag == "dt"):
                dd = next((c for c in d.parent.enfants if isinstance(c, Noeud) and c.tag == "dd"), None)
                corps = ligne(dd) if dd is not None else ""
                out.append(protege(f"**{ligne(d)}.** {corps}".strip()))
        elif t == "table":
            vide()
            x = tableau(e)
            if x:
                out.append(x)
        elif t == "pre":
            vide()
            out.append("```text\n" + brut(e).strip("\n") + "\n```")
        elif t in ("div", "section", "header", "main", "footer", "nav", "article"):
            vide()
            x = blocs(e, niveau)
            if x.strip():
                if "box" in e.classes or "dead" in e.classes:
                    x = "\n".join("> " + l if l else ">" for l in x.strip().split("\n"))
                out.append(x.strip())
        else:
            courant.append(e)
    vide()
    return "\n\n".join(out)


class Noeud_tmp(Noeud):
    def __init__(self, enfants):
        super().__init__("tmp")
        self.enfants = list(enfants)


def entree(n):
    """Une entrée du journal du carnet : (identifiant ou None, date, titre, corps)."""
    quand = next(n.trouve(lambda e: e.tag == "span" and "when" in e.classes))
    quand_txt = brut(quand).strip()
    m = re.search(r"J-\d{4}-\d{2}-\d{2}-[A-Z]", quand_txt)
    titre_n = next(n.trouve(lambda e: e.tag == "h3"), None)
    titre = ligne(titre_n).replace("\n", " ") if titre_n is not None else "(sans titre)"
    reste = Noeud_tmp([e for e in n.enfants if e is not quand and e is not titre_n])
    return (m.group(0) if m else None), quand_txt, titre, blocs(reste, 1).strip()


def main():
    source, sortie = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    a = Arbre()
    a.feed(source.read_text(encoding="utf-8"))
    sections = list(a.racine.trouve(lambda e: e.tag == "section"))
    rapport = [f"source : {source.stat().st_size} octets"]
    (sortie / "journal").mkdir(parents=True, exist_ok=True)
    (sortie / "rubriques").mkdir(parents=True, exist_ok=True)

    sans_id, par_mois = [], collections.defaultdict(list)
    for s in sections:
        ident = s.attrs.get("id", "?")
        if ident == "journal":
            for e in s.trouve(lambda x: x.tag == "div" and "entry" in x.classes):
                j, quand, titre, corps = entree(e)
                if j is None:
                    sans_id.append((quand, titre, corps))
                else:
                    par_mois[j[2:9]].append((j, titre, corps))
            continue
        texte = blocs(s, 0).strip() + "\n"
        (sortie / "rubriques" / f"{ident}.md").write_text(texte, encoding="utf-8")
        rapport.append(f"rubrique {ident:<11} : {len(texte.encode()):>7} octets en Markdown")

    total, n_entrees = 0, 0
    for mois in sorted(par_mois):
        entrees = sorted(par_mois[mois], key=lambda t: t[0])
        fichier, k, courant = 1, 0, EN_TETE_JOURNAL + f"# Journal — {mois}\n"
        def ecrit(fichier, courant):
            nom = f"{mois}.md" if fichier == 1 else f"{mois}-{fichier}.md"
            (sortie / "journal" / nom).write_text(courant, encoding="utf-8")
            rapport.append(f"journal {nom:<13} : {len(courant.encode()):>7} octets")
        for j, titre, corps in entrees:
            bloc = f"\n## {j} — {titre}\n\n> type : carnet · date : {j[2:12]}\n\n{corps}\n"
            if len((courant + bloc).encode()) > BUDGET_JOURNAL and courant.count("\n## ") > 0:
                ecrit(fichier, courant)
                fichier += 1
                courant = EN_TETE_JOURNAL + f"# Journal — {mois}, suite {fichier}\n"
            courant += bloc
            total += len(bloc.encode())
            n_entrees += 1
        ecrit(fichier, courant)
    if sans_id:
        texte = "\n\n".join(f"### {q} — {t}\n\n{c}" for q, t, c in sans_id) + "\n"
        (sortie / "rubriques" / "journal-sans-identifiant.md").write_text(texte, encoding="utf-8")
    rapport.append(f"journal : {n_entrees} entrées à identifiant, {total} octets ; {len(sans_id)} sans identifiant")
    gros = sorted(((len(c.encode()), j) for m in par_mois.values() for j, _, c in m), reverse=True)[:5]
    rapport.append("plus grosses entrées : " + ", ".join(f"{j} {o} o" for o, j in gros))
    (sortie / "rapport.txt").write_text("\n".join(rapport) + "\n", encoding="utf-8")
    print("\n".join(rapport))


if __name__ == "__main__":
    main()
