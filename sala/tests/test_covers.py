"""The game covers: which libretro-thumbnails name a catalogue entry has, the
covers of a data directory, and the download of `just sala-capas`
(`python -m app.cover_download`)."""

from __future__ import annotations

import dataclasses
import http.client
import io
import urllib.error
from pathlib import Path

import pytest

from app import covers, games

PNG = b"\x89PNG\r\n\x1a\n" + b"imagem de mentira" + b"\x00\x00\x00\x00IEND\xaeB`\x82"
JPEG = b"\xff\xd8\xff" + b"imagem de mentira" + b"\xff\xd9"

ENDURO_URL = (
    "https://thumbnails.libretro.com/Atari%20-%202600"
    "/Named_Boxarts/Enduro%20%28USA%29.png"
)


class FakeThumbnails:
    """Stands in for libretro-thumbnails: the bytes it was given, or a failure."""

    def __init__(
        self,
        files: dict[str, bytes] | None = None,
        *,
        error: OSError | None = None,
    ) -> None:
        self.files = files or {}
        self.error = error
        self.urls: list[str] = []

    def __call__(self, url: str) -> io.BytesIO:
        self.urls.append(url)
        if self.error is not None:
            raise self.error
        if url not in self.files:
            # What urllib raises for a thumbnail that is not there.
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
        return io.BytesIO(self.files[url])


class Truncated:
    """A body that dies mid-stream: an HTTPException, which is not an OSError."""

    def __init__(self, first: bytes = PNG) -> None:
        self.first = first
        self.reads = 0

    def __call__(self, url: str) -> Truncated:
        return self

    def read(self, size: int = -1) -> bytes:
        self.reads += 1
        if self.reads == 1:
            return self.first
        raise http.client.IncompleteRead(self.first)

    def __enter__(self) -> Truncated:
        return self

    def __exit__(self, *args: object) -> bool:
        return False


class ShortBody:
    """A body that stops before the length it advertised in its headers.

    What a dropped connection looks like from the reader's side: the stream ends
    early and nothing raises, so only the promised length tells the difference.
    """

    def __init__(self, body: bytes = PNG, *, advertised: int | None = None) -> None:
        self.body = body
        self.headers = {
            "Content-Length": str(
                advertised if advertised is not None else len(body) + 100
            )
        }
        self.sent = False

    def __call__(self, url: str) -> ShortBody:
        return self

    def read(self, size: int = -1) -> bytes:
        if self.sent:
            return b""
        self.sent = True
        return self.body

    def __enter__(self) -> ShortBody:
        return self

    def __exit__(self, *args: object) -> bool:
        return False


# --- the name of a cover ---------------------------------------------------


def test_a_console_cover_is_named_after_its_rom_file():
    assert covers.thumbnail_name(games.by_id("enduro")) == "Enduro (USA)"
    assert covers.thumbnail_name(games.by_id("sonic")) == "Sonic The Hedgehog (USA, Europe)"
    assert (
        covers.thumbnail_name(games.by_id("pitfall"))
        == "Pitfall! - Pitfall Harry's Jungle Adventure (USA)"
    )


def test_an_arcade_cover_uses_the_name_the_catalogue_gives_it():
    # A MAME set name is not what is written on the cabinet, so the catalogue
    # names the thumbnail itself.
    assert covers.thumbnail_name(games.by_id("frogger")) == "Frogger"
    assert covers.thumbnail_name(games.by_id("galaga")) == "Galaga (Namco rev. B)"
    assert covers.thumbnail_name(games.by_id("ms-pac-man")) == "Ms. Pac-Man"
    assert covers.thumbnail_name(games.by_id("donkey-kong")) == "Donkey Kong (US set 1)"


def test_a_game_of_our_own_has_no_thumbnail():
    assert covers.thumbnail_name(games.by_id("pong")) is None
    assert covers.thumbnail_url(games.by_id("pong")) is None


@pytest.mark.parametrize("character", list('&*/:`<>?\\|"'))
def test_the_characters_libretro_replaces_become_underscores(character):
    # libretro writes every one of them as `_`, in the name the catalogue gives
    # and in the one taken from the ROM file alike.
    jogo = dataclasses.replace(games.by_id("frogger"), capa=f"Frogger{character}2")
    assert covers.thumbnail_name(jogo) == "Frogger_2"


