"""The Groovie page: `/batidas/`, its files, the policy they run under and the
pt-BR sentence of an install that is not ready."""

from __future__ import annotations

from pathlib import Path

import pytest

from app import groovie, groovie_page

INDEX_MARK = "<title>Groovie</title>"


@pytest.fixture
def groovie_dir(tmp_path: Path, monkeypatch) -> Path:
    """A stand-in for the install (`SALA_GROOVIE`), filled like the real one."""
    directory = tmp_path / "groovie"
    (directory / "samples").mkdir(parents=True)
    (directory / "index.html").write_text(
        f'<!doctype html><html><head>{INDEX_MARK}</head>'
        '<body><script type="module" src="main.js"></script></body></html>',
        encoding="utf-8",
    )
    (directory / "style.css").write_text("body { color: #000; }", encoding="utf-8")
    (directory / "main.js").write_text("fetch('samples/kick_01.wav');", encoding="utf-8")
    (directory / "samples" / "kick_01.wav").write_bytes(b"RIFF....WAVE")
    (directory / ".secret").write_text("segredo", encoding="utf-8")
    # The marker `main()` writes after the download verified every file and the
    # audit passed: without it the page says it is not installed.
    groovie.marker_path(directory).write_text("teste\n", encoding="utf-8")
    monkeypatch.setenv("SALA_GROOVIE", str(directory))
    return directory


def test_the_page_is_served_with_its_own_policy_and_never_cached(client, groovie_dir):
    response = client.get("/batidas/")

    assert response.status_code == 200
    assert response.mimetype == "text/html"
    assert INDEX_MARK in response.get_data(as_text=True)
    assert response.headers["Content-Security-Policy"] == groovie_page.GROOVIE_CSP
    assert response.headers["Cache-Control"] == "no-store"


def test_the_page_is_not_the_spa_shell(client, groovie_dir, dist_dir):
    response = client.get("/batidas/")

    assert '<div id="root">' not in response.get_data(as_text=True)
    assert (dist_dir / "index.html").read_text(encoding="utf-8") not in response.get_data(as_text=True)


def test_the_policy_never_leaves_this_laptop():
    policy = groovie_page.GROOVIE_CSP

    assert "http://" not in policy and "https://" not in policy
    assert "*" not in policy
    assert "unsafe-eval" not in policy
    assert "unsafe-inline" not in policy


def test_every_answer_of_the_prefix_carries_the_policy(client, groovie_dir):
    responses = [
        client.get("/batidas/"),
        client.get("/batidas"),
        client.get("/batidas/style.css"),
        client.get("/batidas/index.html"),
        client.get("/batidas/nada.js"),
        client.get("/batidas/.secret"),
    ]

    for response in responses:
        assert response.headers.get("Content-Security-Policy") == groovie_page.GROOVIE_CSP, response.request.path


def test_the_page_files_are_served_with_their_type_and_an_immutable_cache(client, groovie_dir):
    stylesheet = client.get("/batidas/style.css")
    script = client.get("/batidas/main.js")
    sample = client.get("/batidas/samples/kick_01.wav")

    assert stylesheet.status_code == 200
    assert stylesheet.mimetype == "text/css"
    assert script.status_code == 200
    assert script.mimetype in {"text/javascript", "application/javascript"}
    assert sample.status_code == 200
    assert sample.data == b"RIFF....WAVE"
    for response in (stylesheet, script, sample):
        assert "immutable" in response.headers["Cache-Control"]


@pytest.mark.parametrize(
    "url",
    ["/batidas/index.html", "/batidas/./index.html", "/batidas/./INDEX.HTML"],
)
def test_index_html_by_name_redirects_to_the_page(client, groovie_dir, url):
    # The page is served from `/batidas/` alone (the relative files resolve from
    # there); a second URL for the same document would be a second cache policy.
    response = client.get(url)

    assert response.status_code == 302
    assert response.headers["Location"] == "/batidas/"


def test_a_dotfile_of_the_install_is_not_served(client, groovie_dir):
    assert client.get("/batidas/.secret").status_code == 404


def test_the_completion_marker_is_not_served(client, groovie_dir):
    assert client.get("/batidas/.instalado").status_code == 404


def test_the_bare_path_redirects_to_the_slash(client, groovie_dir):
    # The page's relative files resolve from `/batidas/`, not from `/batidas`.
    response = client.get("/batidas")

    assert response.status_code == 302
    assert response.headers["Location"] == "/batidas/"


def test_a_path_under_the_prefix_is_404_and_not_the_spa(client, groovie_dir):
    response = client.get("/batidas/nada.js")

    assert response.status_code == 404
    assert '<div id="root">' not in response.get_data(as_text=True)


def test_a_missing_install_is_a_pt_br_sentence_not_a_broken_page(client, tmp_path, monkeypatch):
    monkeypatch.setenv("SALA_GROOVIE", str(tmp_path / "sem-groovie"))

    response = client.get("/batidas/")

    assert response.status_code == 200
    assert response.mimetype == "text/html"
    assert "just sala-groovie" in response.get_data(as_text=True)
    assert INDEX_MARK not in response.get_data(as_text=True)


def test_a_half_downloaded_install_is_not_served(client, groovie_dir):
    # index.html is there, the samples are not, and no marker says the download
    # finished: the kid reads the pt-BR sentence instead of a page that plays
    # nothing.
    groovie.marker_path(groovie_dir).unlink()
    (groovie_dir / "samples" / "kick_01.wav").unlink()

    response = client.get("/batidas/")

    assert response.status_code == 200
    assert "just sala-groovie" in response.get_data(as_text=True)
    assert INDEX_MARK not in response.get_data(as_text=True)
