#!/usr/bin/env python3
"""
DOM-based migration: blog/posts/*.html (full standalone pages) ->
_blog_posts/*.html (Jekyll collection docs: front matter + body only).

Lifts the article body out, drops all chrome + inline CSS (now layout-owned).
Run dry first:   python3 scripts/migrate_blog.py
Apply for real:  python3 scripts/migrate_blog.py --apply
"""
import sys, os, re, json, glob
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "blog", "posts")
OUT_DIR = os.path.join(ROOT, "_blog_posts")
APPLY = "--apply" in sys.argv

# Already hand-migrated in step 3; skip. _template is not a real post.
SKIP = {"_template.html", "cooked-ground-beef-storage.html"}

LIQUID = re.compile(r"\{\{|\}\}|\{%|%\}")


def yaml_str(s):
    """Emit a safe double-quoted YAML scalar."""
    s = (s or "").replace("\\", "\\\\").replace('"', '\\"').strip()
    return '"' + s + '"'


def slug_from_href(href):
    base = href.rstrip("/").split("/")[-1]
    return base[:-5] if base.endswith(".html") else base


def jsonld(soup, typ):
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        if isinstance(data, dict) and data.get("@type") == typ:
            return data
    return None


def extract(path):
    fname = os.path.basename(path)
    slug = fname[:-5]
    with open(path, encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    article = soup.find("article")
    rec = {"slug": slug, "file": fname, "warnings": []}

    # --- front matter ---
    h1 = article.find("h1") if article else None
    rec["title"] = h1.get_text(strip=True) if h1 else ""

    desc = soup.find("meta", attrs={"name": "description"})
    rec["description"] = desc["content"].strip() if desc and desc.get("content") else ""

    art = jsonld(soup, "Article") or {}
    rec["date"] = (art.get("datePublished") or "").strip()
    modified = (art.get("dateModified") or "").strip()
    rec["modified"] = modified if modified and modified != rec["date"] else None

    exc = article.find(class_="article-excerpt") if article else None
    rec["excerpt"] = exc.get_text(strip=True) if exc else ""

    hero = article.find("img", class_="article-hero") if article else None
    rec["image"] = hero["src"].strip() if hero and hero.get("src") else ""

    faq = jsonld(soup, "FAQPage")
    rec["faq"] = []
    if faq:
        for item in faq.get("mainEntity", []):
            q = item.get("name", "")
            a = (item.get("acceptedAnswer") or {}).get("text", "")
            if q and a:
                rec["faq"].append((q, a))

    rec["related"] = []
    rel = article.find(class_="related-posts") if article else None
    if rel:
        for a in rel.find_all("a", class_="related-post-card"):
            if a.get("href"):
                rec["related"].append(slug_from_href(a["href"]))

    # --- body: key-takeaways + TOC + article-content inner HTML ---
    parts = []
    for cls in ("key-takeaways", "table-of-contents"):
        el = article.find(class_=cls) if article else None
        if el:
            parts.append(str(el))
    content = article.find(class_="article-content") if article else None
    if content:
        parts.append("".join(str(c) for c in content.children).strip())
    else:
        rec["warnings"].append("no .article-content found")
    body = "\n\n".join(parts).strip()
    rec["body"] = body

    # --- validations ---
    if not rec["title"]:
        rec["warnings"].append("missing title")
    if not rec["date"]:
        rec["warnings"].append("missing date")
    if not rec["image"]:
        rec["warnings"].append("missing hero image")
    if LIQUID.search(body):
        rec["warnings"].append("LIQUID DELIMITERS IN BODY")
    for k in ("title", "description", "excerpt"):
        if LIQUID.search(rec.get(k) or ""):
            rec["warnings"].append(f"LIQUID DELIMITERS IN {k}")
    return rec


def render(rec):
    fm = ["---"]
    fm.append("layout: post")
    fm.append(f"title: {yaml_str(rec['title'])}")
    fm.append(f"date: {rec['date']}")
    fm.append(f"slug: {rec['slug']}")
    fm.append(f"permalink: /blog/posts/{rec['slug']}.html")
    if rec["image"]:
        fm.append(f"image: {rec['image']}")
    if rec["description"]:
        fm.append(f"description: {yaml_str(rec['description'])}")
    if rec["excerpt"]:
        fm.append(f"excerpt: {yaml_str(rec['excerpt'])}")
    if rec["modified"]:
        fm.append(f"modified: {rec['modified']}")
    if rec["faq"]:
        fm.append("faq:")
        for q, a in rec["faq"]:
            fm.append(f"  - q: {yaml_str(q)}")
            fm.append(f"    a: {yaml_str(a)}")
    if rec["related"]:
        fm.append("related:")
        for r in rec["related"]:
            fm.append(f"  - {r}")
    fm.append("---")
    return "\n".join(fm) + "\n" + rec["body"] + "\n"


def main():
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.html")))
    files = [f for f in files if os.path.basename(f) not in SKIP]
    print(f"{'APPLY' if APPLY else 'DRY-RUN'}: {len(files)} posts\n")
    any_warn = False
    for path in files:
        rec = extract(path)
        flags = " | ".join(rec["warnings"]) if rec["warnings"] else "ok"
        if rec["warnings"]:
            any_warn = True
        print(f"- {rec['slug']:<48} date={rec['date']} faq={len(rec['faq'])} "
              f"rel={len(rec['related'])} body={len(rec['body'])}b  [{flags}]")
        if APPLY:
            out = os.path.join(OUT_DIR, rec["file"])
            with open(out, "w", encoding="utf-8") as f:
                f.write(render(rec))
            os.remove(path)
    print()
    if any_warn and not APPLY:
        print("WARNINGS present. Review before --apply.")
    elif APPLY:
        print(f"Wrote {len(files)} collection docs; removed old static files.")
    else:
        print("All clean. Re-run with --apply to migrate.")


if __name__ == "__main__":
    main()