def test_the_name_taken_from_the_rom_file_gets_the_same_treatment():
    jogo = dataclasses.replace(
        games.by_id("frogger"), capa=None, rom="arcade/Spy: Hunter?.zip"
    )

    assert covers.thumbnail_name(jogo) == "Spy_ Hunter_"


def test_the_url_points_at_the_system_directory_of_the_thumbnail():
    assert covers.thumbnail_url(games.by_id("enduro")) == ENDURO_URL
    assert covers.thumbnail_url(games.by_id("galaga")) == (
        "https://thumbnails.libretro.com/MAME"
        "/Named_Boxarts/Galaga%20%28Namco%20rev.%20B%29.png"
    )
    assert covers.thumbnail_url(games.by_id("super-mario-world")) == (
        "https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System"
        "/Named_Boxarts/Super%20Mario%20World%20%28USA%29.png"
    )


# --- the covers of a data directory ----------------------------------------


def test_a_game_without_a_cover_file_has_none(tmp_path):
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    assert covers.cover_available(tmp_path, games.by_id("enduro")) is False


def test_the_cover_is_the_first_extension_that_is_there(tmp_path):
    directory = covers.covers_dir(tmp_path)
    directory.mkdir(parents=True)
    (directory / "enduro.webp").write_bytes(b"webp")
    (directory / "enduro.jpg").write_bytes(b"jpg")

    assert covers.cover_file(tmp_path, games.by_id("enduro")).name == "enduro.jpg"

    (directory / "enduro.png").write_bytes(b"png")

    assert covers.cover_file(tmp_path, games.by_id("enduro")).name == "enduro.png"


def test_the_cover_of_another_game_is_not_this_game_s_cover(tmp_path):
    directory = covers.covers_dir(tmp_path)
    directory.mkdir(parents=True)
    (directory / "frogger.png").write_bytes(PNG)

    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None


def test_a_cover_symlink_that_leaves_the_covers_dir_is_no_cover(tmp_path):
    # A symlink planted in capas/ must not hand out a file from anywhere else:
    # the candidate is resolved and refused unless it is still inside.
    directory = covers.covers_dir(tmp_path)
    directory.mkdir(parents=True)
    secret = tmp_path / "config.toml"
    secret.write_bytes(b"senha: segredo")
    (directory / "enduro.png").symlink_to(secret)

    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    assert covers.cover_available(tmp_path, games.by_id("enduro")) is False


def test_a_game_of_our_own_always_has_a_cover(tmp_path):
    # Pong's cover is a screenshot of our own game and travels inside the SPA:
    # there is no file to download and none to look for.
    assert covers.cover_available(tmp_path, games.by_id("pong")) is True


@pytest.mark.parametrize(
    "name, expected",
    [
        ("enduro.png", "image/png"),
        ("enduro.JPG", "image/jpeg"),
        ("enduro.jpeg", "image/jpeg"),
        ("enduro.webp", "image/webp"),
        ("enduro.bmp", "application/octet-stream"),
    ],
)
def test_the_content_type_follows_the_extension(name, expected):
    assert covers.content_type(Path(name)) == expected


def test_the_covers_live_under_the_capas_directory_of_the_data(tmp_path):
    assert covers.covers_dir(tmp_path) == tmp_path / "capas"


# --- the download ----------------------------------------------------------


def test_a_missing_cover_is_downloaded(tmp_path):
    thumbnails = FakeThumbnails({ENDURO_URL: PNG})

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails)

    assert failures == 0
    assert (covers.covers_dir(tmp_path) / "enduro.png").read_bytes() == PNG
    assert thumbnails.urls == [ENDURO_URL]
    assert list(covers.covers_dir(tmp_path).glob("*" + covers.PART_SUFFIX)) == []


def test_a_cover_that_is_already_there_is_not_downloaded(tmp_path, capsys):
    directory = covers.covers_dir(tmp_path)
    directory.mkdir(parents=True)
    (directory / "enduro.jpg").write_bytes(JPEG)
    thumbnails = FakeThumbnails({ENDURO_URL: PNG})

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails)

    assert failures == 0
    assert thumbnails.urls == []
    assert (directory / "enduro.jpg").read_bytes() == JPEG
    assert not (directory / "enduro.png").exists()
    assert "já tem capa: enduro" in capsys.readouterr().out


