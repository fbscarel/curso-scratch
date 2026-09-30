"""Admin entregas API: the list, the download, moving between aulas and the zip."""

from __future__ import annotations

import io
import unicodedata
import zipfile

import pytest

from app.auth import CSRF_HEADER

STAMP = "2026-09-29 14h32"


def ana_dir(data_dir, lesson: int = 1):
    return data_dir / "aulas" / f"aula-{lesson:02d}" / "1-ana-teste"


@pytest.fixture
def entregas(app, add_student, add_lesson, as_student, upload_file):
    """Ana with two files and Bruno with one, all in aula 1.

    Aula 2 is registered but has not started (its date is in the future), which
    is what makes aula 1 the current one without an override.
    """
    ana = add_student("Ana Teste")
    bruno = add_student("Bruno Teste")
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-10-05")
    ana_client = app.test_client()
    bruno_client = app.test_client()
    ana_token = as_student(ana_client, ana)
    bruno_token = as_student(bruno_client, bruno)
    upload_file(ana_client, ana_token, "jogo.sb3", b"jogo da ana")
    upload_file(ana_client, ana_token, "desenho.png", b"desenho da ana")
    upload_file(bruno_client, bruno_token, "jogo.sb3", b"jogo do bruno")
    return {"ana": ana, "bruno": bruno, "ana_client": ana_client, "bruno_client": bruno_client}


def test_the_list_carries_the_aluno_and_the_aula(admin_client, admin_api, entregas):
    body = admin_client.get(f"{admin_api}/uploads").get_json()

    assert len(body) == 3
    assert {upload["student"]["name"] for upload in body} == {"Ana Teste", "Bruno Teste"}
    assert all(upload["lessonNumber"] == 1 for upload in body)
    ana_uploads = [upload for upload in body if upload["student"]["name"] == "Ana Teste"]
    assert {upload["name"] for upload in ana_uploads} == {"jogo.sb3", "desenho.png"}
    assert all(upload["createdAt"] == "2026-09-29 14:32:05" for upload in body)
    assert all(set(upload) == {"id", "lessonNumber", "student", "name", "size", "createdAt"} for upload in body)


def test_the_list_filters_by_aula_and_by_aluno(admin_client, admin_api, entregas):
    ana = entregas["ana"]
    bruno = entregas["bruno"]

    assert len(admin_client.get(f"{admin_api}/uploads?lesson=1").get_json()) == 3
    assert admin_client.get(f"{admin_api}/uploads?lesson=2").get_json() == []
    assert len(admin_client.get(f"{admin_api}/uploads?student={ana}").get_json()) == 2
    assert len(admin_client.get(f"{admin_api}/uploads?student={bruno}").get_json()) == 1
    both = admin_client.get(f"{admin_api}/uploads?lesson=1&student={bruno}").get_json()
    assert [upload["name"] for upload in both] == ["jogo.sb3"]
    assert admin_client.get(f"{admin_api}/uploads?lesson=2&student={ana}").get_json() == []
    assert admin_client.get(f"{admin_api}/uploads?lesson=&student=").get_json() != []


@pytest.mark.parametrize("query", ["lesson=abc", "student=1.5", "lesson=0", "student=-2"])
def test_a_malformed_filter_is_422(admin_client, admin_api, query):
    response = admin_client.get(f"{admin_api}/uploads?{query}")

    assert response.status_code == 422
    assert "error" in response.get_json()


def test_the_admin_downloads_any_file(admin_client, admin_api, entregas):
    upload_id = admin_client.get(f"{admin_api}/uploads?student={entregas['bruno']}").get_json()[0]["id"]

    response = admin_client.get(f"{admin_api}/uploads/{upload_id}/download")

    assert response.status_code == 200
    assert response.data == b"jogo do bruno"
    assert "attachment" in response.headers["Content-Disposition"]


def test_the_admin_download_of_an_unknown_upload_is_404(admin_client, admin_api):
    assert admin_client.get(f"{admin_api}/uploads/999/download").status_code == 404


