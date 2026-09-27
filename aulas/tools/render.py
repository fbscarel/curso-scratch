#!/usr/bin/env python3
"""Render Scratch course documents: Markdown -> HTML -> PDF.

Usage:
    python3 tools/render.py pdf                 # every src/*.md not starting with "_"
    python3 tools/render.py demo                # src/_demo.md and src/_demo-slides.md
    python3 tools/render.py check               # fail if pdf/ is out of date (no chromium)
    python3 tools/render.py src/aula-01.md ...  # explicit files

Pipeline per document:
  1. read YAML-ish front matter (title, kind)
  2. Markdown -> HTML (python-markdown)
  3. ```blocks fenced code blocks become <pre class="blocks"> and get
     rendered by scratchblocks (Scratch 3 style, pt-BR) in the browser
  4. wrap in the template (theme/doc.css or theme/slides.css)
  5. write build/<name>.html and print it to pdf/<name>.pdf with headless chromium
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
THEME = ROOT / "theme"
BUILD = ROOT / "build"
PDF = ROOT / "pdf"
MANIFEST = PDF / "manifest.json"

CHROMIUM = shutil.which("chromium") or "/usr/bin/chromium"
# Chromium profile lives outside /tmp (small and shared) and outside the repo.
PROFILE = Path.home() / ".cache" / "scratch-aulas" / "chromium-profile"

MARKDOWN_EXTENSIONS = [
    "tables",
    "fenced_code",
    "attr_list",
    "md_in_html",
    "sane_lists",
]

# Scratchblocks render scale. 1.0 already gives ~17mm tall blocks on a slide,
# which is plenty for a projector (and keeps a 8-row script inside one slide).
BLOCK_SCALE = {"doc": 0.8, "slides": 1.8}

# A slide separator: ---slide---  optionally followed by extra CSS classes
# (e.g. "---slide--- title-slide"), which apply to the slide that follows.
SLIDE_SEP = re.compile(r"^\s*-{3,}\s*slide\s*-{3,}\s*(.*?)\s*$", re.IGNORECASE)

FRONT_MATTER = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n", re.DOTALL)

# fenced_code emits <pre><code class="language-blocks"> ... </code></pre>
BLOCKS_CODE = re.compile(r'<pre><code class="language-blocks">')


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    """Split off a leading `--- key: value ---` block."""
    m = FRONT_MATTER.match(text)
    if not m:
        return {}, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        meta[key.strip().lower()] = value.strip().strip("'\"")
    return meta, text[m.end():]


def markdown_to_html(text: str) -> str:
    import markdown

    html = markdown.markdown(text, extensions=MARKDOWN_EXTENSIONS, output_format="html5")
    # ```blocks -> scratchblocks target
    return BLOCKS_CODE.sub('<pre class="blocks"><code>', html)


def split_slides(body: str) -> list[tuple[list[str], str]]:
    """Split markdown into slides; returns [(extra_css_classes, markdown), ...]."""
    slides: list[tuple[list[str], str]] = []
    classes: list[str] = []
    chunk: list[str] = []
    for line in body.splitlines():
        m = SLIDE_SEP.match(line)
        if m:
            slides.append((classes, "\n".join(chunk)))
            classes = [c.lstrip(".") for c in m.group(1).split() if c.strip(".")]
            chunk = []
        else:
            chunk.append(line)
    slides.append((classes, "\n".join(chunk)))
    return [(c, md) for c, md in slides if md.strip()]


def render_body(body: str, kind: str) -> str:
    if kind != "slides":
        return markdown_to_html(body)
    parts = []
    for classes, md in split_slides(body):
        cls = " ".join(["slide"] + classes)
        parts.append(f'<section class="{cls}">\n{markdown_to_html(md)}\n</section>')
    return "\n".join(parts)


TEMPLATE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>@TITLE@</title>
<link rel="stylesheet" href="../theme/@CSS@">
</head>
<body>
@BODY@
@SCRIPTS@</body>
</html>
"""

BLOCKS_SCRIPTS = """<script src="../theme/vendor/scratchblocks.min.js"></script>
<script src="../theme/vendor/scratchblocks-translations-all.js"></script>
<script>
scratchblocks.renderMatching("pre.blocks", {
  style: "scratch3",
  languages: ["pt_br", "en"],
  scale: @SCALE@
});
</script>
"""


def build_html(md_path: Path, kind: str, body: str, title: str) -> Path:
    css = "slides.css" if kind == "slides" else "doc.css"
    scripts = ""
    if 'class="blocks"' in body:
        scripts = BLOCKS_SCRIPTS.replace("@SCALE@", str(BLOCK_SCALE.get(kind, 1.0)))
    html = (
        TEMPLATE.replace("@TITLE@", title)
        .replace("@CSS@", css)
        .replace("@BODY@", body)
        .replace("@SCRIPTS@", scripts)
    )
    out = BUILD / (md_path.stem + ".html")
    out.write_text(html, encoding="utf-8")
    return out


def print_pdf(html_path: Path, pdf_path: Path) -> None:
    PROFILE.mkdir(parents=True, exist_ok=True)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        CHROMIUM,
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        f"--user-data-dir={PROFILE}",
        f"--print-to-pdf={pdf_path}",
        "--no-pdf-header-footer",
        "--virtual-time-budget=10000",
        html_path.resolve().as_uri(),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not pdf_path.exists():
        sys.stderr.write(res.stdout + res.stderr)
        raise SystemExit(f"chromium failed to produce {pdf_path}")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