def test_a_game_of_our_own_is_not_downloaded(tmp_path):
    thumbnails = FakeThumbnails(every_url())

    assert covers.install(tmp_path, games.catalogue(), opener=thumbnails) == 0

    assert covers.thumbnail_url(games.by_id("pong")) is None
    downloaded = sorted(path.stem for path in covers.covers_dir(tmp_path).glob("*.png"))
    wanted = sorted(
        jogo.id for jogo in games.catalogue() if covers.thumbnail_url(jogo) is not None
    )
    assert downloaded == wanted


def test_a_response_that_is_not_an_image_is_refused(tmp_path, capsys):
    thumbnails = FakeThumbnails({ENDURO_URL: b"<html>not an image</html>"})

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails)

    assert failures == 1
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    assert list(covers.covers_dir(tmp_path).glob("*")) == []
    message = capsys.readouterr().err
    assert "Enduro" in message and "não é uma imagem" in message


def test_a_cover_that_is_too_big_is_refused(tmp_path, capsys):
    thumbnails = FakeThumbnails({ENDURO_URL: PNG + b"x" * covers.MAX_COVER_BYTES})

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails)

    assert failures == 1
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    assert list(covers.covers_dir(tmp_path).glob("*")) == []
    assert "passa de 5 MB" in capsys.readouterr().err


def test_a_cover_that_is_not_there_is_reported(tmp_path, capsys):
    thumbnails = FakeThumbnails()

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails)

    assert failures == 1
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    message = capsys.readouterr().err
    assert "Enduro" in message and "libretro-thumbnails" in message


def test_a_body_that_dies_mid_stream_is_reported(tmp_path, capsys):
    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=Truncated())

    assert failures == 1
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    assert list(covers.covers_dir(tmp_path).glob("*")) == []
    assert "não consegui baixar" in capsys.readouterr().err


def test_a_failed_cover_does_not_stop_the_others(tmp_path):
    enduro = games.by_id("enduro")
    frogger = games.by_id("frogger")
    thumbnails = FakeThumbnails({covers.thumbnail_url(frogger): PNG})

    failures = covers.install(tmp_path, [enduro, frogger], opener=thumbnails)

    assert failures == 1
    assert covers.cover_file(tmp_path, enduro) is None
    assert covers.cover_file(tmp_path, frogger).read_bytes() == PNG


def test_a_jpeg_cover_is_accepted_under_the_jpg_extension(tmp_path):
    # The extension follows the bytes: a JPEG stored under a `.png` name would be
    # served as image/png, which is not what it is.
    thumbnails = FakeThumbnails({ENDURO_URL: JPEG})

    assert covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails) == 0

    assert (covers.covers_dir(tmp_path) / "enduro.jpg").read_bytes() == JPEG
    assert not (covers.covers_dir(tmp_path) / "enduro.png").exists()


def test_a_truncated_image_is_refused(tmp_path, capsys):
    # The magic bytes alone are not a picture: a body that stops before the end
    # of the image would be stored and served as a permanent broken cover.
    thumbnails = FakeThumbnails({ENDURO_URL: PNG[:-12]})

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=thumbnails)

    assert failures == 1
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    # The check is before any filesystem work: no directory is even created.
    assert not covers.covers_dir(tmp_path).exists()
    assert "incompleta" in capsys.readouterr().err


def test_a_body_shorter_than_its_content_length_is_reported(tmp_path, capsys):
    # The server said how many bytes it would send and stopped short: nothing
    # raises, so the advertised length is what catches it.
    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=ShortBody(PNG))

    assert failures == 1
    assert covers.cover_file(tmp_path, games.by_id("enduro")) is None
    assert "não consegui baixar" in capsys.readouterr().err


