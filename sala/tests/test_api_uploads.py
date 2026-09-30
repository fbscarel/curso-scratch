"""Public entregas API: handing a file in, listing them and downloading them."""

from __future__ import annotations

import errno
import io
import os
import threading
from datetime import timedelta
from pathlib import Path

import pytest

from app import uploads
from app.auth import CSRF_HEADER

UPLOADS = "/api/uploads"
MY_UPLOADS = "/api/my-uploads"

# The name every upload is stamped with: `SALA_NOW` pins the moment (conftest).
STAMP = "2026-09-29 14h32"


def stored_files(data_dir):
    """Every file the app has stored under `<data>/aulas/`."""
    root = data_dir / "aulas"
    return sorted(path for path in root.rglob("*") if path.is_file()) if root.is_dir() else []


def kid(app, student_id, as_student):
    """A public client that has already picked its name, and its CSRF token."""
    client = app.test_client()
    return client, as_student(client, student_id)


def test_an_upload_without_a_name_is_409(client, csrf_of, add_lesson, upload_file):
    add_lesson(1, "2026-09-01")

    response = upload_file(client, csrf_of(client))

    assert response.status_code == 409
    assert response.get_json()["error"] == "Escolha seu nome primeiro."


def test_an_upload_without_a_current_lesson_is_409(client, add_student, as_student, upload_file):
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token)

    assert response.status_code == 409
    assert response.get_json()["error"] == "Nenhuma aula começou ainda."


def test_an_upload_lands_under_the_current_lesson(
    app, client, add_student, add_lesson, set_override, as_student, upload_file, data_dir
):
    student = add_student("Ana Teste")
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    add_lesson(3, "2026-10-02")
    # The override is what the aula is, not the date: the file must follow it.
    set_override(1)
    token = as_student(client, student)

    response = upload_file(client, token, "meu jogo.sb3", b"abc")

    assert response.status_code == 201
    assert response.get_json() == {
        "id": 1,
        "lessonNumber": 1,
        "name": "meu jogo.sb3",
        "size": 3,
        "createdAt": "2026-09-29 14:32:05",
    }
    assert stored_files(data_dir) == [
        data_dir / "aulas" / "aula-01" / f"{student}-ana-teste" / f"{STAMP} - meu jogo.sb3"
    ]


@pytest.mark.parametrize("extension", uploads.ALLOWED_EXTENSIONS)
def test_every_allowed_type_is_accepted(client, add_student, add_lesson, as_student, upload_file, extension):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    assert upload_file(client, token, f"trabalho{extension}", b"abc").status_code == 201


@pytest.mark.parametrize("name", ["trabalho.SB3", "foto.JPEG", "som.MP3"])
def test_the_extension_is_read_without_case(client, add_student, add_lesson, as_student, upload_file, name):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    assert upload_file(client, token, name, b"abc").status_code == 201


@pytest.mark.parametrize("name", ["virus.exe", "jogo.sb3.exe", "semextensao", "jogo.zip"])
def test_a_type_we_do_not_take_is_422(client, add_student, add_lesson, as_student, upload_file, data_dir, name):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, name, b"abc")

    assert response.status_code == 422
    message = response.get_json()["error"]
    for extension in uploads.ALLOWED_EXTENSIONS:
        assert extension in message
    assert stored_files(data_dir) == []


def test_a_request_without_the_file_field_is_422(client, add_student, add_lesson, as_student, upload_file):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, "jogo.sb3", b"abc", field="arquivo")

    assert response.status_code == 422
    assert "error" in response.get_json()


def test_an_empty_file_is_422_and_leaves_nothing_behind(
    client, add_student, add_lesson, as_student, upload_file, data_dir
):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, "vazio.sb3", b"")

    assert response.status_code == 422
    assert response.get_json()["error"] == "O arquivo está vazio. Escolha de novo."
    assert stored_files(data_dir) == []


def test_a_file_at_the_limit_is_accepted(client, add_student, add_lesson, as_student, upload_file):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, "grande.sb3", b"x" * uploads.MAX_UPLOAD_BYTES)

    assert response.status_code == 201
    assert response.get_json()["size"] == uploads.MAX_UPLOAD_BYTES


def test_a_file_over_the_limit_is_413_json(
    client, add_student, add_lesson, as_student, upload_file, data_dir
):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, "grande.sb3", b"x" * (uploads.MAX_UPLOAD_BYTES + 1))

    assert response.status_code == 413
    assert response.mimetype == "application/json"
    assert "error" in response.get_json()
    assert stored_files(data_dir) == []


