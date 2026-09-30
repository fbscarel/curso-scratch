"""The EmulatorJS install: the tracked manifest, the sha256-checked download and
the pt-BR reporting of `just sala-emulador` (`python -m app.emulatorjs`)."""

from __future__ import annotations

import hashlib
import http.client
import io
import re
from pathlib import Path

import pytest

from app import emulatorjs, games

LINE = re.compile(r"^[0-9a-f]{64}  \S+$")
CDN = emulatorjs.CDN_BASE


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FakeCDN:
    """Stands in for the pinned CDN: the bytes it was given, or a failure."""

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


class TruncatedCDN:
    """A body that dies mid-stream: an HTTPException, which is not an OSError."""

    def __init__(self, first: bytes = b"metade") -> None:
        self.first = first
        self.reads = 0
        self.url = ""

    def __call__(self, url: str) -> TruncatedCDN:
        self.url = url
        return self

    def read(self, size: int = -1) -> bytes:
        self.reads += 1
        if self.reads == 1:
            return self.first
        raise http.client.IncompleteRead(self.first)

    def __enter__(self) -> TruncatedCDN:
        return self

    def __exit__(self, *args: object) -> bool:
        return False


# --- the tracked manifest --------------------------------------------------


def test_the_tracked_manifest_is_in_sha256sum_format():
    lines = [line for line in emulatorjs.manifest_path().read_text(encoding="utf-8").splitlines() if line.strip()]

    assert len(lines) == 24
    for line in lines:
        assert LINE.fullmatch(line), line


def test_the_manifest_covers_the_common_files_and_every_core_of_the_catalogue():
    manifest = emulatorjs.manifest()

    for name in (
        "loader.js",
        "emulator.min.js",
        "emulator.min.css",
        "compression/extract7z.js",
        "compression/extractzip.js",
        "localization/pt-BR.json",
    ):
        assert name in manifest
    for jogo in games.catalogue():
        assert f"cores/reports/{jogo.core}.json" in manifest
        assert f"cores/{jogo.core}-wasm.data" in manifest
        assert f"cores/{jogo.core}-legacy-wasm.data" in manifest


def test_the_known_cores_come_from_the_manifest():
    assert emulatorjs.known_cores() == (
        "stella2014",
        "mame2003_plus",
        "fbneo",
        "fceumm",
        "snes9x",
        "genesis_plus_gx",
    )


@pytest.mark.parametrize(
    "line, expected",
    [
        ("nao-e-hash  loader.js", "sha256"),
        ("a" * 63 + "  loader.js", "sha256"),
        (sha(b"x") + "  /etc/passwd", "caminho inválido"),
        (sha(b"x") + "  ../fora.js", "caminho inválido"),
    ],
)
def test_a_bad_manifest_line_is_refused(tmp_path, line, expected):
    path = tmp_path / "emulador.sha256"
    path.write_text(line + "\n", encoding="utf-8")

    with pytest.raises(emulatorjs.ManifestError) as error:
        emulatorjs.load_manifest(path)

    assert expected in str(error.value)


def test_an_empty_manifest_is_refused(tmp_path):
    path = tmp_path / "emulador.sha256"
    path.write_text("# só comentário\n", encoding="utf-8")

    with pytest.raises(emulatorjs.ManifestError):
        emulatorjs.load_manifest(path)


def test_a_missing_manifest_is_named(tmp_path):
    with pytest.raises(emulatorjs.ManifestError) as error:
        emulatorjs.load_manifest(tmp_path / "nao-existe.sha256")

    assert "nao-existe.sha256" in str(error.value)


def test_the_data_dir_defaults_to_the_vendor_directory(monkeypatch):
    monkeypatch.delenv("SALA_EMULADOR", raising=False)

    assert emulatorjs.data_dir() == (
        Path(emulatorjs.__file__).resolve().parents[1] / "vendor" / "emulatorjs" / "data"
    )


def test_the_data_dir_can_come_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("SALA_EMULADOR", str(tmp_path / "ejs"))

    assert emulatorjs.data_dir() == tmp_path / "ejs"


# --- the download ----------------------------------------------------------


def test_a_missing_file_is_downloaded(tmp_path):
    cdn = FakeCDN({CDN + "loader.js": b"abc"})

    assert emulatorjs.install(tmp_path, {"loader.js": sha(b"abc")}, opener=cdn) == 0

    assert (tmp_path / "loader.js").read_bytes() == b"abc"
    assert cdn.urls == [CDN + "loader.js"]
    assert list(tmp_path.glob("*" + emulatorjs.PART_SUFFIX)) == []


def test_a_file_inside_a_subdirectory_is_downloaded(tmp_path):
    cdn = FakeCDN({CDN + "cores/stella2014-wasm.data": b"core"})

    assert emulatorjs.install(tmp_path, {"cores/stella2014-wasm.data": sha(b"core")}, opener=cdn) == 0

    assert (tmp_path / "cores" / "stella2014-wasm.data").read_bytes() == b"core"


def test_a_file_that_is_already_right_is_not_downloaded(tmp_path, capsys):
    (tmp_path / "loader.js").write_bytes(b"abc")
    cdn = FakeCDN({CDN + "loader.js": b"outra"})

    assert emulatorjs.install(tmp_path, {"loader.js": sha(b"abc")}, opener=cdn) == 0

    assert cdn.urls == []
    assert (tmp_path / "loader.js").read_bytes() == b"abc"
    assert "já está pronto: loader.js" in capsys.readouterr().out


