"""O projeto da aula: the teacher's one slot, the kids' listing and the file."""

from __future__ import annotations

import io
import threading
import zipfile
from pathlib import Path
from typing import IO

import pytest

from app import api_public, starter, uploads
from app.auth import CSRF_HEADER
from app.db import connect, get_setting, set_setting

STARTER = "/api/starter"
FILE = "/api/starter/file"

# `SALA_NOW` pins the moment (conftest), so the stored `uploadedAt` never moves.
STAMP = "2026-09-29 14:32:05"

PROJECT = b"conteudo do projeto"


def sb3(*, entry: str = "project.json", payload: bytes = PROJECT) -> bytes:
    """A zip shaped like a Scratch project: `project.json` at the root."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr(entry, payload)
    return buffer.getvalue()


def stored_files(data_dir):
    """Everything the app has stored in the slot's folder."""
    root = data_dir / starter.DIRNAME
    return sorted(path for path in root.iterdir()) if root.is_dir() else []


@pytest.fixture
def upload_starter():
    """POST one file to the admin slot, the way the teacher's card does."""

    def send(client, admin_api, csrf, name="aula4-pong.sb3", data=None, *, field="file"):
        return client.post(
            f"{admin_api}/starter",
            data={field: (io.BytesIO(sb3() if data is None else data), name)},
            headers={CSRF_HEADER: csrf},
            content_type="multipart/form-data",
        )

    return send


@pytest.fixture
def uploaded(admin_client, admin_api, csrf_of, upload_starter):
    """The slot already holding `aula4-pong.sb3`; returns its bytes."""
    data = sb3()
    response = upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), data=data
    )
    assert response.status_code == 201
    return data


def test_without_a_project_the_listing_is_null_and_the_file_is_404(client):
    assert client.get(STARTER).get_json() is None
    assert client.get(FILE).status_code == 404


def test_the_upload_is_listed_for_the_kids_and_served_as_a_scratch_file(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter
):
    data = sb3()
    response = upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), data=data
    )

    assert response.status_code == 201
    assert response.get_json() == {
        "name": "aula4-pong.sb3",
        "size": len(data),
        "uploadedAt": STAMP,
    }
    # The listing needs no student: it is the same answer for a browser that has
    # never picked a name.
    assert client.get(STARTER).get_json() == {
        "name": "aula4-pong.sb3",
        "uploadedAt": STAMP,
        "url": FILE,
    }

    served = client.get(FILE)
    assert served.status_code == 200
    assert served.data == data
    assert served.headers["Content-Type"] == "application/x.scratch.sb3"
    # A file object has no size of its own, and a browser that is not told the
    # length cannot save the project whole.
    assert served.headers["Content-Length"] == str(len(data))
    assert served.headers["Cache-Control"] == "no-store"
    # An attachment of the Scratch type: the image's Firefox opens that in
    # TurboWarp, and would only ever save an octet-stream.
    assert served.headers["Content-Disposition"].startswith("attachment;")
    assert "filename=aula4-pong.sb3" in served.headers["Content-Disposition"]


def test_the_file_lands_in_the_slot_folder(admin_client, admin_api, csrf_of, data_dir, uploaded):
    assert [path.name for path in stored_files(data_dir)] == ["aula4-pong.sb3"]
    assert (data_dir / starter.DIRNAME / "aula4-pong.sb3").read_bytes() == uploaded


def test_replacing_keeps_exactly_one_file(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, uploaded
):
    second = sb3(payload=b"o projeto novo")
    response = upload_starter(
        admin_client,
        admin_api,
        csrf_of(admin_client, f"{admin_api}/session"),
        "aula5-jogo.sb3",
        second,
    )

    assert response.status_code == 201
    assert response.get_json()["name"] == "aula5-jogo.sb3"
    # One file and no leftover of the upload in progress: the new bytes are
    # renamed onto the slot, and the old file goes with the replacement.
    assert [path.name for path in stored_files(data_dir)] == ["aula5-jogo.sb3"]
    assert client.get(STARTER).get_json()["name"] == "aula5-jogo.sb3"
    assert client.get(FILE).data == second


def test_replacing_under_the_same_name_swaps_the_bytes(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, uploaded
):
    second = sb3(payload=b"mesma aula, projeto novo")
    upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), data=second
    )

    assert [path.name for path in stored_files(data_dir)] == ["aula4-pong.sb3"]
    assert client.get(FILE).data == second


