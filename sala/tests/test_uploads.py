"""Entrega storage helpers: the name a file is stored under and the extension list."""

from __future__ import annotations

import pytest

from app import uploads


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("meu jogo.sb3", "meu jogo.sb3"),
        ("../../etc/passwd.sb3", "passwd.sb3"),
        ("..\\x.sb3", "x.sb3"),
        ("/absoluto/jogo.sb3", "jogo.sb3"),
        (".hidden.sb3", "hidden.sb3"),
        ("...", "arquivo"),
        ("", "arquivo"),
        ("meu\x00jogo\x7f.sb3", "meujogo.sb3"),
        ("muita    coisa.sb3", "muita coisa.sb3"),
        ("João ção.sb3", "João ção.sb3"),
        ("foto.SB3", "foto.SB3"),
        ("a" * 300 + ".sb3", "a" * 116 + ".sb3"),
        ("b" * 300 + ".sprite3", "b" * 112 + ".sprite3"),
    ],
)
def test_the_stored_name_is_sanitized(name, expected):
    assert uploads.sanitize_filename(name) == expected


def test_a_sanitized_name_never_grows():
    assert len(uploads.sanitize_filename("a" * 500 + ".sb3")) <= uploads.MAX_FILENAME_LENGTH
    assert len(uploads.sanitize_filename("a" * 500 + ".sprite3")) <= uploads.MAX_FILENAME_LENGTH


def test_a_name_of_wide_characters_stays_within_the_byte_limit():
    # The filesystem counts bytes: 120 emoji are four bytes each, and the name
    # also carries the stamp and possibly a ` (2)` suffix.
    stored = uploads.sanitize_filename("🎮" * 300 + ".sb3")

    assert len(stored.encode("utf-8")) <= uploads.MAX_FILENAME_BYTES
    assert stored.endswith(".sb3")
    assert stored != ".sb3"
    assert "�" not in stored


@pytest.mark.parametrize("extension", uploads.ALLOWED_EXTENSIONS)
def test_every_allowed_extension_is_accepted(extension):
    assert uploads.allowed_extension(f"jogo{extension}") == extension
    assert uploads.allowed_extension(f"jogo{extension.upper()}") == extension


@pytest.mark.parametrize("name", ["jogo.exe", "jogo.sb3.exe", "semextensao", "jogo.zip", "jogo.sb3.txt", ""])
def test_every_other_extension_is_refused(name):
    assert uploads.allowed_extension(name) is None


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Ana Teste", "Ana Teste"),
        ("João ção", "João ção"),
        ("..", "aluno"),
        ("../escape", "escape"),
        ("..\\escape", "escape"),
        ("Ana/Bruno", "Ana Bruno"),
        ("a\\b", "a b"),
        ("/absoluto/jogo", "absoluto jogo"),
        (".escondido", "escondido"),
        ("  ..  ", "aluno"),
        ("", "aluno"),
        ("Ana\x00Teste\x7f", "AnaTeste"),
        ("muita    coisa", "muita coisa"),
        # The teacher's machine folds these onto another folder: Windows drops
        # the trailing dot, macOS normalizes to NFD.
        ("Ana.", "Ana"),
        ("Ana. .", "Ana"),
        ("Joa\u0303o", "João"),
    ],
)
def test_the_zip_segment_is_a_single_safe_folder(name, expected):
    assert uploads.safe_zip_segment(name) == expected


@pytest.mark.parametrize("name", ["..", "../escape", "Ana/Bruno", "a\\b", "..\\..\\x", ".", "Ana.", "Joa\u0303o."])
def test_a_zip_segment_is_never_a_path(name):
    segment = uploads.safe_zip_segment(name)

    assert segment
    assert "/" not in segment
    assert "\\" not in segment
    assert not segment.startswith(".")
    assert segment not in {".", ".."}


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Ana Teste", "ana-teste"),
        ("João ção", "joao-cao"),
        ("  ", "aluno"),
        ("Ana/Bruno", "ana-bruno"),
    ],
)
def test_the_student_folder_slug(name, expected):
    assert uploads.slugify(name) == expected