# Everything a PDF depends on besides its own markdown: images, stylesheets,
# scratchblocks vendor files and this script. Recorded in pdf/manifest.json so
# `check` can tell whether pdf/ still matches src/.
def shared_inputs() -> list[tuple[str, Path]]:
    """(path relative to aulas/, file) for every shared input."""
    files = [
        (str(p.relative_to(ROOT)), p)
        for d in (SRC / "img", THEME)
        if d.is_dir()
        for p in d.rglob("*")
        if p.is_file()
    ]
    script = Path(__file__).resolve()
    files.append((str(script.relative_to(ROOT)), script))
    return sorted(files)


def shared_digest() -> str:
    """sha256 over sorted (relative path + NUL + bytes) of every shared input."""
    h = hashlib.sha256()
    for rel, path in shared_inputs():
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(path.read_bytes())
    return h.hexdigest()


def load_manifest() -> dict:
    if not MANIFEST.exists():
        return {"pdfs": {}}
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise SystemExit(f"pdf/{MANIFEST.name} ilegível: {exc}")
    if not isinstance(data, dict) or not isinstance(data.get("pdfs"), dict):
        raise SystemExit(f"pdf/{MANIFEST.name}: formato inesperado")
    return data


def write_manifest(data: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def record_pdf(md_path: Path, pdf_path: Path, shared: str) -> None:
    """Merge one rendered document into the manifest (other entries untouched)."""
    data = load_manifest()
    data["pdfs"][pdf_path.name] = {
        "source": sha256_file(md_path),
        "shared": shared,
    }
    write_manifest(data)


def check() -> int:
    """Compare pdf/ against src/ and the shared inputs; 0 when everything is in date."""
    shared = shared_digest()
    entries = load_manifest()["pdfs"]
    problems: list[str] = []

    for md_path in pdf_sources():
        name = md_path.stem + ".pdf"
        entry = entries.get(name)
        if entry is None:
            problems.append(f"{name}: sem entrada no manifest.json — rode: just pdf")
            continue
        causes = []
        if entry.get("source") != sha256_file(md_path):
            causes.append(f"{md_path.relative_to(ROOT)} mudou")
        if entry.get("shared") != shared:
            causes.append("imagens, tema ou render.py mudaram")
        pdf_path = PDF / name
        if not pdf_path.exists():
            causes.append("PDF ausente em pdf/")
        if causes:
            problems.append(f"{name}: desatualizado ({'; '.join(causes)}) — rode: just pdf")

    for name in sorted(entries):
        source = SRC / (Path(name).stem + ".md")
        if not source.exists():
            problems.append(f"{name}: entrada no manifest.json sem fonte em src/ — remova a entrada")

    for pdf_path in sorted(PDF.glob("*.pdf")):
        if pdf_path.name.startswith("_") or pdf_path.name in entries:
            continue
        if (SRC / (pdf_path.stem + ".md")).exists():
            continue
        problems.append(f"{pdf_path.name}: PDF em pdf/ sem fonte em src/ — remova o arquivo")

    for line in problems:
        print(line)
    if problems:
        return 1
    print(f"PDFs em dia ({len(pdf_sources())} arquivos)")
    return 0


def render(md_path: Path, shared: str) -> Path:
    text = md_path.read_text(encoding="utf-8")
    meta, body = parse_front_matter(text)
    kind = meta.get("kind", "doc")
    if kind not in ("doc", "slides"):
        sys.stderr.write(f"{md_path.name}: unknown kind {kind!r}, using 'doc'\n")
        kind = "doc"
    title = meta.get("title") or md_path.stem

    BUILD.mkdir(parents=True, exist_ok=True)
    PDF.mkdir(parents=True, exist_ok=True)

    # Images referenced as img/... from src/ must resolve from build/.
    src_img = SRC / "img"
    if src_img.is_dir():
        shutil.copytree(src_img, BUILD / "img", dirs_exist_ok=True)

    html_path = build_html(md_path, kind, render_body(body, kind), title)
    pdf_path = PDF / (md_path.stem + ".pdf")
    print_pdf(html_path, pdf_path)
    if md_path.parent == SRC and not md_path.name.startswith("_"):
        record_pdf(md_path, pdf_path, shared)
    print(f"{md_path.name} -> build/{html_path.name} -> pdf/{pdf_path.name}")
    return pdf_path


def resolve(target: str) -> Path:
    for candidate in (Path(target), ROOT / target, SRC / target):
        if candidate.is_file():
            return candidate.resolve()
    raise SystemExit(f"not found: {target}")


def pdf_sources() -> list[Path]:
    """Every src/*.md that `pdf` mode renders (files starting with "_" are demos)."""
    return sorted(p for p in SRC.glob("*.md") if not p.name.startswith("_"))


def select(args: argparse.Namespace) -> list[Path]:
    if args.targets:
        return [resolve(t) for t in args.targets]
    if args.mode == "demo":
        files = [SRC / "_demo.md", SRC / "_demo-slides.md"]
        missing = [f for f in files if not f.exists()]
        if missing:
            raise SystemExit("missing: " + ", ".join(str(f) for f in missing))
        return files
    return pdf_sources()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", nargs="?", default="pdf", choices=["pdf", "demo", "check"])
    ap.add_argument("targets", nargs="*", help="explicit markdown files")
    args = ap.parse_args()

    if args.mode == "check":
        if args.targets:
            raise SystemExit("check não aceita arquivos")
        return check()

    if not os.path.exists(CHROMIUM):
        raise SystemExit(f"chromium not found at {CHROMIUM}")

    files = select(args)
    if not files:
        print("nothing to render", file=sys.stderr)
    shared = shared_digest()
    for f in files:
        render(f, shared)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