def test_two_uploads_at_once_leave_one_project(db, config, data_dir, now, monkeypatch):
    # One slot, one writer: two uploads arriving together must not both read the
    # old name and each leave a file behind. Each upload waits at the read of
    # that name for the other one, which is the interleaving the lock closes.
    seed = connect(config.db_path)
    starter.replace(seed, data_dir, name="primeiro.sb3", stream=io.BytesIO(sb3()), moment=now)
    seed.close()

    reached = threading.Barrier(2, timeout=2)
    seen: set[int] = set()
    seen_lock = threading.Lock()
    real_get_setting = starter.get_setting

    def rendezvous(connection, key):
        value = real_get_setting(connection, key)
        if key != starter.SETTING_NAME:
            return value
        with seen_lock:
            first = threading.get_ident() not in seen
            seen.add(threading.get_ident())
        if first:
            try:
                reached.wait()
            except threading.BrokenBarrierError:
                # The lock is doing its job: the other upload cannot read the
                # slot until this one is done with it.
                pass
        return value

    monkeypatch.setattr(starter, "get_setting", rendezvous)

    names = ["aula-a.sb3", "aula-b.sb3"]
    payloads = [sb3(payload=bytes([index + 1]) * 64) for index in range(len(names))]
    errors: list[Exception] = []

    def upload(index: int) -> None:
        racer = connect(config.db_path)
        try:
            starter.replace(
                racer, data_dir, name=names[index], stream=io.BytesIO(payloads[index]), moment=now
            )
        except Exception as error:
            errors.append(error)
        finally:
            racer.close()

    threads = [threading.Thread(target=upload, args=(index,)) for index in range(len(names))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    files = stored_files(data_dir)
    winner = get_setting(db, starter.SETTING_NAME)
    # Exactly one file, the one the settings name, holding that upload's bytes.
    assert [path.name for path in files] == [winner]
    assert files[0].read_bytes() == payloads[names.index(winner)]


def test_a_removal_at_the_same_time_as_an_upload_leaves_one_project_or_none(
    db, config, data_dir, now, monkeypatch
):
    # One slot, one writer: a removal that read the old name just before an
    # upload took the slot over would drop the settings the upload wrote and
    # leave its file behind — a project the kids cannot see. The removal stops
    # where it would write, the upload runs to its end, and only then does the
    # removal go on.
    seed = connect(config.db_path)
    starter.replace(seed, data_dir, name="primeiro.sb3", stream=io.BytesIO(sb3()), moment=now)
    seed.close()

    at_the_write = threading.Event()
    installed = threading.Event()
    real_delete_setting = starter.delete_setting

    def paused_delete_setting(connection, key):
        if key == starter.SETTING_NAME:
            # The removal stops where it would write: without the lock it has
            # read the old name and goes on to drop what the upload wrote.
            at_the_write.set()
            installed.wait(timeout=2)
        real_delete_setting(connection, key)

    monkeypatch.setattr(starter, "delete_setting", paused_delete_setting)

    errors: list[Exception] = []

    def removal() -> None:
        remover = connect(config.db_path)
        try:
            starter.remove(remover, data_dir)
        except Exception as error:
            errors.append(error)
        finally:
            remover.close()

    remover = threading.Thread(target=removal)
    remover.start()
    assert at_the_write.wait(timeout=2)

    uploader = connect(config.db_path)
    try:
        starter.replace(
            uploader,
            data_dir,
            name="segundo.sb3",
            stream=io.BytesIO(sb3(payload=b"o projeto novo")),
            moment=now,
        )
    finally:
        uploader.close()
    installed.set()
    remover.join(timeout=30)

    assert errors == []
    files = [path.name for path in stored_files(data_dir)]
    name = get_setting(db, starter.SETTING_NAME)
    moment = get_setting(db, starter.SETTING_UPLOADED_AT)
    # Either the slot is empty — no file, neither key — or it holds one project:
    # the settings name the file that is there.
    if name is None:
        assert moment is None
        assert files == []
    else:
        assert moment is not None
        assert files == [name]


def test_the_old_name_is_kept_when_it_is_the_new_file(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, uploaded, db
):
    # Two names can resolve onto one file (a case-folding filesystem, a symlink)
    # and the unlink of the old one would then take the project with it.
    slot = data_dir / starter.DIRNAME
    (slot / "link.sb3").symlink_to("aula4-pong.sb3")
    set_setting(db, starter.SETTING_NAME, "link.sb3")
    db.commit()
    second = sb3(payload=b"o projeto novo")

    response = upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), data=second
    )

    assert response.status_code == 201
    assert (slot / "aula4-pong.sb3").read_bytes() == second
    assert client.get(STARTER).get_json()["name"] == "aula4-pong.sb3"
    assert client.get(FILE).data == second


