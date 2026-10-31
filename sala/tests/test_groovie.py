"""The Groovie install: the tracked manifest, the sha256-checked download, the
patch that takes the vendor call out and the audit that proves it is gone."""

from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path

import pytest

from app import groovie

LINE = re.compile(r"^[0-9a-f]{64}  \S+$")

# The shape of the published `main.js` around the counter: the two anchors the
# patch is written against, with the call between them.
UPSTREAM_MAIN = (
    b"init_midi();\n"
    b"\n// Count this visit, and show what the count is now at. The service keeps every\n"
    b"// counter under one public namespace.\n"
    b"fetch('https://countapi.mileshilliard.com/api/v1/hit/groovie_pointersgonewild')\n"
    b"    .then(rsp => rsp.json())\n"
    b"    .catch(err => console.error(`Could not get the visit count: ${err.message}`));\n"
    b"\n//============================================================================\n"
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FakeRaw:
    """Stands in for the pinned raw files: the bytes it was given, or a failure."""

    def __init__(self, files: dict[str, bytes] | None = None, *, error: OSError | None = None) -> None:
        self.files = files or {}
        self.error = error
        self.urls: list[str] = []

    def __call__(self, url: str) -> io.BytesIO:
        self.urls.append(url)
        if self.error is not None:
            raise self.error
        if url not in self.files:
            raise OSError(f"404: {url}")
        return io.BytesIO(self.files[url])


# --- the tracked manifest --------------------------------------------------


def test_the_tracked_manifest_is_in_sha256sum_format():
    lines = [line for line in groovie.manifest_path().read_text(encoding="utf-8").splitlines() if line.strip()]

    assert len(lines) == 163
    for line in lines:
        assert LINE.fullmatch(line), line


def test_the_manifest_covers_the_page_and_every_sample():
    manifest = groovie.manifest()

    for name in PAGE_FILES:
        assert name in manifest
    samples = [name for name in manifest if name.startswith("samples/")]
    assert len(samples) == 151
    assert all(name.endswith(".wav") for name in samples)


PAGE_FILES = {
    "LICENSE",
    "audio.js",
    "favicon.ico",
    "favicon.svg",
    "index.html",
    "logo.svg",
    "main.js",
    "midi.js",
    "model.js",
    "sample_list.js",
    "style.css",
    "view.js",
}


def test_the_manifest_is_only_the_files_the_page_loads():
    # The published repository also carries docs, tests, tools and preview
    # images: none of them is part of the install.
    manifest = groovie.manifest()

    for name in manifest:
        assert name.startswith("samples/") or name in PAGE_FILES, name
        assert not any(part.startswith(".") for part in name.split("/")), name


def test_the_manifest_pins_the_patched_main_js():
    # `main.js` is the one file whose served bytes differ from the published
    # ones, and the manifest hashes what is served.
    patched = groovie.patch_main_js(UPSTREAM_MAIN)

    assert b"https://" not in patched
    assert groovie.PATCHES["main.js"] is groovie.patch_main_js


# --- the patch -------------------------------------------------------------


def test_the_patch_takes_the_visit_counter_out_and_keeps_the_rest():
    patched = groovie.patch_main_js(UPSTREAM_MAIN)

    assert b"countapi" not in patched
    assert b"hit_count" not in patched
    assert patched.startswith(b"init_midi();\n")
    assert b"//============================================================================" in patched
    # The comment says why the call is gone, for whoever reads the served file.
    assert "Sala:".encode() in patched


def test_the_patch_refuses_a_file_without_the_counter():
    with pytest.raises(groovie.PatchError):
        groovie.patch_main_js(b"console.log('outra versao');\n")


# --- the vendor-call audit (P17) ------------------------------------------


@pytest.mark.parametrize(
    "data",
    [
        b"fetch('https://countapi.example/api');",
        b"import('http://cdn.example/model.js');",
        b"/* see https://example.com */",
    ],
)
def test_the_audit_finds_an_absolute_url_in_a_script(data):
    assert groovie.audit({"main.js": data}) == ["main.js: chama um endereço de fora (1)."]


def test_the_audit_finds_a_script_or_style_loaded_from_another_site():
    page = b'<html><head><script src="https://cdn.example/app.js"></script></head></html>'

    assert groovie.audit({"index.html": page}) == [
        "index.html: carrega um arquivo de outro site."
    ]


def test_the_audit_finds_a_stylesheet_from_another_site():
    page = b'<link rel="stylesheet" href="https://fonts.example/css">'

    assert groovie.audit({"index.html": page}) == ["index.html: carrega um arquivo de outro site."]


def test_the_audit_finds_an_inline_script_that_imports_from_a_cdn():
    page = (
        b'<html><body><script type="module">'
        b'import { x } from "https://cdn.example/model.js";'
        b"</script></body></html>"
    )

    assert groovie.audit({"index.html": page}) == [
        "index.html: um script ou estilo da página chama um endereço de fora."
    ]


def test_the_audit_finds_an_inline_style_that_loads_a_font():
    page = b"<style>@font-face { src: url(https://fonts.example/x.woff2); }</style>"

    assert groovie.audit({"index.html": page}) == [
        "index.html: um script ou estilo da página chama um endereço de fora."
    ]


def test_the_audit_finds_an_inline_script_even_when_it_stays_here():
    # The page's policy has no 'unsafe-inline': the block would be blocked, so
    # the page would ship broken with a green audit.
    page = b"<script>fetch('samples/kick_01.wav').then(r => r.arrayBuffer());</script>"

    assert groovie.audit({"index.html": page}) == [
        "index.html: tem um script ou estilo escrito na página, e a política da página não permite."
    ]


def test_the_audit_finds_an_inline_style():
    page = b"<style>body { color: #000; }</style>"

    assert groovie.audit({"index.html": page}) == [
        "index.html: tem um script ou estilo escrito na página, e a política da página não permite."
    ]


def test_the_audit_accepts_a_script_tag_with_an_empty_body():
    page = b'<script type="module" src="main.js"></script><script> </script>'

    assert groovie.audit({"index.html": page}) == []


def test_the_audit_finds_an_icon_loaded_from_another_site():
    page = b'<link rel="icon" href="https://cdn.example/favicon.ico">'

    assert groovie.audit({"index.html": page}) == ["index.html: carrega um arquivo de outro site."]


def test_the_audit_accepts_the_page_as_it_is_served():
    # A link a kid can click, or a metadata tag, is not a call the page makes;
    # the samples are fetched from this laptop and named with relative paths.
    page = (
        b'<link rel="canonical" href="https://maximecb.github.io/groovie/">'
        b'<meta property="og:image" content="https://maximecb.github.io/og_image.jpg">'
        b'<link rel="stylesheet" href="style.css">'
        b'<script type="module" src="main.js"></script>'
        b'<a href="https://example.com/about">creditos</a>'
    )

    assert groovie.audit({"index.html": page, "main.js": b"fetch('samples/kick_01.wav');"}) == []


# --- the download ----------------------------------------------------------


def test_a_missing_file_is_downloaded(tmp_path):
    raw = FakeRaw({groovie.RAW_BASE + "style.css": b"body{}"})

    assert groovie.install(tmp_path, {"style.css": sha(b"body{}")}, opener=raw) == 0

    assert (tmp_path / "style.css").read_bytes() == b"body{}"
    assert raw.urls == [groovie.RAW_BASE + "style.css"]
    assert list(tmp_path.glob("*" + groovie.PART_SUFFIX)) == []


def test_main_js_is_stored_patched_and_checked_after_the_patch(tmp_path):
    expected = sha(groovie.patch_main_js(UPSTREAM_MAIN))
    raw = FakeRaw({groovie.RAW_BASE + "main.js": UPSTREAM_MAIN})

    assert groovie.install(tmp_path, {"main.js": expected}, opener=raw) == 0

    stored = (tmp_path / "main.js").read_bytes()
    assert b"countapi" not in stored
    assert sha(stored) == expected


def test_a_file_that_is_already_right_is_not_downloaded(tmp_path, capsys):
    (tmp_path / "style.css").write_bytes(b"body{}")
    raw = FakeRaw({groovie.RAW_BASE + "style.css": b"outra"})

    assert groovie.install(tmp_path, {"style.css": sha(b"body{}")}, opener=raw) == 0

    assert raw.urls == []
    assert "já está pronto: style.css" in capsys.readouterr().out


def test_a_mismatch_keeps_the_old_file_and_leaves_nothing_behind(tmp_path, capsys):
    (tmp_path / "style.css").write_bytes(b"velho")
    raw = FakeRaw({groovie.RAW_BASE + "style.css": b"trocado"})

    code = groovie.install(tmp_path, {"style.css": sha(b"esperado")}, opener=raw)

    assert code == 1
    assert (tmp_path / "style.css").read_bytes() == b"velho"
    assert list(tmp_path.glob("*" + groovie.PART_SUFFIX)) == []
    message = capsys.readouterr().err
    assert "style.css" in message and "sha256" in message


def test_a_failed_download_is_reported_and_leaves_nothing_behind(tmp_path, capsys):
    raw = FakeRaw(error=OSError("sem rede"))

    code = groovie.install(tmp_path, {"style.css": sha(b"body{}")}, opener=raw)

    assert code == 1
    assert not (tmp_path / "style.css").exists()
    assert list(tmp_path.glob("*" + groovie.PART_SUFFIX)) == []
    message = capsys.readouterr().err
    assert "style.css" in message and "sem rede" in message


def test_a_file_the_patch_does_not_recognize_is_not_stored(tmp_path, capsys):
    raw = FakeRaw({groovie.RAW_BASE + "main.js": b"console.log('outra versao');\n"})

    code = groovie.install(tmp_path, {"main.js": sha(b"x")}, opener=raw)

    assert code == 1
    assert not (tmp_path / "main.js").exists()
    assert "main.js" in capsys.readouterr().err


# --- the data directory and the command line -------------------------------


def test_the_data_dir_defaults_to_the_vendor_directory(monkeypatch):
    monkeypatch.delenv("SALA_GROOVIE", raising=False)

    assert groovie.data_dir() == (
        Path(groovie.__file__).resolve().parents[1] / "vendor" / "groovie"
    )


def test_the_data_dir_can_come_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("SALA_GROOVIE", str(tmp_path / "groovie"))

    assert groovie.data_dir() == tmp_path / "groovie"


def test_only_the_completion_marker_makes_an_install_ready(tmp_path, monkeypatch):
    # `index.html` alone can be a download that died halfway: the page would play
    # without its samples.
    directory = tmp_path / "groovie"
    directory.mkdir()
    (directory / "index.html").write_bytes(b"<html></html>")
    monkeypatch.setenv("SALA_GROOVIE", str(directory))

    assert not groovie.installed()

    groovie.marker_path(directory).write_text("teste\n", encoding="utf-8")

    assert groovie.installed()


def test_starting_a_download_drops_the_marker(tmp_path):
    marker = groovie.marker_path(tmp_path)
    marker.write_text("teste\n", encoding="utf-8")
    raw = FakeRaw({groovie.RAW_BASE + "style.css": b"body{}"})

    assert groovie.install(tmp_path, {"style.css": sha(b"body{}")}, opener=raw) == 0

    assert not marker.exists()


def test_main_downloads_and_then_checks_the_calls(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SALA_GROOVIE", str(tmp_path))
    monkeypatch.setattr(groovie, "manifest", lambda: {"style.css": sha(b"body{}")})
    monkeypatch.setattr(groovie, "open_url", FakeRaw({groovie.RAW_BASE + "style.css": b"body{}"}))

    assert groovie.main() == 0

    out = capsys.readouterr().out
    assert "Groovie" in out and "Pronto" not in out
    assert "Nenhuma chamada para fora do notebook" in out
    # The marker is what lets the page be served, and it is written only here.
    assert groovie.installed()


def test_main_refuses_a_tree_that_still_calls_outside(tmp_path, monkeypatch, capsys):
    # The audit is the last line of defence: a file whose hash matched but that
    # still loads something off-site makes the recipe fail, not the class.
    page = b'<script src="https://cdn.example/app.js"></script>'
    (tmp_path / "index.html").write_bytes(page)
    # A marker from an earlier run must not survive a run that fails its audit.
    groovie.marker_path(tmp_path).write_text("teste\n", encoding="utf-8")
    monkeypatch.setenv("SALA_GROOVIE", str(tmp_path))
    monkeypatch.setattr(groovie, "manifest", lambda: {"index.html": sha(page)})

    assert groovie.main() == 1

    message = capsys.readouterr().err
    assert "chama" in message and "index.html" in message
    assert not groovie.installed()