def test_a_body_over_the_flask_limit_is_413_json(
    client, add_student, add_lesson, as_student, upload_file, data_dir
):
    # Past the body limit Flask refuses before the view ever sees the file.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, "grande.sb3", b"x" * (uploads.MAX_CONTENT_LENGTH + 1))

    assert response.status_code == 413
    assert response.mimetype == "application/json"
    assert "error" in response.get_json()
    assert stored_files(data_dir) == []


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("../../etc/passwd.sb3", "passwd.sb3"),
        ("..\\x.sb3", "x.sb3"),
        (".hidden.sb3", "hidden.sb3"),
        ("meu\x00jogo.sb3", "meujogo.sb3"),
        ("a" * 300 + ".sb3", "a" * 116 + ".sb3"),
        ("João ção.sb3", "João ção.sb3"),
    ],
)
def test_the_stored_file_is_sanitized_and_stays_inside_aulas(
    client, add_student, add_lesson, as_student, upload_file, data_dir, name, expected
):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, name, b"abc")

    assert response.status_code == 201
    assert response.get_json()["name"] == expected
    files = stored_files(data_dir)
    assert [path.name for path in files] == [f"{STAMP} - {expected}"]
    assert files[0].resolve().is_relative_to((data_dir / "aulas").resolve())


def test_a_name_of_wide_characters_is_stored(
    client, add_student, add_lesson, as_student, upload_file, data_dir
):
    # The name a kid typed can be long and multibyte; the file still has to land
    # (the filesystem refuses a name over 255 bytes).
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, "🎮" * 300 + ".sb3", b"abc")

    assert response.status_code == 201
    files = stored_files(data_dir)
    assert len(files) == 1
    assert len(files[0].name.encode("utf-8")) <= 255
    assert files[0].read_bytes() == b"abc"


def test_a_second_file_of_the_same_name_gets_a_suffix(
    client, add_student, add_lesson, as_student, upload_file, data_dir
):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    assert upload_file(client, token, "jogo.sb3", b"primeiro").status_code == 201
    assert upload_file(client, token, "jogo.sb3", b"segundo").status_code == 201

    files = stored_files(data_dir)
    assert [path.name for path in files] == [f"{STAMP} - jogo (2).sb3", f"{STAMP} - jogo.sb3"]
    # The first one is untouched: the second landed beside it, not over it.
    assert files[1].read_bytes() == b"primeiro"
    assert files[0].read_bytes() == b"segundo"


def test_my_uploads_lists_only_my_own_files(
    app, client, add_student, add_lesson, as_student, upload_file
):
    ana = add_student("Ana Teste")
    bruno = add_student("Bruno Teste")
    add_lesson(1, "2026-09-01")
    ana_client, ana_token = kid(app, ana, as_student)
    bruno_client, bruno_token = kid(app, bruno, as_student)

    upload_file(ana_client, ana_token, "meu.sb3", b"a")
    upload_file(bruno_client, bruno_token, "dele.sb3", b"bb")

    assert ana_client.get(MY_UPLOADS).get_json() == [
        {
            "id": 1,
            "lessonNumber": 1,
            "name": "meu.sb3",
            "size": 1,
            "createdAt": "2026-09-29 14:32:05",
        }
    ]
    assert [upload["name"] for upload in bruno_client.get(MY_UPLOADS).get_json()] == ["dele.sb3"]


def test_my_uploads_is_newest_first_across_aulas(
    app, client, add_student, add_lesson, set_override, as_student, upload_file
):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    set_override(1)
    token = as_student(client, add_student("Ana Teste"))
    upload_file(client, token, "primeiro.sb3", b"1")

    set_override(2)
    app.config["SALA_NOW"] = app.config["SALA_NOW"] + timedelta(minutes=5)
    upload_file(client, token, "segundo.sb3", b"2")

    body = client.get(MY_UPLOADS).get_json()
    assert [(upload["name"], upload["lessonNumber"]) for upload in body] == [
        ("segundo.sb3", 2),
        ("primeiro.sb3", 1),
    ]


def test_my_uploads_without_a_name_is_409(client):
    response = client.get(MY_UPLOADS)

    assert response.status_code == 409
    assert response.get_json()["error"] == "Escolha seu nome primeiro."


def test_downloading_my_own_file_gives_it_back(
    client, add_student, add_lesson, as_student, upload_file
):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))
    upload_file(client, token, "meu jogo.sb3", b"conteudo do jogo")
    upload_id = client.get(MY_UPLOADS).get_json()[0]["id"]

    response = client.get(f"{UPLOADS}/{upload_id}/download")

    assert response.status_code == 200
    assert response.data == b"conteudo do jogo"
    assert "attachment" in response.headers["Content-Disposition"]
    assert "meu jogo.sb3" in response.headers["Content-Disposition"]