def test_delete_takes_it_off_the_listing_and_off_the_disk(
    client, admin_client, admin_api, csrf_of, data_dir, uploaded
):
    response = admin_client.delete(
        f"{admin_api}/starter",
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 204
    assert client.get(STARTER).get_json() is None
    assert client.get(FILE).status_code == 404
    assert stored_files(data_dir) == []
    assert admin_client.get(f"{admin_api}/starter").get_json() is None


def test_delete_without_a_project_is_404(admin_client, admin_api, csrf_of):
    response = admin_client.delete(
        f"{admin_api}/starter",
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 404
    assert response.get_json()["error"] == starter.NOT_FOUND_MESSAGE


def test_a_project_deleted_behind_the_app_is_listed_as_none(
    client, admin_client, admin_api, data_dir, uploaded
):
    (data_dir / starter.DIRNAME / "aula4-pong.sb3").unlink()

    assert client.get(STARTER).get_json() is None
    assert client.get(FILE).status_code == 404
    assert admin_client.get(f"{admin_api}/starter").get_json() is None


def test_a_file_that_goes_before_the_size_is_read_is_not_a_500(
    client, data_dir, uploaded, monkeypatch
):
    # The check and the size are two syscalls: a project that goes in between is
    # a slot without one, not a 500.
    real_stat = Path.stat
    target = (data_dir / starter.DIRNAME / "aula4-pong.sb3").resolve()

    def vanishing(self, *, follow_symlinks=True):
        if self == target:
            self.unlink(missing_ok=True)
        return real_stat(self, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(Path, "stat", vanishing)

    assert client.get(STARTER).get_json() is None
    assert client.get(FILE).status_code == 404


def test_a_replacement_in_the_middle_of_a_download_keeps_the_old_bytes(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, monkeypatch
):
    # The teacher's upload lands in the instant between the route picking the
    # project and the response reading it: the new one goes under a new name and
    # the old file is unlinked. The kid must still get the old project, whole.
    old = sb3(payload=b"antigo" * 4000)
    session = f"{admin_api}/session"
    upload_starter(admin_client, admin_api, csrf_of(admin_client, session), data=old)
    real_send_file = api_public.send_file

    def send_file_after_the_replacement(*args, **kwargs):
        upload_starter(
            admin_client,
            admin_api,
            csrf_of(admin_client, session),
            "aula5-jogo.sb3",
            sb3(payload=b"o projeto novo"),
        )
        return real_send_file(*args, **kwargs)

    monkeypatch.setattr(api_public, "send_file", send_file_after_the_replacement)

    response = client.get(FILE)

    assert response.status_code == 200
    assert response.data == old
    assert response.headers["Content-Length"] == str(len(old))
    assert [path.name for path in stored_files(data_dir)] == ["aula5-jogo.sb3"]


def test_the_download_closes_the_file_it_served(client, uploaded, monkeypatch):
    # The response owns the descriptor the route opened, and one left open per
    # download is a descriptor the server runs out of.
    opened: list[tuple[IO[bytes], str]] = []
    real_open_stored_file = starter.open_stored_file

    def recording_open_stored_file(connection, data_dir):
        result = real_open_stored_file(connection, data_dir)
        if result is not None:
            opened.append(result)
        return result

    monkeypatch.setattr(starter, "open_stored_file", recording_open_stored_file)

    # `buffered` is what closes the response in the test client, the way the
    # server closes it once the body has gone out.
    assert client.get(FILE, buffered=True).data == uploaded
    assert [handle.closed for handle, _ in opened] == [True]


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("jogo.zip", sb3(), starter.BAD_TYPE_MESSAGE),
        ("jogo.png", b"\x89PNG\r\n\x1a\n", starter.BAD_TYPE_MESSAGE),
        ("jogo", b"sem extensao", starter.BAD_TYPE_MESSAGE),
        ("jogo.sb3", b"nao sou um zip", starter.NOT_A_PROJECT_MESSAGE),
        ("jogo.sb3", sb3(entry="outro.json"), starter.NOT_A_PROJECT_MESSAGE),
        ("jogo.sb3", b"", starter.NOT_A_PROJECT_MESSAGE),
    ],
)
def test_a_file_that_is_not_a_project_is_refused(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, name, data, message
):
    response = upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), name, data
    )

    assert response.status_code == 422
    assert response.get_json()["error"] == message
    assert client.get(STARTER).get_json() is None
    assert stored_files(data_dir) == []


