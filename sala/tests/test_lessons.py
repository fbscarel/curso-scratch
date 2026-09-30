"""current_lesson: the "Aula atual" rule (date with a manual override)."""

from __future__ import annotations

from datetime import date

from app.db import SETTING_LESSON_OVERRIDE, set_setting
from app.lessons import current_lesson, get_lesson, lesson_override

TODAY = date(2026, 9, 29)


def test_no_lesson_registered(db):
    assert current_lesson(db, TODAY) is None
    assert lesson_override(db) is None


def test_latest_date_not_after_today_wins(db, add_lesson):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-15")
    add_lesson(3, "2026-10-02")

    assert current_lesson(db, TODAY)["number"] == 2
    assert current_lesson(db, date(2026, 9, 15))["number"] == 2
    assert current_lesson(db, date(2026, 10, 2))["number"] == 3


def test_future_lessons_are_ignored(db, add_lesson):
    add_lesson(1, "2026-09-29")
    add_lesson(2, "2026-09-30")
    assert current_lesson(db, TODAY)["number"] == 1


def test_lessons_all_in_the_future_leave_no_current_lesson(db, add_lesson):
    add_lesson(1, "2026-10-01")
    assert current_lesson(db, TODAY) is None


def test_ties_on_the_date_use_the_greatest_number(db, add_lesson):
    add_lesson(4, "2026-09-29")
    add_lesson(5, "2026-09-29")
    assert current_lesson(db, TODAY)["number"] == 5


def test_override_wins_over_the_date(db, add_lesson, set_override):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-15")
    set_override(1)

    assert lesson_override(db) == 1
    assert current_lesson(db, TODAY)["number"] == 1


def test_override_pointing_at_a_deleted_lesson_is_ignored(db, add_lesson, set_override):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-15")
    set_override(2)
    db.execute("DELETE FROM lessons WHERE number = 2")
    db.commit()

    assert lesson_override(db) is None
    assert current_lesson(db, TODAY)["number"] == 1


def test_override_pointing_at_a_lesson_that_never_existed_is_ignored(db, add_lesson, set_override):
    add_lesson(1, "2026-09-01")
    set_override(7)
    assert lesson_override(db) is None
    assert current_lesson(db, TODAY)["number"] == 1


def test_override_with_a_garbage_value_is_ignored(db, add_lesson):
    add_lesson(1, "2026-09-01")
    set_setting(db, SETTING_LESSON_OVERRIDE, "abc")
    db.commit()
    assert lesson_override(db) is None
    assert current_lesson(db, TODAY)["number"] == 1


def test_override_wins_even_before_the_lesson_date(db, add_lesson, set_override):
    add_lesson(3, "2026-10-02")
    set_override(3)
    assert current_lesson(db, TODAY)["number"] == 3


def test_current_lesson_accepts_an_iso_string(db, add_lesson):
    add_lesson(1, "2026-09-15")
    assert current_lesson(db, "2026-09-29")["number"] == 1


def test_an_unknown_lesson_is_none(db):
    assert get_lesson(db, 99) is None
