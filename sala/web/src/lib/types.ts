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

// ---------------------------------------------------------------------------
// Jogos
// ---------------------------------------------------------------------------

/**
 * The console a game belongs to.
 *
 * The values are the catalogue's own (`jogos.yml`), and they are what
 * lib/games.ts maps to the pt-BR name a kid reads -- "Fliperama" is not a
 * translation of `arcade` the server should have to make.
 */
export type GameSystem = "atari2600" | "arcade" | "nes" | "snes" | "genesis";

/** `emulated` runs in EmulatorJS; `builtin` is a page of our own. */
export type GameType = "emulated" | "builtin";

/** Which kind of jogo is on offer right now. */
export type GameMode = "single" | "free";

/**
 * One control of a game, as the catalogue states it.
 *
 * `keys` are the real keyboard keys in effect (the EmulatorJS default keymap
 * for the core), and `action` is what they do in pt-BR. Both come from the
 * server so the key chips on the screen cannot drift from what the emulator
 * actually listens for.
 */
export interface GameControl {
	keys: string[];
	action: string;
}

/**
 * One game as the kid's screens carry it.
 *
 * `about` is one pt-BR line and `controls` is short by construction: this is
 * what a screen prints, not the catalogue's whole entry.
 *
 * `system` is the console, and it is `null` for a game of our own: a builtin
 * entry never ran on a console, so a screen that printed a console badge for it
 * would be inventing one. `type` is what says which kind of game this is.
 */
export interface Game {
	id: string;
	title: string;
	type: GameType;
	system: GameSystem | null;
	year: number;
	maker: string;
	about: string;
	controls: GameControl[];
}

/**
 * `GET /api/games`: the mode and the games that are visible in it.
 *
 * Only visible games are here, which is why the screen never filters: in single
 * mode the list is the active game or nothing at all, and in free mode it is
 * every playable game.
 */
export interface GamesView {
	mode: GameMode;
	games: Game[];
}

/**
 * Why a catalogue entry cannot be played, or `null` when it can.
 *
 * The two reasons are the two things that have to be on the laptop: the ROM
 * file and the emulator core. They are separate because the fix is different --
 * `just sala-emulador` for one, the ROM drive for the other.
 */
export type GameMissing = "rom" | "core";

/**
 * One catalogue entry as the teacher's screen carries it.
 *
 * `core` and `system` are absent for a builtin entry: there is no emulator core
 * behind our own Pong and no console it ran on, and the table has to be able to
 * say that rather than print an empty cell.
 */
export interface AdminGame {
	id: string;
	title: string;
	type: GameType;
	system: GameSystem | null;
	core: string | null;
	year: number;
	maker: string;
	playable: boolean;
	missing: GameMissing | null;
}

/**
 * `GET <admin>/api/games`: the whole catalogue plus the two settings.
 *
 * `activeGame` is the id stored in the settings, whether or not it is playable:
 * the teacher has to be able to see that the game they picked has lost its ROM.
 */
export interface AdminGames {
	activeGame: string | null;
	freeMode: boolean;
	games: AdminGame[];
}

// ---------------------------------------------------------------------------
// Placar
// ---------------------------------------------------------------------------

/**
 * How a pontuação reached the placar.
 *
 * `auto` is the game itself reporting it (our Pong, and later the emulator's
 * memory), and it is shown at once; `self` is the kid typing it in, and it waits
 * for the teacher.
 */
export type ScoreMethod = "auto" | "self";

/** One row of the placar's top list. */
export interface ScoreRank {
	/**
	 * The position, from the server, so that a tie is one position and not two.
	 * Two kids on 40 pontos are both in first place, and the next one is third.
	 */
	rank: number;
	student: Student;
	score: number;
}

/** The best approved pontuação of all time, and who made it. */
export interface ScoreRecord {
	score: number;
	student: Student;
	lessonNumber: number;
}

/** A pontuação the session's student typed in and the teacher has not answered. */
export interface PendingScore {
	id: number;
	score: number;
	createdAt: string;
}

/**
 * `GET /api/games/<id>/scoreboard`.
 *
 * `top` is the AULA ATUAL's ten best approved pontuações (one per aluno),
 * `record` is the all-time best, and `myPending` is the session student's own
 * self-reports of this aula that nobody has confirmed yet.
 */
export interface Scoreboard {
	record: ScoreRecord | null;
	top: ScoreRank[];
	myPending: PendingScore[];
}

/** `POST /api/scores`: the pontuação that was filed, and whether it is shown. */
export interface CreatedScore {
	id: number;
	score: number;
	approved: boolean;
}

/** The two states a score can be in, as the teacher filters by them. */
export type ScoreStatus = "pending" | "approved";

/** One pontuação as the teacher's list carries it. */
export interface AdminScore {
	id: number;
	game: { id: string; title: string };
	student: Student;
	lessonNumber: number;
	score: number;
	method: ScoreMethod;
	approved: boolean;
	createdAt: string;
}