def test_downloading_a_file_with_an_accented_name_is_rfc_5987(
    client, add_student, add_lesson, as_student, upload_file
):
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))
    upload_file(client, token, "João ção.sb3", b"abc")
    upload_id = client.get(MY_UPLOADS).get_json()[0]["id"]

    response = client.get(f"{UPLOADS}/{upload_id}/download")

    assert response.status_code == 200
    assert "filename*=UTF-8''Jo%C3%A3o%20%C3%A7%C3%A3o.sb3" in response.headers["Content-Disposition"]


def test_downloading_another_students_file_is_404(
    app, client, add_student, add_lesson, as_student, upload_file
):
    ana = add_student("Ana Teste")
    bruno = add_student("Bruno Teste")
    add_lesson(1, "2026-09-01")
    bruno_client, bruno_token = kid(app, bruno, as_student)
    upload_file(client, as_student(client, ana), "meu.sb3", b"a")
    upload_id = bruno_client.get(MY_UPLOADS).get_json()  # empty: it is not his
    assert upload_id == []

    ana_id = client.get(MY_UPLOADS).get_json()[0]["id"]
    assert bruno_client.get(f"{UPLOADS}/{ana_id}/download").status_code == 404
    assert bruno_client.get(f"{UPLOADS}/999/download").status_code == 404


def test_downloading_without_a_name_is_404(client, add_student, add_lesson, as_student, upload_file):
    add_lesson(1, "2026-09-01")
    upload_id = 1
    token = as_student(client, add_student("Ana Teste"))
    upload_file(client, token, "meu.sb3", b"a")
    client.delete("/api/identity", headers={CSRF_HEADER: token})

    assert client.get(f"{UPLOADS}/{upload_id}/download").status_code == 404


@pytest.mark.parametrize(
    ("name", "stored"),
    [("jogo.sb3 ", "jogo.sb3"), ("  foto.JPEG  ", "foto.JPEG"), ("som.mp3\t", "som.mp3")],
)
def test_a_name_with_blank_edges_is_still_its_type(
    client, add_student, add_lesson, as_student, upload_file, name, stored
):
    # The type is read from the name the file is stored under: a browser on
    # Linux hands over `jogo.sb3 ` and `Path('jogo.sb3 ').suffix` is `.sb3 `.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, name, b"abc")

    assert response.status_code == 201
    assert response.get_json()["name"] == stored


@pytest.mark.parametrize("name", [".sb3", " .sb3 ", "..png", "."])
def test_a_name_that_is_only_an_extension_is_422(
    client, add_student, add_lesson, as_student, upload_file, data_dir, name
):
    # `.sb3` has no stem: sanitizing it leaves `sb3`, which is not a type.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    response = upload_file(client, token, name, b"abc")

    assert response.status_code == 422
    assert response.get_json()["error"] == uploads.BAD_TYPE_MESSAGE
    assert stored_files(data_dir) == []


def test_an_upload_through_a_symlinked_aula_writes_nothing_outside(
    app, client, add_student, add_lesson, as_student, upload_file, data_dir, tmp_path
):
    # A symlink at `aulas/aula-NN` points the whole folder outside the data dir:
    # the check has to run before the first byte, not after the file is there.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))
    outside = tmp_path / "fora"
    outside.mkdir()
    aulas = data_dir / "aulas"
    aulas.mkdir(parents=True)
    (aulas / "aula-01").symlink_to(outside, target_is_directory=True)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    response = upload_file(client, token, "jogo.sb3", b"abc")

    assert response.status_code == 500
    assert response.mimetype == "application/json"
    assert response.get_json()["error"] == "Algo deu errado no servidor."
    assert list(outside.rglob("*")) == []
    assert stored_files(data_dir) == []
    assert list(data_dir.rglob(f"{uploads.TEMP_PREFIX}*")) == []


def test_a_failed_row_write_leaves_no_file_behind(
    app, db, client, add_student, add_lesson, as_student, upload_file, data_dir
):
    # The file is placed before the row is written; a database that refuses the
    # row (a lock, a trigger) must not leave an entrega nobody can list.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))
    db.execute("CREATE TRIGGER recusa BEFORE INSERT ON uploads BEGIN SELECT RAISE(ABORT, 'nao'); END")
    db.commit()
    app.config["PROPAGATE_EXCEPTIONS"] = False

    response = upload_file(client, token, "jogo.sb3", b"abc")

    assert response.status_code == 500
    assert response.mimetype == "application/json"
    assert response.get_json()["error"] == "Algo deu errado no servidor."
    assert stored_files(data_dir) == []
    assert not (data_dir / "aulas" / "aula-01" / "1-ana-teste").exists()
    assert list(data_dir.rglob(f"{uploads.TEMP_PREFIX}*")) == []
    assert client.get(MY_UPLOADS).get_json() == []


