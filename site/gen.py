#!/usr/bin/env python3
"""Gera os arquivos do site (build/docs) para o MkDocs.

Lê aulas.yml, copia os PDFs de aulas/pdf/ e os projetos de aulas/projetos/,
gera as miniaturas da primeira página e escreve as páginas de cada aula, a
lista de aulas do index.md e o nav do MkDocs (build/mkdocs-nav.yml).

Uso: .venv/bin/python gen.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import urllib.parse
from datetime import date
from pathlib import Path
from typing import Any

import yaml

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent
AULAS_DIR = ROOT / "aulas"
PDF_DIR = AULAS_DIR / "pdf"
PROJETOS_DIR = AULAS_DIR / "projetos"
BUILD = SITE / "build"
DOCS = BUILD / "docs"
DOWNLOADS = DOCS / "downloads"
THUMBS = DOWNLOADS / "thumbs"
NAV = BUILD / "mkdocs-nav.yml"

AULAS_MARKER = "<!-- AULAS -->"

WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

# (sufixo do arquivo, título do cartão, descrição do cartão)
MATERIAIS = [
    ("ficha", "Ficha", "atividades para fazer no papel (2 páginas)"),
    ("desafios", "Desafios", "cartões de desafio, do ⭐ ao ⭐⭐⭐"),
    ("slides", "Slides", "os slides mostrados na aula"),
    ("roteiro", "Roteiro do professor", "o passo a passo da aula, com as respostas"),
]


def die(message: str) -> None:
    raise SystemExit(f"gen.py: {message}")


def require(path: Path) -> Path:
    if not path.is_file():
        die(f"arquivo não encontrado: {path}")
    return path


def copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(require(src), dst)


def load_aulas() -> list[dict[str, Any]]:
    data = yaml.safe_load(require(SITE / "aulas.yml").read_text(encoding="utf-8")) or {}
    aulas = data.get("aulas")
    if not isinstance(aulas, list) or not aulas:
        die("aulas.yml: falta a lista 'aulas'")
    for aula in aulas:
        for key in ("numero", "titulo", "data", "resumo", "projeto", "projeto_descricao"):
            if key not in aula:
                die(f"aulas.yml: aula {aula.get('numero')} sem o campo '{key}'")
    return aulas


def site_url() -> str:
    config = yaml.safe_load(require(SITE / "mkdocs.yml").read_text(encoding="utf-8")) or {}
    url = config.get("site_url")
    if not url:
        die("mkdocs.yml: falta site_url")
    return url if url.endswith("/") else url + "/"


def format_date(value: Any, with_year: bool = True) -> str:
    """2026-09-29 -> 'Terça, 29/09/2026' (YAML já converte datas em date)."""
    day = value if isinstance(value, date) else date.fromisoformat(str(value))
    fmt = "%d/%m/%Y" if with_year else "%d/%m"
    return f"{WEEKDAYS[day.weekday()]}, {day.strftime(fmt)}"


def aula_page(aula: dict[str, Any], url: str) -> str:
    numero = aula["numero"]
    projeto = aula["projeto"]
    lines = [
        f"# Aula {numero} — {aula['titulo']}",
        "",
        f"**{format_date(aula['data'])}**",
        "",
        "## O que aprendemos",
        "",
    ]
    lines += [f"- {item}" for item in aula["resumo"]]
    lines += ["", "## Materiais", "", '<div class="grid cards" markdown>', ""]
    for suffix, titulo, descricao in MATERIAIS:
        nome = f"aula{numero}-{suffix}"
        lines += [
            f"-   [![{titulo}](downloads/thumbs/{nome}.png)](downloads/{nome}.pdf)",
            "",
            f"    **[{titulo}](downloads/{nome}.pdf)** — {descricao}",
            "",
        ]
    lines += ["</div>", "", "## Projeto no Scratch", "", aula["projeto_descricao"], ""]
    turbowarp = "https://turbowarp.org/?project_url=" + urllib.parse.quote(
        f"{url}downloads/{projeto}.sb3", safe=""
    )
    lines += [
        f"[Abrir no navegador]({turbowarp}){{ .md-button .md-button--primary }}"
        f" [Baixar o projeto (.sb3)](downloads/{projeto}.sb3){{ .md-button }}",
        "",
        "Para abrir o arquivo baixado: em [scratch.mit.edu](https://scratch.mit.edu/) →"
        " **Criar** → **Arquivo → Carregar do seu computador**.",
        "",
    ]
    return "\n".join(lines)


def make_thumb(pdf: Path) -> None:
    out = THUMBS / pdf.stem  # pdftoppm acrescenta a extensão .png
    subprocess.run(
        ["pdftoppm", "-png", "-r", "40", "-f", "1", "-l", "1", "-singlefile", str(pdf), str(out)],
        check=True,
    )
    if not out.with_suffix(".png").is_file():
        die(f"pdftoppm não gerou a miniatura de {pdf}")


def nav(aulas: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "nav": [
            {"Início": "index.md"},
            {
                "Aulas": [
                    {f"Aula {a['numero']} — {a['titulo']}": f"aula-{a['numero']}.md"} for a in aulas
                ]
            },
            {"Para as famílias": "familias.md"},
            {"Para professores": "professores.md"},
            {"Privacidade": "privacidade.md"},
        ]
    }


def main() -> int:
    if not shutil.which("pdftoppm"):
        die("pdftoppm não encontrado (instale o poppler-utils)")

    aulas = load_aulas()
    url = site_url()

    if DOCS.exists():
        shutil.rmtree(DOCS)
    DOCS.mkdir(parents=True)
    DOWNLOADS.mkdir(parents=True)
    THUMBS.mkdir(parents=True)

    # Páginas estáticas (o index.md recebe a lista de aulas).
    require(SITE / "pages" / "index.md")
    for src in sorted((SITE / "pages").glob("*.md")):
        text = src.read_text(encoding="utf-8")
        if src.name == "index.md":
            if AULAS_MARKER not in text:
                die(f"site/pages/index.md: falta o marcador {AULAS_MARKER}")
            lista = "\n".join(
                f"- [Aula {a['numero']} — {a['titulo']}](aula-{a['numero']}.md)"
                f" · {format_date(a['data'], with_year=False)}"
                for a in aulas
            )
            text = text.replace(AULAS_MARKER, lista)
        (DOCS / src.name).write_text(text, encoding="utf-8")

    # PDFs, projetos, miniaturas e páginas das aulas.
    pdfs = [require(PDF_DIR / "bilhete-pais.pdf")]
    for aula in aulas:
        numero = aula["numero"]
        for suffix, _, _ in MATERIAIS:
            pdfs.append(require(PDF_DIR / f"aula{numero}-{suffix}.pdf"))
        copy(PROJETOS_DIR / f"{aula['projeto']}.sb3", DOWNLOADS / f"{aula['projeto']}.sb3")
        (DOCS / f"aula-{numero}.md").write_text(aula_page(aula, url), encoding="utf-8")

    for pdf in pdfs:
        copy(pdf, DOWNLOADS / pdf.name)
        make_thumb(pdf)

    NAV.parent.mkdir(parents=True, exist_ok=True)
    NAV.write_text(
        yaml.safe_dump(nav(aulas), allow_unicode=True, sort_keys=False, width=1000),
        encoding="utf-8",
    )
    print(f"build/docs: {len(aulas)} aulas, {len(pdfs)} PDFs, {len(pdfs)} miniaturas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