def test_moving_an_entrega_changes_the_folder_and_the_row(
    admin_client, admin_api, csrf_of, db, data_dir, entregas
):
    uploads_in_lesson = admin_client.get(f"{admin_api}/uploads?student={entregas['ana']}&lesson=1").get_json()
    upload_id = next(upload["id"] for upload in uploads_in_lesson if upload["name"] == "jogo.sb3")
    before = ana_dir(data_dir) / f"{STAMP} - jogo.sb3"
    assert before.read_bytes() == b"jogo da ana"

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json={"lessonNumber": 2},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 200
    assert response.get_json()["lessonNumber"] == 2
    assert not before.exists()
    after = ana_dir(data_dir, 2) / f"{STAMP} - jogo.sb3"
    assert after.read_bytes() == b"jogo da ana"
    row = db.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    assert row["lesson_number"] == 2
    assert row["stored_path"] == f"aulas/aula-02/1-ana-teste/{STAMP} - jogo.sb3"
    assert admin_client.get(f"{admin_api}/uploads/{upload_id}/download").data == b"jogo da ana"
    assert admin_client.get(f"{admin_api}/uploads?lesson=2").get_json()[0]["id"] == upload_id


def test_moving_an_entrega_to_its_own_aula_does_nothing(
    admin_client, admin_api, csrf_of, data_dir, entregas
):
    upload_id = admin_client.get(f"{admin_api}/uploads?student={entregas['ana']}").get_json()[0]["id"]

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json={"lessonNumber": 1},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 200
    assert response.get_json()["lessonNumber"] == 1
    assert sorted(path.name for path in ana_dir(data_dir).iterdir()) == [
        f"{STAMP} - desenho.png",
        f"{STAMP} - jogo.sb3",
    ]


def test_moving_onto_a_taken_name_keeps_both_files(
    admin_client, admin_api, csrf_of, app, client, add_student, add_lesson, set_override, as_student, upload_file, data_dir
):
    ana = add_student("Ana Teste")
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    set_override(1)
    token = as_student(client, ana)
    upload_file(client, token, "jogo.sb3", b"da aula 1")
    set_override(2)
    upload_file(client, token, "jogo.sb3", b"da aula 2")
    upload_id = client.get("/api/my-uploads").get_json()[1]["id"]  # the aula 1 one

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json={"lessonNumber": 2},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 200
    assert sorted(path.name for path in ana_dir(data_dir, 2).iterdir()) == [
        f"{STAMP} - jogo (2).sb3",
        f"{STAMP} - jogo.sb3",
    ]
    assert (ana_dir(data_dir, 2) / f"{STAMP} - jogo (2).sb3").read_bytes() == b"da aula 1"
    assert (ana_dir(data_dir, 2) / f"{STAMP} - jogo.sb3").read_bytes() == b"da aula 2"
    assert not ana_dir(data_dir, 1).exists()


def test_moving_to_a_lesson_that_is_not_registered_is_422(
    admin_client, admin_api, csrf_of, data_dir, entregas
):
    upload_id = admin_client.get(f"{admin_api}/uploads").get_json()[0]["id"]

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json={"lessonNumber": 9},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422
    assert ana_dir(data_dir).is_dir()


@pytest.mark.parametrize("payload", [{}, {"lessonNumber": "2"}, {"lessonNumber": 0}, {"lessonNumber": True}])
def test_moving_needs_a_lesson_number(admin_client, admin_api, csrf_of, entregas, payload):
    upload_id = admin_client.get(f"{admin_api}/uploads").get_json()[0]["id"]

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json=payload,
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422