def test_uploads_of_one_name_at_the_same_moment_never_overwrite_each_other(
    app, db, add_student, add_lesson, data_dir
):
    # Six kids' worth of uploads racing for one name in the same minute: the
    # never-overwrite rule is the whole reason the target is created with
    # `O_EXCL`, so it is checked with real threads, not one request after another.
    student = add_student("Ana Teste")
    add_lesson(1, "2026-09-01")
    count = 6
    payloads = [bytes([index]) * 4096 for index in range(count)]
    barrier = threading.Barrier(count)
    statuses: dict[int, int] = {}

    def upload(index: int) -> None:
        racer = app.test_client()
        token = racer.get("/api/session").get_json()["csrf"]
        picked = racer.put(
            "/api/identity", json={"studentId": student}, headers={CSRF_HEADER: token}
        )
        assert picked.status_code == 204
        barrier.wait(timeout=10)
        response = racer.post(
            "/api/uploads",
            data={"file": (io.BytesIO(payloads[index]), "corrida.sb3")},
            headers={CSRF_HEADER: token},
            content_type="multipart/form-data",
        )
        statuses[index] = response.status_code

    threads = [threading.Thread(target=upload, args=(index,)) for index in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert statuses == dict.fromkeys(range(count), 201)
    files = stored_files(data_dir)
    assert {path.name for path in files} == {
        f"{STAMP} - corrida{suffix}.sb3" for suffix in ("", " (2)", " (3)", " (4)", " (5)", " (6)")
    }
    # Every payload is on disk whole: nobody landed on anybody else's file.
    assert sorted(path.read_bytes() for path in files) == sorted(payloads)
    assert db.execute("SELECT count(*) FROM uploads").fetchone()[0] == count
    assert list(data_dir.rglob(f"{uploads.TEMP_PREFIX}*")) == []


def test_an_upload_survives_a_filesystem_without_hard_links_or_renames(
    app, client, add_student, add_lesson, as_student, upload_file, data_dir, monkeypatch
):
    # exFAT, SMB and sshfs refuse `os.link`, and a move across mounts refuses
    # `os.replace`: never-overwrite is `O_EXCL` plus a copy, and it must hold.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))

    def no_links(*args, **kwargs):
        raise OSError(errno.EPERM, "hard links are not supported here")

    rename = os.replace

    def no_rename(source, target, *args, **kwargs):
        if Path(target).is_relative_to(data_dir):
            raise OSError(errno.EXDEV, "invalid cross-device link")
        return rename(source, target, *args, **kwargs)

    monkeypatch.setattr(os, "link", no_links)
    monkeypatch.setattr(os, "replace", no_rename)

    assert upload_file(client, token, "jogo.sb3", b"primeiro").status_code == 201
    assert upload_file(client, token, "jogo.sb3", b"segundo").status_code == 201

    files = stored_files(data_dir)
    assert [path.name for path in files] == [f"{STAMP} - jogo (2).sb3", f"{STAMP} - jogo.sb3"]
    assert files[0].read_bytes() == b"segundo"
    assert files[1].read_bytes() == b"primeiro"


def test_a_move_that_fails_leaves_no_empty_file_taking_the_name(
    app, client, add_student, add_lesson, as_student, upload_file, data_dir, monkeypatch
):
    # The move's target is the final name: a failure that is not an OSError
    # would leave the 0-byte reservation there, and the kid's next upload of
    # that name would land as ` (2)` instead of the plain one.
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))
    rename = os.replace

    def explode(source, target, *args, **kwargs):
        if Path(target).is_relative_to(data_dir):
            raise RuntimeError("a renomeação falhou")
        return rename(source, target, *args, **kwargs)

    monkeypatch.setattr(os, "replace", explode)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    response = upload_file(client, token, "jogo.sb3", b"abc")

    assert response.status_code == 500
    assert response.mimetype == "application/json"
    assert stored_files(data_dir) == []
    assert list(data_dir.rglob(f"{uploads.TEMP_PREFIX}*")) == []

    monkeypatch.setattr(os, "replace", rename)

    assert upload_file(client, token, "jogo.sb3", b"abc").status_code == 201
    assert [path.name for path in stored_files(data_dir)] == [f"{STAMP} - jogo.sb3"]
