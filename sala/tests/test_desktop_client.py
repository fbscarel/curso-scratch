"""The desktop "Entregar trabalho" app: its logic, against a live sala server.

The window needs GTK, so it is not exercised here: the tests import the script
by path and drive everything that runs without a display -- the address the
teacher wrote on the board, the finder of the kid's projects and the HTTP client
-- against a real waitress server on an ephemeral port, over a temporary data
directory.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
import os
import socket
import sys
import tempfile
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
import waitress

from app import create_app
from app.config import Config
from app.uploads import MAX_UPLOAD_BYTES

SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "distro"
    / "profile"
    / "airootfs"
    / "usr"
    / "local"
    / "bin"
    / "entregar-trabalho"
)


@pytest.fixture(scope="module")
def desktop():
    """The script itself, imported by path (it is not a module of a package)."""
    loader = importlib.machinery.SourceFileLoader("entregar_trabalho", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    # A .pyc would land next to the script and mkarchiso would bake it into the
    # image, so the import must not cache bytecode.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


@pytest.fixture
def servidor(config: Config, dist_dir: Path, today: date, now: datetime, tmp_path: Path, monkeypatch):
    """A live sala server on an ephemeral port, over this test's data directory."""
    # Werkzeug spools a big upload to the system temp dir; keep even that inside
    # the test's own directory instead of /tmp.
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    application = create_app(config, dist_dir=dist_dir)
    application.config["SALA_TODAY"] = today
    application.config["SALA_NOW"] = now
    server = waitress.create_server(application, host="127.0.0.1", port=0, threads=2)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.effective_port}"
    finally:
        server.close()
        server.task_dispatcher.shutdown()
        thread.join(timeout=5)


def write_project(path: Path, data: bytes = b"projeto de teste") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


# --- the address on the board ----------------------------------------------


@pytest.mark.parametrize(
    "written, expected",
    [
        ("192.168.0.10:8000", "http://192.168.0.10:8000"),
        ("192.168.0.10", "http://192.168.0.10:8000"),
        ("sala.local", "http://sala.local:8000"),
        ("sala.local:9000", "http://sala.local:9000"),
        ("http://192.168.0.10:8000", "http://192.168.0.10:8000"),
        ("http://192.168.0.10:8000/", "http://192.168.0.10:8000"),
        ("http://192.168.0.10:8000/entregar", "http://192.168.0.10:8000"),
        ("HTTP://Sala.Local:8000", "http://sala.local:8000"),
        ("  sala.local  ", "http://sala.local:8000"),
        ("https://sala.local", "https://sala.local:8000"),
        ("[::1]:8000", "http://[::1]:8000"),
    ],
)
def test_normalize_address_reads_what_the_teacher_wrote(desktop, written, expected):
    assert desktop.normalize_address(written) == expected


@pytest.mark.parametrize(
    "written",
    [
        "",
        "   ",
        "http://",
        "http://:8000",
        "sala local",
        "192.168.0.10:abc",
        "192.168.0.10:0",
        "192.168.0.10:70000",
        "ftp://sala.local",
    ],
)
def test_normalize_address_refuses_garbage(desktop, written):
    with pytest.raises(ValueError):
        desktop.normalize_address(written)


# --- the kid's projects ----------------------------------------------------


def test_projetos_are_the_newest_first_without_the_class_copies(desktop, tmp_path: Path):
    home = tmp_path / "home"
    skel = tmp_path / "skel" / "Aulas"
    skel.mkdir(parents=True)
    (skel / "aula1.sb3").write_bytes(b"aula")
    (home / "Aulas").mkdir(parents=True)
    (home / "Aulas" / "aula1.sb3").write_bytes(b"aula")  # a copy nobody worked on
    novo = write_project(home / "novo.sb3")
    antigo = write_project(home / "antigo.sb3")
    fundo = write_project(home / "a" / "b" / "c" / "d" / "ok.sb3")
    write_project(home / ".escondido" / "oculto.sb3")
    write_project(home / "a" / "b" / "c" / "d" / "e" / "longe.sb3")
    write_project(home / "anotacoes.txt")
    os.utime(novo, (3_000_000, 3_000_000))
    os.utime(antigo, (2_000_000, 2_000_000))
    os.utime(fundo, (1_000_000, 1_000_000))

    assert desktop.projetos(home, skel) == [novo, antigo, fundo]