def test_moving_an_unknown_entrega_is_404(admin_client, admin_api, csrf_of):
    response = admin_client.patch(
        f"{admin_api}/uploads/999",
        json={"lessonNumber": 1},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 404


def test_the_lesson_zip_groups_the_files_by_aluno(admin_client, admin_api, entregas):
    response = admin_client.get(f"{admin_api}/uploads/lesson/1.zip")

    assert response.status_code == 200
    assert response.mimetype == "application/zip"
    assert "attachment" in response.headers["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        assert sorted(archive.namelist()) == [
            f"Ana Teste/{STAMP} - desenho.png",
            f"Ana Teste/{STAMP} - jogo.sb3",
            f"Bruno Teste/{STAMP} - jogo.sb3",
        ]
        assert archive.read(f"Ana Teste/{STAMP} - jogo.sb3") == b"jogo da ana"
        assert archive.read(f"Bruno Teste/{STAMP} - jogo.sb3") == b"jogo do bruno"


def test_the_zip_is_not_left_behind_in_the_data_dir(admin_client, admin_api, entregas, data_dir):
    response = admin_client.get(f"{admin_api}/uploads/lesson/1.zip")

    assert response.data  # the zip is streamed from a name that is already gone
    assert list(data_dir.glob("entregas-*.zip")) == []


def test_the_zip_of_a_lesson_without_files_is_empty(admin_client, admin_api, entregas):
    response = admin_client.get(f"{admin_api}/uploads/lesson/2.zip")

    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        assert archive.namelist() == []


def test_the_zip_of_a_lesson_that_is_not_registered_is_404(admin_client, admin_api, entregas):
    assert admin_client.get(f"{admin_api}/uploads/lesson/9.zip").status_code == 404


def test_the_zip_segments_of_odd_names_are_single_safe_folders(
    app, admin_client, admin_api, add_student, add_lesson, as_student, upload_file, tmp_path
):
    # The teacher extracts this zip on their own machine: a student named `..`
    # or `Ana/Bruno` must not steer where the files land.
    add_lesson(1, "2026-09-01")
    names = ["..", "../escape", "Ana/Bruno", "a\\b"]
    for name in names:
        racer = app.test_client()
        token = as_student(racer, add_student(name))
        assert upload_file(racer, token, "jogo.sb3", name.encode()).status_code == 201

    response = admin_client.get(f"{admin_api}/uploads/lesson/1.zip")

    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        entries = archive.namelist()
    assert len(entries) == len(names)
    segments = set()
    for entry in entries:
        segment = entry.split("/", 1)[0]
        assert "/" not in segment and "\\" not in segment
        assert segment not in {".", ".."} and not segment.startswith(".")
        segments.add(segment)
    assert segments == {"aluno", "escape", "Ana Bruno", "a b"}
    assert {entry.split("/", 1)[1] for entry in entries} == {f"{STAMP} - jogo.sb3"}
    extracted = tmp_path / "extraido"
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        archive.extractall(extracted)
    assert sorted(path.name for path in extracted.iterdir()) == ["Ana Bruno", "a b", "aluno", "escape"]
    assert not (tmp_path / "escape").exists()


def test_two_students_whose_names_sanitize_alike_get_their_own_folder(
    app, admin_client, admin_api, add_student, add_lesson, as_student, upload_file
):
    add_lesson(1, "2026-09-01")
    first = add_student("Ana/Bruno")
    second = add_student("Ana Bruno")
    for student, content in ((first, b"um"), (second, b"dois")):
        racer = app.test_client()
        token = as_student(racer, student)
        assert upload_file(racer, token, "jogo.sb3", content).status_code == 201

    response = admin_client.get(f"{admin_api}/uploads/lesson/1.zip")

    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        entries = archive.namelist()
        contents = sorted(archive.read(entry) for entry in entries)
    segments = {entry.split("/", 1)[0] for entry in entries}
    assert len(entries) == 2
    assert len(segments) == 2
    assert contents == [b"dois", b"um"]
    assert segments <= {"Ana Bruno", f"Ana Bruno ({first})"}


def test_names_the_teachers_machine_folds_together_get_their_own_folder(
    app, admin_client, admin_api, add_student, add_lesson, as_student, upload_file
):
    # Windows drops a trailing dot and macOS normalizes to NFD: `Ana`/`Ana.` and
    # the two spellings of `João` are one folder on extraction, so the zip has to
    # tell them apart the way it already does for a case-only clash.
    add_lesson(1, "2026-09-01")
    names = ["Ana", "Ana.", "João", "Joa\u0303o"]
    for index, name in enumerate(names):
        racer = app.test_client()
        token = as_student(racer, add_student(name))
        assert upload_file(racer, token, "jogo.sb3", bytes([index])).status_code == 201

    response = admin_client.get(f"{admin_api}/uploads/lesson/1.zip")

    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        entries = archive.namelist()
        contents = sorted(archive.read(entry) for entry in entries)
    segments = [entry.split("/", 1)[0] for entry in entries]

    def as_the_extracting_machine_sees(segment):
        # What the folder becomes once it lands: the trailing dot and space go
        # and the accents are one character either way.
        return unicodedata.normalize("NFD", segment.rstrip(". ")).casefold()

    assert len(entries) == len(names)
    assert len({as_the_extracting_machine_sees(segment) for segment in segments}) == len(names)
    # Nobody's file landed on anybody else's: every payload is its own entry.
    assert contents == [bytes([index]) for index in range(len(names))]


def test_two_entregas_of_one_name_across_a_rename_keep_their_own_entry(
    app, admin_client, admin_api, add_student, add_lesson, as_student, upload_file, db, tmp_path
):
    # The folder an entrega lands in is named after the aluno, so the same file
    # handed in before and after a rename goes to two folders -- with the same
    # name and the same minute in both. The zip cannot have two entries by that
    # name: extraction would keep only the last one.
    add_lesson(1, "2026-09-01")
    ana = add_student("Ana Teste")
    client = app.test_client()
    token = as_student(client, ana)
    assert upload_file(client, token, "jogo.sb3", b"antes do nome novo").status_code == 201
    db.execute("UPDATE students SET name = ? WHERE id = ?", ("Ana Silva", ana))
    db.commit()
    assert upload_file(client, token, "jogo.sb3", b"depois do nome novo").status_code == 201

    response = admin_client.get(f"{admin_api}/uploads/lesson/1.zip")

    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        entries = archive.namelist()
        contents = sorted(archive.read(entry) for entry in entries)
    assert len(entries) == 2
    assert len(set(entries)) == 2
    assert {entry.split("/", 1)[0] for entry in entries} == {"Ana Silva"}
    assert contents == [b"antes do nome novo", b"depois do nome novo"]

    extracted = tmp_path / "extraido"
    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        archive.extractall(extracted)
    files = [path for path in extracted.rglob("*") if path.is_file()]
    assert sorted(path.read_bytes() for path in files) == [
        b"antes do nome novo",
        b"depois do nome novo",
    ]


def test_moving_through_a_symlinked_aula_moves_nothing_and_changes_nothing(
    app, admin_client, admin_api, csrf_of, db, data_dir, entregas, tmp_path
):
    upload_id = admin_client.get(
        f"{admin_api}/uploads?student={entregas['ana']}&lesson=1"
    ).get_json()[0]["id"]
    row = db.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    before = data_dir / row["stored_path"]
    outside = tmp_path / "fora"
    outside.mkdir()
    (data_dir / "aulas" / "aula-02").symlink_to(outside, target_is_directory=True)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json={"lessonNumber": 2},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 500
    assert response.mimetype == "application/json"
    assert list(outside.rglob("*")) == []
    assert before.is_file()
    after = db.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    assert after["lesson_number"] == row["lesson_number"]
    assert after["stored_path"] == row["stored_path"]


def test_a_failed_move_puts_the_file_back_and_drops_the_folder_it_left(
    app, admin_client, admin_api, csrf_of, db, data_dir, entregas
):
    upload_id = admin_client.get(
        f"{admin_api}/uploads?student={entregas['ana']}&lesson=1"
    ).get_json()[0]["id"]
    row = db.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    before = data_dir / row["stored_path"]
    content = before.read_bytes()
    db.execute(
        "CREATE TRIGGER recusa BEFORE UPDATE ON uploads BEGIN SELECT RAISE(ABORT, 'nao'); END"
    )
    db.commit()
    app.config["PROPAGATE_EXCEPTIONS"] = False

    response = admin_client.patch(
        f"{admin_api}/uploads/{upload_id}",
        json={"lessonNumber": 2},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 500
    assert before.read_bytes() == content
    after = db.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    assert after["lesson_number"] == row["lesson_number"]
    assert after["stored_path"] == row["stored_path"]
    # The aula the move created is gone again: the row never mentions it.
    assert not ana_dir(data_dir, 2).exists()
