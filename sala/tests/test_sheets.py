"""Folhas (G9): the sheet list, the PDF route and what the SPA fallback does with
everything else under `/folhas/`."""

from __future__ import annotations

from pathlib import Path

import pytest

from app import sheets

SHEETS = "/api/sheets"
PDF_BYTES = b"%PDF-1.4\nfolha de teste\n"


@pytest.fixture
def pdfs(tmp_path: Path, monkeypatch) -> Path:
    """A stand-in for the repo's `aulas/pdf`, with only the files a test writes."""
    directory = tmp_path / "pdf"
    directory.mkdir()
    monkeypatch.setenv("SALA_PDFS", str(directory))
    return directory


def write_pdf(directory: Path, name: str, data: bytes = PDF_BYTES) -> Path:
    path = directory / name
    path.write_bytes(data)
    return path


def test_the_pdf_dir_defaults_to_the_repo_aulas_pdf(monkeypatch):
    monkeypatch.delenv("SALA_PDFS", raising=False)

    # `sheets.py` lives in `sala/app`, so the repo is the parent of `sala/`.
    assert sheets.pdf_dir() == Path(sheets.__file__).resolve().parents[2] / "aulas" / "pdf"


def test_the_pdf_dir_can_come_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("SALA_PDFS", str(tmp_path / "outro"))

    assert sheets.pdf_dir() == tmp_path / "outro"


def test_sheets_lists_the_aulas_that_started_and_have_files(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    add_lesson(3, "2026-10-05")  # registered, but its day has not come
    write_pdf(pdfs, "aula1-ficha.pdf")
    write_pdf(pdfs, "aula2-ficha.pdf")
    write_pdf(pdfs, "aula2-desafios.pdf")
    write_pdf(pdfs, "aula3-ficha.pdf")

    assert client.get(SHEETS).get_json() == [
        {
            "lessonNumber": 1,
            "sheets": [
                {"kind": "ficha", "title": "Ficha", "url": "/folhas/aula1-ficha.pdf"},
            ],
        },
        {
            "lessonNumber": 2,
            "sheets": [
                {"kind": "ficha", "title": "Ficha", "url": "/folhas/aula2-ficha.pdf"},
                {"kind": "desafios", "title": "Desafios", "url": "/folhas/aula2-desafios.pdf"},
            ],
        },
    ]


def test_sheets_omits_a_kind_whose_file_is_missing(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    write_pdf(pdfs, "aula1-desafios.pdf")

    assert client.get(SHEETS).get_json() == [
        {
            "lessonNumber": 1,
            "sheets": [
                {"kind": "desafios", "title": "Desafios", "url": "/folhas/aula1-desafios.pdf"},
            ],
        }
    ]


def test_sheets_omits_an_aula_without_files(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    write_pdf(pdfs, "aula2-ficha.pdf")

    assert [entry["lessonNumber"] for entry in client.get(SHEETS).get_json()] == [2]


def test_sheets_is_empty_without_a_current_aula(client, pdfs):
    write_pdf(pdfs, "aula1-ficha.pdf")

    assert client.get(SHEETS).get_json() == []


def test_sheets_is_empty_when_no_aula_has_started(client, add_lesson, pdfs):
    add_lesson(1, "2026-10-05")
    write_pdf(pdfs, "aula1-ficha.pdf")

    assert client.get(SHEETS).get_json() == []


def test_sheets_follows_the_override(client, add_lesson, set_override, pdfs):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    write_pdf(pdfs, "aula1-ficha.pdf")
    write_pdf(pdfs, "aula2-ficha.pdf")
    set_override(1)

    assert [entry["lessonNumber"] for entry in client.get(SHEETS).get_json()] == [1]


def test_the_sheet_is_served_inline(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    write_pdf(pdfs, "aula1-ficha.pdf")

    response = client.get("/folhas/aula1-ficha.pdf")

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert response.data == PDF_BYTES
    assert "attachment" not in response.headers.get("Content-Disposition", "")


def test_a_lesson_that_has_not_started_is_404(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-10-05")
    write_pdf(pdfs, "aula2-ficha.pdf")

    assert client.get("/folhas/aula2-ficha.pdf").status_code == 404


def test_a_lesson_that_is_not_registered_is_404(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    write_pdf(pdfs, "aula1-ficha.pdf")
    write_pdf(pdfs, "aula9-ficha.pdf")

    assert client.get("/folhas/aula9-ficha.pdf").status_code == 404


def test_a_sheet_without_a_file_is_404(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")

    assert client.get("/folhas/aula1-ficha.pdf").status_code == 404


def test_the_teacher_files_are_not_reachable(client, add_lesson, pdfs):
    add_lesson(1, "2026-09-01")
    for name in ("aula1-roteiro.pdf", "aula1-slides.pdf", "bilhete-pais.pdf"):
        write_pdf(pdfs, name)

    for url in ("/folhas/aula1-roteiro.pdf", "/folhas/aula1-slides.pdf", "/folhas/bilhete-pais.pdf"):
        response = client.get(url)
        assert response.status_code == 404, url
        assert response.mimetype == "text/html", url
        assert PDF_BYTES not in response.data, url


@pytest.mark.parametrize(
    "url",
    [
        "/folhas/aula1-ficha.pdf/../x",
        "/folhas/aula1-ficha.pdf/../../etc/passwd",
        "/folhas/aula1-ficha.pdf/",
        "/folhas/../aula1-ficha.pdf",
        "/folhas/aula-1-ficha.pdf",
    ],
)
def test_nothing_else_under_folhas_is_the_spa(client, add_lesson, pdfs, url):
    add_lesson(1, "2026-09-01")
    write_pdf(pdfs, "aula1-ficha.pdf")

    response = client.get(url)

    assert response.status_code == 404
    assert response.mimetype == "text/html"
    assert '<div id="root">' not in response.get_data(as_text=True)


def test_the_folhas_screen_is_the_spa(client):
    response = client.get("/folhas")

    assert response.status_code == 200
    assert '<div id="root">' in response.get_data(as_text=True)