def test_a_refused_upload_keeps_the_project_that_is_there(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, uploaded
):
    # The teacher picks the wrong file while a project is up: the refusal must
    # not take the aula's project with it.
    response = upload_starter(
        admin_client,
        admin_api,
        csrf_of(admin_client, f"{admin_api}/session"),
        "jogo.sb3",
        b"nao sou um zip",
    )

    assert response.status_code == 422
    assert response.get_json()["error"] == starter.NOT_A_PROJECT_MESSAGE
    assert [path.name for path in stored_files(data_dir)] == ["aula4-pong.sb3"]
    assert (data_dir / starter.DIRNAME / "aula4-pong.sb3").read_bytes() == uploaded
    assert client.get(STARTER).get_json() == {
        "name": "aula4-pong.sb3",
        "uploadedAt": STAMP,
        "url": FILE,
    }
    assert client.get(FILE).data == uploaded


def test_a_request_without_the_file_field_is_422(admin_client, admin_api, csrf_of, data_dir):
    response = admin_client.post(
        f"{admin_api}/starter",
        data={"arquivo": (io.BytesIO(sb3()), "jogo.sb3")},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 422
    assert "error" in response.get_json()
    assert stored_files(data_dir) == []


def test_a_file_over_the_limit_is_413(admin_client, admin_api, csrf_of, data_dir, upload_starter):
    # A real zip, so the refusal is the size and not the format.
    big = sb3(payload=b"\0" * (uploads.MAX_UPLOAD_BYTES + 1))
    response = upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), data=big
    )

    assert response.status_code == 413
    assert response.get_json()["error"] == starter.TOO_LARGE_MESSAGE
    assert stored_files(data_dir) == []


@pytest.mark.parametrize(
    ("name", "stored"),
    [
        ("../../etc/passwd.sb3", "passwd.sb3"),
        ("..\\x.sb3", "x.sb3"),
        (".oculto.sb3", "oculto.sb3"),
        ("Aula 4 - Pong.sb3", "Aula 4 - Pong.sb3"),
        ("a" * 300 + ".sb3", "a" * 116 + ".sb3"),
    ],
)
def test_a_name_with_path_tricks_is_sanitized_and_still_downloadable(
    client, admin_client, admin_api, csrf_of, data_dir, upload_starter, name, stored
):
    data = sb3()
    response = upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), name, data
    )

    assert response.status_code == 201
    assert response.get_json()["name"] == stored
    assert [path.name for path in stored_files(data_dir)] == [stored]
    assert client.get(STARTER).get_json()["name"] == stored
    assert client.get(FILE).data == data


def test_a_name_with_accents_keeps_them_and_is_rfc_5987(
    client, admin_client, admin_api, csrf_of, upload_starter
):
    name = "Aula 4 - Programação.sb3"
    upload_starter(
        admin_client, admin_api, csrf_of(admin_client, f"{admin_api}/session"), name
    )

    assert client.get(STARTER).get_json()["name"] == name
    disposition = client.get(FILE).headers["Content-Disposition"]
    assert f"filename*=UTF-8''Aula%204%20-%20Programa%C3%A7%C3%A3o.sb3" in disposition


def test_the_upload_without_the_admin_session_is_401(client, admin_api, csrf_of):
    token = csrf_of(client, "/api/session")

    assert client.get(f"{admin_api}/starter").status_code == 401
    assert (
        client.post(
            f"{admin_api}/starter",
            data={"file": (io.BytesIO(sb3()), "jogo.sb3")},
            headers={CSRF_HEADER: token},
            content_type="multipart/form-data",
        ).status_code
        == 401
    )
    assert (
        client.delete(f"{admin_api}/starter", headers={CSRF_HEADER: token}).status_code == 401
    )


def test_the_upload_without_the_csrf_token_is_400(admin_client, admin_api):
    assert (
        admin_client.post(
            f"{admin_api}/starter",
            data={"file": (io.BytesIO(sb3()), "jogo.sb3")},
            content_type="multipart/form-data",
        ).status_code
        == 400
    )
    assert admin_client.delete(f"{admin_api}/starter").status_code == 400