def test_projetos_skip_a_file_that_vanished_before_the_sort(desktop, tmp_path: Path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    sobrou = write_project(home / "sobrou.sb3")
    sumiu = write_project(home / "sumiu.sb3")

    def vanish(path, skel=None):
        if path == sumiu:  # the kid deleted it after the walk had listed it
            sumiu.unlink()
        return False

    monkeypatch.setattr(desktop, "unmodified_copy", vanish)

    assert desktop.projetos(home, tmp_path / "skel") == [sobrou]


@pytest.mark.parametrize(
    "minutes, expected",
    [
        (0, "agora mesmo"),
        (1, "há 1 minuto"),
        (9, "há 9 minutos"),
        (59, "há 59 minutos"),
        (60, "há 1 hora"),
        (150, "há 2 horas"),
        (60 * 24, "há 1 dia"),
        (60 * 24 * 3, "há 3 dias"),
    ],
)
def test_when_text_counts_in_portuguese(desktop, minutes, expected):
    now = datetime(2026, 9, 29, 14, 0, 0)
    assert desktop.when_text(now - timedelta(minutes=minutes), now) == expected


# --- the server ------------------------------------------------------------


def test_students_come_from_the_server(desktop, servidor, add_student):
    ana = add_student("Ana Teste")
    bruno = add_student("Bruno Teste")
    add_student("Carla Teste", active=0)

    client = desktop.Sala(servidor)
    client.session()

    assert client.students() == [{"id": ana, "name": "Ana Teste"}, {"id": bruno, "name": "Bruno Teste"}]


def test_identity_and_upload_land_in_the_current_lesson(
    desktop, servidor, config: Config, add_student, add_lesson, tmp_path: Path
):
    ana = add_student("Ana Teste")
    add_lesson(3, "2026-09-29")
    project = write_project(tmp_path / "meu-jogo.sb3", b"conteudo do projeto")

    client = desktop.Sala(servidor)
    client.session()
    client.pick_student(ana)
    answer = client.upload(project)

    assert answer["lessonNumber"] == 3
    assert answer["name"] == "meu-jogo.sb3"
    assert answer["size"] == len(b"conteudo do projeto")
    stored = list((config.data_dir / "aulas" / "aula-03").rglob("*.sb3"))
    assert len(stored) == 1
    assert stored[0].read_bytes() == b"conteudo do projeto"


def test_a_refused_type_shows_the_servers_message(desktop, servidor, add_student, add_lesson, tmp_path: Path):
    ana = add_student("Ana Teste")
    add_lesson(3, "2026-09-29")
    client = desktop.Sala(servidor)
    client.session()
    client.pick_student(ana)

    with pytest.raises(desktop.Falha) as failure:
        client.upload(write_project(tmp_path / "desenho.txt", b"nada"))

    assert failure.value.status == 422
    assert "Tipo de arquivo não aceito" in str(failure.value)
    assert ".sb3" in str(failure.value)


def test_a_file_over_the_limit_is_refused_before_it_leaves(
    desktop, servidor, config: Config, add_student, add_lesson, tmp_path: Path
):
    ana = add_student("Ana Teste")
    add_lesson(3, "2026-09-29")
    client = desktop.Sala(servidor)
    client.session()
    client.pick_student(ana)
    too_big = write_project(tmp_path / "grande.sb3", b"x" * (MAX_UPLOAD_BYTES + 1))

    with pytest.raises(desktop.Falha) as failure:
        client.upload(too_big)

    assert str(failure.value) == desktop.TOO_LARGE_MESSAGE
    assert "20 MB" in str(failure.value)
    assert failure.value.status is None
    assert not list((config.data_dir / "aulas").rglob("*.sb3"))


def test_a_stale_token_is_refreshed_and_the_write_retried(
    desktop, servidor, config: Config, add_student, add_lesson, tmp_path: Path
):
    ana = add_student("Ana Teste")
    add_lesson(3, "2026-09-29")
    project = write_project(tmp_path / "meu-jogo.sb3")
    client = desktop.Sala(servidor)
    client.session()
    client.csrf = "token-velho-desconhecido"

    client.pick_student(ana)
    answer = client.upload(project)

    assert client.csrf != "token-velho-desconhecido"
    assert answer["lessonNumber"] == 3
    assert len(list((config.data_dir / "aulas" / "aula-03").rglob("*.sb3"))) == 1


def test_a_server_that_does_not_answer_asks_for_the_address(desktop):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    client = desktop.Sala(f"http://127.0.0.1:{port}")

    with pytest.raises(desktop.Falha) as failure:
        client.session()

    assert "endereço" in str(failure.value)


@pytest.mark.parametrize("payload", [b'[{"id": 1}]', b'[{"name": "Ana"}]', b'["Ana"]', b"[1]"])
def test_students_refuse_a_strange_payload(desktop, monkeypatch, payload: bytes):
    client = desktop.Sala("http://127.0.0.1:1")
    monkeypatch.setattr(client, "_request", lambda *args, **kwargs: (200, payload))

    with pytest.raises(desktop.Falha) as failure:
        client.students()

    assert str(failure.value) == desktop.STRANGE_MESSAGE


@pytest.mark.parametrize("payload", [b"[]", b'{"size": 3}', b'"aula 3"'])
def test_upload_refuses_a_strange_answer(desktop, monkeypatch, tmp_path: Path, payload: bytes):
    client = desktop.Sala("http://127.0.0.1:1")
    monkeypatch.setattr(client, "_write", lambda *args, **kwargs: payload)

    with pytest.raises(desktop.Falha) as failure:
        client.upload(write_project(tmp_path / "jogo.sb3"))

    assert str(failure.value) == desktop.STRANGE_MESSAGE


def test_opening_the_classroom_brings_client_and_names_together(desktop, servidor, add_student):
    ana = add_student("Ana Teste")
    bruno = add_student("Bruno Teste")

    client, session, students = desktop.open_classroom(servidor)

    assert students == [{"id": ana, "name": "Ana Teste"}, {"id": bruno, "name": "Bruno Teste"}]
    assert client.csrf == session["csrf"]  # the names came from the client that hands work in


# --- the file on its way out -----------------------------------------------


def test_multipart_body_frames_the_bytes_it_was_given(desktop, tmp_path: Path):
    project = write_project(tmp_path / "meu-jogo.sb3")

    body, content_type = desktop.multipart_body(project, b"conteudo", boundary="bbbbbbbb")

    assert content_type == "multipart/form-data; boundary=bbbbbbbb"
    assert body == (
        b"--bbbbbbbb\r\n"
        b'Content-Disposition: form-data; name="file"; filename="meu-jogo.sb3"\r\n'
        b"Content-Type: application/octet-stream\r\n\r\n"
        b"conteudo"
        b"\r\n--bbbbbbbb--\r\n"
    )


def test_the_upload_body_keeps_the_bytes_read_before_the_file_changed(desktop, tmp_path: Path):
    project = write_project(tmp_path / "meu-jogo.sb3", b"antes da troca")
    body, _content_type = desktop.multipart_body(project, project.read_bytes(), boundary="bbbbbbbb")

    project.write_bytes(b"depois, e bem maior do que o conteudo de antes")  # saved during the upload

    assert body.endswith(b"antes da troca\r\n--bbbbbbbb--\r\n")
    assert b"depois" not in body


def test_a_retried_upload_sends_the_same_bytes_and_the_same_length(desktop, monkeypatch, tmp_path: Path):
    project = write_project(tmp_path / "meu-jogo.sb3", b"conteudo do projeto")
    client = desktop.Sala("http://127.0.0.1:1")
    client.csrf = "token-vencido"
    monkeypatch.setattr(client, "renew_session", lambda: None)
    sent: list[tuple[bytes, dict]] = []

    def capture(method, path, *, body=None, headers=None, timeout=None):
        sent.append((body, headers))
        if len(sent) == 1:  # the token the server refuses, so the write is retried
            return 403, b'{"error": "sessao vencida", "code": "csrf"}'
        return 200, b'{"lessonNumber": 3}'

    monkeypatch.setattr(client, "_request", capture)

    assert client.upload(project)["lessonNumber"] == 3

    first_body, first_headers = sent[0]
    second_body, second_headers = sent[1]
    assert first_body == second_body
    assert b"conteudo do projeto" in second_body
    assert int(first_headers["Content-Length"]) == len(first_body)
    assert int(second_headers["Content-Length"]) == len(second_body)


# --- the tasks of the window -----------------------------------------------


def test_only_the_newest_task_owns_the_window(desktop):
    attempts = desktop.Attempts()
    opening = attempts.start()  # the connection the window opens by itself
    clicked = attempts.start()  # Conectar, typed while that one was still running

    assert attempts.is_current(clicked)
    assert not attempts.is_current(opening)  # its late answer must not touch the window
