// The wire shapes of the API.
//
// Hand-written rather than generated, and deliberately narrow: this file is the
// list of things the SPA is allowed to depend on. A field that is not here is a
// field the API does not promise.

/** A student as the public API names them. */
export interface Student {
	id: number;
	name: string;
}

/**
 * A student as the teacher's list carries them.
 *
 * `active` is the difference: the public list is active students only, and the
 * teacher's screen has to tell a deactivated student from an active one in
 * order to offer the reactivate action.
 */
export interface AdminStudent extends Student {
	active: boolean;
}

/** One numbered class session. `date` is an ISO `YYYY-MM-DD` day. */
export interface Lesson {
	number: number;
	date: string;
}

/** The current lesson, as the public API reports it. */
export interface CurrentLesson {
	number: number;
	date: string;
}

/** The current lesson as the admin API reports it, with the override flag. */
export interface AdminCurrentLesson extends CurrentLesson {
	override: boolean;
}

/** `GET /api/session`. */
export interface PublicSession {
	csrf: string;
	student: Student | null;
	currentLesson: CurrentLesson | null;
}

/** `GET <admin>/api/session`. It is served without authentication. */
export interface AdminSession {
	admin: boolean;
	csrf: string;
	currentLesson: AdminCurrentLesson | null;
}

/** `GET|PUT <admin>/api/override`. `null` means "automatic, by date". */
export interface OverrideView {
	lesson: number | null;
}

/** One row of the attendance sheet. */
export interface AttendanceStudent {
	id: number;
	name: string;
	present: boolean;
}

/**
 * `GET <admin>/api/attendance/<n>`.
 *
 * The list is the active students plus any deactivated one already marked
 * present, so a student who left mid-course keeps their row rather than losing
 * the record of the classes they attended. `lesson` is the whole lesson and not
 * its number, so a screen can print the date it is marking without a second
 * lookup.
 */
export interface Attendance {
	lesson: Lesson;
	students: AttendanceStudent[];
}

/**
 * One entrega, as the kid's own list and the upload response carry it.
 *
 * `name` is the file's own name, as a basename and nothing else: the server
 * strips any path, control characters and leading dots before it stores it,
 * because the same string becomes the download's file name. For the names a
 * browser hands over it is what the kid typed; `size` is in bytes, which is what
 * `formatSize` turns into the "1,2 MB" they read.
 */
export interface Upload {
	id: number;
	lessonNumber: number;
	name: string;
	size: number;
	createdAt: string;
}

/**
 * One entrega as the teacher's list carries it.
 *
 * The student is embedded rather than referenced: the table prints a name and
 * has no second request to make for it, and the row has to keep saying whose
 * file it is even when the class list is filtered.
 */
export interface AdminUpload extends Upload {
	student: Student;
}

/** The two kinds of folha a lesson can have. */
export type SheetKind = "ficha" | "desafios";

/** One PDF of one aula. `url` is served by the lab server, never built here. */
export interface Sheet {
	kind: SheetKind;
	title: string;
	url: string;
}

/**
 * `GET /api/sheets`: one entry per aula that HAS folhas, ascending.
 *
 * A lesson with neither PDF is absent from the list rather than present with an
 * empty array, so a screen does not have to know that an empty group is a thing
 * that exists.
 */
export interface LessonSheets {
	lessonNumber: number;
	sheets: Sheet[];
}