def test_a_file_with_the_wrong_hash_is_downloaded_again(tmp_path):
    (tmp_path / "loader.js").write_bytes(b"velho")
    cdn = FakeCDN({CDN + "loader.js": b"novo"})

    assert emulatorjs.install(tmp_path, {"loader.js": sha(b"novo")}, opener=cdn) == 0

    assert (tmp_path / "loader.js").read_bytes() == b"novo"


def test_a_mismatch_keeps_the_old_file_and_leaves_nothing_behind(tmp_path, capsys):
    (tmp_path / "loader.js").write_bytes(b"velho")
    cdn = FakeCDN({CDN + "loader.js": b"trocado"})

    code = emulatorjs.install(tmp_path, {"loader.js": sha(b"esperado")}, opener=cdn)

    assert code == 1
    assert (tmp_path / "loader.js").read_bytes() == b"velho"
    assert list(tmp_path.glob("*" + emulatorjs.PART_SUFFIX)) == []
    message = capsys.readouterr().err
    assert "loader.js" in message and "sha256" in message


def test_a_failed_download_is_reported_and_leaves_nothing_behind(tmp_path, capsys):
    cdn = FakeCDN(error=OSError("sem rede"))

    code = emulatorjs.install(tmp_path, {"loader.js": sha(b"abc")}, opener=cdn)

    assert code == 1
    assert not (tmp_path / "loader.js").exists()
    assert list(tmp_path.glob("*" + emulatorjs.PART_SUFFIX)) == []
    message = capsys.readouterr().err
    assert "loader.js" in message and "sem rede" in message


def test_a_body_that_dies_mid_stream_is_reported_and_leaves_nothing_behind(tmp_path, capsys):
    # A dropped connection that already started answering raises
    # IncompleteRead, which is an HTTPException and not an OSError: uncaught, it
    # is an English traceback out of `just sala-emulador` and a `.parcial` file
    # left on disk.
    cdn = TruncatedCDN()

    code = emulatorjs.install(tmp_path, {"loader.js": sha(b"completo")}, opener=cdn)

    assert code == 1
    assert not (tmp_path / "loader.js").exists()
    assert list(tmp_path.glob("*" + emulatorjs.PART_SUFFIX)) == []
    message = capsys.readouterr().err
    assert "loader.js" in message and "não consegui baixar" in message


def test_every_file_is_checked_even_after_a_failure(tmp_path, capsys):
    cdn = FakeCDN({CDN + "b.js": b"b"})

    code = emulatorjs.install(tmp_path, {"a.js": sha(b"a"), "b.js": sha(b"b")}, opener=cdn)

    assert code == 1
    assert (tmp_path / "b.js").read_bytes() == b"b"


def test_missing_files_lists_what_is_not_there_yet(tmp_path):
    (tmp_path / "a.js").write_bytes(b"a")

    pending = list(emulatorjs.missing_files(tmp_path, {"a.js": sha(b"a"), "b.js": sha(b"b")}))

    assert pending == ["b.js"]


def test_the_download_identifies_itself(monkeypatch):
    # The CDN answers 403 to urllib's default user agent.
    seen: dict = {}

    def fake_urlopen(request, timeout=None):
        seen["request"] = request
        return io.BytesIO(b"x")

    monkeypatch.setattr(emulatorjs.urllib.request, "urlopen", fake_urlopen)

    emulatorjs.open_url(CDN + "loader.js")

    assert seen["request"].get_header("User-agent") == emulatorjs.USER_AGENT
    assert "urllib" not in emulatorjs.USER_AGENT.lower()


# --- the command line ------------------------------------------------------


def test_main_downloads_what_is_missing(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SALA_EMULADOR", str(tmp_path))
    monkeypatch.setattr(emulatorjs, "manifest", lambda: {"loader.js": sha(b"abc")})
    cdn = FakeCDN({CDN + "loader.js": b"abc"})
    monkeypatch.setattr(emulatorjs, "open_url", cdn)

    assert emulatorjs.main() == 0

    assert (tmp_path / "loader.js").read_bytes() == b"abc"
    out = capsys.readouterr().out
    assert "EmulatorJS 4.2.3" in out and "Pronto!" in out


def test_main_skips_everything_on_a_second_run(tmp_path, monkeypatch, capsys):
    (tmp_path / "loader.js").write_bytes(b"abc")
    monkeypatch.setenv("SALA_EMULADOR", str(tmp_path))
    monkeypatch.setattr(emulatorjs, "manifest", lambda: {"loader.js": sha(b"abc")})
    cdn = FakeCDN()
    monkeypatch.setattr(emulatorjs, "open_url", cdn)

    assert emulatorjs.main() == 0

    assert cdn.urls == []
    assert "Tudo pronto: 1 arquivos conferidos." in capsys.readouterr().out


def test_main_fails_with_a_mismatch(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SALA_EMULADOR", str(tmp_path))
    monkeypatch.setattr(emulatorjs, "manifest", lambda: {"loader.js": sha(b"esperado")})
    monkeypatch.setattr(emulatorjs, "open_url", FakeCDN({CDN + "loader.js": b"outro"}))

    assert emulatorjs.main() == 1

    assert not (tmp_path / "loader.js").exists()
    assert "sha256" in capsys.readouterr().err


def test_main_reports_a_broken_manifest(monkeypatch, capsys):
    def broken() -> dict:
        raise emulatorjs.ManifestError("manifesto quebrado")

    monkeypatch.setattr(emulatorjs, "manifest", broken)

    assert emulatorjs.main() == 1

    assert "manifesto quebrado" in capsys.readouterr().err