def test_a_cover_that_appears_while_downloading_is_not_overwritten(tmp_path):
    # The teacher drops their own scan into capas/ while the download runs: the
    # download must not replace the picture the teacher chose.
    directory = covers.covers_dir(tmp_path)
    directory.mkdir(parents=True)
    teacher = b"a capa que o professor escolheu"

    class TeacherFirst:
        def __call__(self, url: str) -> io.BytesIO:
            (directory / "enduro.jpg").write_bytes(teacher)
            return io.BytesIO(PNG)

    failures = covers.install(tmp_path, [games.by_id("enduro")], opener=TeacherFirst())

    assert failures == 0
    assert covers.cover_file(tmp_path, games.by_id("enduro")).read_bytes() == teacher
    # No half image left, and nothing under the name the download would have used.
    assert sorted(path.name for path in directory.iterdir()) == ["enduro.jpg"]


def test_a_capas_that_is_a_file_fails_the_cover_and_the_run_goes_on(tmp_path, capsys):
    # A `capas` that cannot be created is a failed cover, not a traceback out of
    # the recipe: the miss is reported and the next game is still tried.
    directory = covers.covers_dir(tmp_path)
    directory.write_text("não sou uma pasta")
    thumbnails = FakeThumbnails(
        {ENDURO_URL: PNG, covers.thumbnail_url(games.by_id("frogger")): PNG}
    )

    failures = covers.install(
        tmp_path, [games.by_id("enduro"), games.by_id("frogger")], opener=thumbnails
    )

    assert failures == 2
    err = capsys.readouterr().err
    assert "Enduro" in err and "não consegui guardar" in err
    assert "Frogger" in err


def test_an_unwritable_capas_fails_the_cover_and_the_run_goes_on(tmp_path, capsys):
    directory = covers.covers_dir(tmp_path)
    directory.mkdir(parents=True)
    directory.chmod(0o500)
    try:
        failures = covers.install(
            tmp_path, [games.by_id("enduro")], opener=FakeThumbnails({ENDURO_URL: PNG})
        )
    finally:
        directory.chmod(0o700)

    assert failures == 1
    assert "não consegui guardar" in capsys.readouterr().err


def test_the_download_identifies_itself(monkeypatch):
    seen: dict = {}

    def fake_urlopen(request, timeout=None):
        seen["request"] = request
        return io.BytesIO(PNG)

    monkeypatch.setattr(covers.urllib.request, "urlopen", fake_urlopen)

    covers.open_url(ENDURO_URL)

    assert seen["request"].get_header("User-agent") == covers.USER_AGENT


# --- the command line ------------------------------------------------------


def every_url() -> dict[str, bytes]:
    return {
        url: PNG
        for url in (covers.thumbnail_url(jogo) for jogo in games.catalogue())
        if url is not None
    }


def test_main_downloads_the_covers_that_are_missing(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SALA_DADOS", str(tmp_path))
    thumbnails = FakeThumbnails(every_url())
    monkeypatch.setattr(covers, "open_url", thumbnails)

    assert covers.main() == 0

    assert (covers.covers_dir(tmp_path) / "enduro.png").read_bytes() == PNG
    assert (covers.covers_dir(tmp_path) / "galaga.png").read_bytes() == PNG
    out = capsys.readouterr().out
    assert "Capas dos jogos em" in out and "Pronto!" in out


def test_main_skips_everything_on_a_second_run(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SALA_DADOS", str(tmp_path))
    thumbnails = FakeThumbnails(every_url())
    monkeypatch.setattr(covers, "open_url", thumbnails)
    assert covers.main() == 0
    capsys.readouterr()

    thumbnails.urls.clear()

    assert covers.main() == 0

    assert thumbnails.urls == []
    assert "Tudo pronto" in capsys.readouterr().out


def test_main_reports_a_cover_that_could_not_be_downloaded(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SALA_DADOS", str(tmp_path))
    files = every_url()
    files.pop(covers.thumbnail_url(games.by_id("frogger")))
    monkeypatch.setattr(covers, "open_url", FakeThumbnails(files))

    # A cover is decoration: the miss is reported and the run still succeeds.
    assert covers.main() == 0

    assert covers.cover_file(tmp_path, games.by_id("frogger")) is None
    assert covers.cover_file(tmp_path, games.by_id("enduro")).read_bytes() == PNG
    err = capsys.readouterr().err
    assert "Frogger" in err and "ícone" in err
