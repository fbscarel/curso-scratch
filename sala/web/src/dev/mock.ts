/**
 * A stand-in for the lab server, so the SPA can be run and looked at without
 * one.
 *
 * DEVELOPMENT ONLY. main.tsx imports this behind `import.meta.env.DEV &&
 * VITE_MOCK === "1"`, which a production build folds to `false`, so neither the
 * module nor this string reaches dist. MOCK_MARKER exists to be grepped for:
 * finding it in the built output would mean that guard stopped working.
 *
 * It answers the same HTTP surface the server does, in the same shapes,
 * including the CSRF header and the pt-BR error bodies -- a mock that is more
 * forgiving than the server is worse than no mock, because a screen developed
 * against it breaks on the day the real server arrives.
 *
 * Four deliberate differences from the server:
 *
 *  - The admin session starts SIGNED IN, so an admin screen can be opened
 *    directly. "Sair" and a wrong password still exercise the login card.
 *  - The admin path is fixed at /professor-teste rather than read from
 *    config.toml, and it is injected into <head> the way the server injects it.
 *  - A DOWNLOAD is not answered. Downloads are links the browser follows rather
 *    than requests the SPA makes, so the mock cannot intercept them; in mock
 *    mode they land on Vite's fallback. Everything the SPA itself requests --
 *    including the multipart upload, through XMLHttpRequest -- is here.
 *  - There is no cover IMAGE to serve either, and an <img> is not a request the
 *    mock sees at all: the SPA draws a stand-in with the game's name on it
 *    (lib/games.ts), and the flag below says which games have one.
 */

export const MOCK_MARKER = "__sala_dev_mock__";

const ADMIN_BASE = "/professor-teste";
const CSRF = "csrf-de-mentira";
const WRONG_PASSWORD = "errado";

const MESSAGE_CSRF =
	"Requisição inválida: token do formulário faltando ou errado.";
const MESSAGE_NO_SESSION = "Entre com a senha do professor para continuar.";
const MESSAGE_OFFLINE = `Rota desconhecida do mock (${MOCK_MARKER}).`;

interface MockStudent {
	id: number;
	name: string;
	active: boolean;
}

interface MockLesson {
	number: number;
	date: string;
}

interface MockUpload {
	id: number;
	lessonNumber: number;
	studentId: number;
	name: string;
	size: number;
	createdAt: string;
}

/** One pontuação, as the scores table holds it. */
interface MockScore {
	id: number;
	gameId: string;
	lessonNumber: number;
	studentId: number;
	score: number;
	method: "auto" | "self";
	approved: boolean;
	createdAt: string;
}

/** One catalogue entry, as `jogos.yml` states it plus what is on this laptop. */
interface MockGame {
	id: string;
	title: string;
	type: "emulated" | "builtin";
	/** `null` for a game of our own: it never ran on a console. */
	system: "atari2600" | "arcade" | "nes" | "snes" | "genesis" | null;
	/** `null` for a game of our own: there is no emulator behind it. */
	core: string | null;
	year: number;
	maker: string;
	about: string;
	controls: { keys: string[]; action: string }[];
	/** Whether the game reports its own pontuação (our own, or a score block). */
	autoScore: boolean;
	/** Whether the laptop has a cover image for this game (`just sala-capas`). */
	cover: boolean;
	playable: boolean;
	missing: "rom" | "core" | null;
}

/**
 * The catalogue the screens are looked at with.
 *
 * It mirrors the real start set closely enough to exercise every part of the
 * screens: all five consoles (so every pt-BR badge is on the grid), games that
 * boot, and two that do not -- one missing its ROM and one missing its core --
 * so the teacher's table has all three status badges. The controls are the
 * keys the EmulatorJS default keymap really uses, which is what the real
 * catalogue states too.
 */
const CATALOGUE: MockGame[] = [
	{
		id: "enduro",
		title: "Enduro",
		type: "emulated",
		system: "atari2600",
		core: "stella2014",
		year: 1983,
		maker: "Activision",
		about: "Corrida de resistência: ultrapasse os carros dia e noite.",
		controls: [
			{ keys: ["←", "→"], action: "virar" },
			{ keys: ["↑"], action: "acelerar" },
			{ keys: ["Enter"], action: "reiniciar" },
		],
		autoScore: true,
		playable: true,
		missing: null,
		cover: true,
	},
	{
		id: "space-invaders",
		title: "Space Invaders",
		type: "emulated",
		system: "atari2600",
		core: "stella2014",
		year: 1980,
		maker: "Atari",
		about: "Defenda a Terra dos alienígenas que descem em fileiras.",
		controls: [
			{ keys: ["←", "→"], action: "andar" },
			{ keys: ["x"], action: "atirar" },
			{ keys: ["v"], action: "select" },
			{ keys: ["Enter"], action: "reiniciar" },
		],
		autoScore: false,
		playable: true,
		missing: null,
		cover: true,
	},
	{
		id: "pitfall",
		title: "Pitfall!",
		type: "emulated",
		system: "atari2600",
		core: "stella2014",
		year: 1982,
		maker: "Activision",
		about: "Atravesse a selva pulando troncos, buracos e jacarés.",
		controls: [
			{ keys: ["←", "→"], action: "andar" },
			{ keys: ["x"], action: "pular" },
		],
		autoScore: false,
		playable: true,
		missing: null,
		cover: false,
	},
	{
		id: "frogger",
		title: "Frogger",
		type: "emulated",
		system: "arcade",
		core: "mame2003_plus",
		year: 1981,
		maker: "Konami",
		about: "Atravesse a rua e o rio para levar o sapo até a casa.",
		controls: [
			{ keys: ["↑", "↓", "←", "→"], action: "pular" },
			{ keys: ["v"], action: "ficha (moeda)" },
			{ keys: ["Enter"], action: "começar" },
		],
		autoScore: true,
		playable: true,
		missing: null,
		cover: true,
	},
	{
		id: "galaga",
		title: "Galaga",
		type: "emulated",
		system: "arcade",
		core: "mame2003_plus",
		year: 1981,
		maker: "Namco",
		about: "Pilote a nave e destrua as ondas de alienígenas.",
		controls: [
			{ keys: ["←", "→"], action: "mover" },
			{ keys: ["x"], action: "atirar" },
			{ keys: ["v"], action: "ficha (moeda)" },
			{ keys: ["Enter"], action: "começar" },
		],
		autoScore: false,
		playable: true,
		missing: null,
		cover: true,
	},
	{
		id: "super-mario-bros",
		title: "Super Mario Bros.",
		type: "emulated",
		system: "nes",
		core: "fceumm",
		year: 1985,
		maker: "Nintendo",
		about: "Corra, pule e chegue ao castelo para salvar a princesa.",
		controls: [
			{ keys: ["←", "→"], action: "andar" },
			{ keys: ["x"], action: "pular" },
			{ keys: ["z"], action: "correr" },
			{ keys: ["Enter"], action: "começar" },
		],
		autoScore: false,
		playable: true,
		missing: null,
		cover: true,
	},
	{
		id: "super-mario-world",
		title: "Super Mario World",
		type: "emulated",
		system: "snes",
		core: "snes9x",
		year: 1990,
		maker: "Nintendo",
		about: "Explore a Ilha dos Dinossauros com o Yoshi.",
		controls: [
			{ keys: ["←", "→"], action: "andar" },
			{ keys: ["x"], action: "pular" },
			{ keys: ["Enter"], action: "começar" },
		],
		autoScore: false,
		playable: false,
		missing: "rom",
		cover: true,
	},
	{
		id: "sonic-the-hedgehog",
		title: "Sonic the Hedgehog",
		type: "emulated",
		system: "genesis",
		core: "genesis_plus_gx",
		year: 1991,
		maker: "Sega",
		about: "Corra rápido, colete argolas e derrote o Dr. Robotnik.",
		controls: [
			{ keys: ["←", "→"], action: "correr" },
			{ keys: ["x"], action: "pular" },
			{ keys: ["Enter"], action: "começar" },
		],
		autoScore: false,
		playable: false,
		missing: "core",
		cover: false,
	},
	{
		// The one game of our own: no console, no emulator core and no ROM, so it
		// is playable on any laptop. It is what the builtin branch of the game
		// screen -- and the "Jogo da sala" badge -- is looked at with.
		id: "pong",
		title: "Pong",
		type: "builtin",
		system: null,
		core: null,
		year: 1972,
		maker: "Atari",
		about:
			"Bate-bola do começo dos videogames: rebata a bola com a raquete e não deixe passar.",
		controls: [
			{ keys: ["↑", "↓", "W", "S"], action: "mover a raquete" },
			{ keys: ["P"], action: "pausar" },
		],
		autoScore: true,
		playable: true,
		missing: null,
		cover: true,
	},
];

/** The game the mock starts on, and the mode it starts in. */
const DEFAULT_ACTIVE_GAME = "enduro";

/** The fake class: the invented names every test and fixture uses. */
const NAMES = [
	"Ana Teste",
	"Bruno Teste",
	"Carla Teste",
	"Davi Teste",
	"Elisa Teste",
	"Felipe Teste",
	"Gabi Teste",
	"Hugo Teste",
];

/** Carla left the course, so the class list has both states to look at. */
const INACTIVE_NAMES = ["Carla Teste"];

/** The extensions the server takes, and the size it refuses above. */
const ALLOWED_EXTENSIONS = [
	".sb3",
	".sprite3",
	".png",
	".jpg",
	".jpeg",
	".wav",
	".mp3",
];
const MAX_UPLOAD = 20 * 1024 * 1024;

let students: MockStudent[] = [];
let lessons: MockLesson[] = [];
let attendance = new Map<number, Set<number>>();
let uploads: MockUpload[] = [];
let scores: MockScore[] = [];
let override: number | null = null;
let signedIn = true;
let identity: number | null = null;
let activeGame: string | null = DEFAULT_ACTIVE_GAME;
/**
 * Free mode is the mock's starting mode, so `/jogo` is the grid the screen is
 * looked at with. "Um jogo" and "Desligados" are one click away on the
 * teacher's screen, and the off state is stored here exactly as the server
 * stores it: no active game and no free mode.
 */
let freeMode = true;

/** isoDay is `offset` days from today, as the ISO day the API stores. */
function isoDay(offset: number): string {
	const date = new Date();
	date.setDate(date.getDate() + offset);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * resetData rebuilds the fixture, with four lessons ending TODAY.
 *
 * Relative dates rather than fixed ones, because the screens this exists to
 * look at are about which lesson is current: hardcoded dates would make the
 * home screen say "Nenhuma aula hoje" a week after this file was written.
 */
function resetData(): void {
	students = NAMES.map((name, index) => ({
		id: index + 1,
		name,
		active: !INACTIVE_NAMES.includes(name),
	}));
	lessons = [0, 1, 2, 3].map((index) => ({
		number: index + 1,
		date: isoDay((index - 3) * 7),
	}));
	attendance = new Map();
	const today = lessons.at(-1)?.number;
	// Carla is deactivated and is NOT marked present, so the sheet is the
	// active class exactly.
	if (today !== undefined) attendance.set(today, new Set([1, 2, 4, 5]));
	uploads = seedUploads();
	scores = seedScores();
	override = null;
	signedIn = true;
	identity = null;
	activeGame = DEFAULT_ACTIVE_GAME;
	freeMode = true;
}

/**
 * seedUploads is the pile of entregas the screens are looked at with.
 *
 * Sizes and names are chosen to exercise the screens: 1258291 is the "1,2 MB"
 * the size formatter is written for, 999 the "999 B", and the extensions cover
 * the four icons of "Meus arquivos". The aula atual has three of them so the
 * teacher's table has rows on the filter it opens with.
 */
function seedUploads(): MockUpload[] {
	const current = lessons.at(-1)?.number ?? 1;
	const previous = lessons.at(-2)?.number ?? current;
	const first = lessons[0]?.number ?? current;
	const at = (day: string, hour: number, minute: number): string =>
		`${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

	return [
		{
			id: 1,
			lessonNumber: current,
			studentId: 1,
			name: "labirinto.sb3",
			size: 1258291,
			createdAt: at(isoDay(0), 14, 32),
		},
		{
			id: 2,
			lessonNumber: current,
			studentId: 2,
			name: "gato.png",
			size: 84300,
			createdAt: at(isoDay(0), 14, 35),
		},
		{
			id: 3,
			lessonNumber: current,
			studentId: 4,
			name: "musica.mp3",
			size: 2400000,
			createdAt: at(isoDay(0), 14, 41),
		},
		{
			id: 4,
			lessonNumber: previous,
			studentId: 1,
			name: "foguete.sprite3",
			size: 40000,
			createdAt: at(isoDay(-7), 15, 10),
		},
		{
			id: 5,
			lessonNumber: first,
			studentId: 1,
			name: "primeiro.sb3",
			size: 999,
			createdAt: at(isoDay(-21), 15, 2),
		},
	];
}

/**
 * seedScores is the placar the screens are looked at with.
 *
 * Every rule the placar has is visible in it: a shared first place (Bruno and
 * Davi on the same pontuação in the aula atual), a record from an earlier aula
 * that nobody in this aula has beaten, a pontuação the game counted next to one
 * a kid typed in, and three self-reports still waiting for the teacher -- one of
 * them Ana's, so picking her name fills the "Esperando o professor" list.
 */
function seedScores(): MockScore[] {
	const current = lessons.at(-1)?.number ?? 1;
	const previous = lessons.at(-2)?.number ?? current;
	const at = (day: string, hour: number, minute: number): string =>
		`${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

	const seeded: Omit<MockScore, "id">[] = [
		// Enduro, aula atual: the placar the emulated game's page shows.
		{
			gameId: "enduro",
			lessonNumber: current,
			studentId: 1,
			score: 300,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 10),
		},
		{
			gameId: "enduro",
			lessonNumber: current,
			studentId: 2,
			score: 250,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 12),
		},
		{
			gameId: "enduro",
			lessonNumber: current,
			studentId: 4,
			score: 250,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 14),
		},
		{
			gameId: "enduro",
			lessonNumber: current,
			studentId: 5,
			score: 120,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 16),
		},
		{
			gameId: "enduro",
			lessonNumber: current,
			studentId: 8,
			score: 90,
			method: "self",
			approved: true,
			createdAt: at(isoDay(0), 14, 18),
		},
		// The all-time record, from the aula before this one.
		{
			gameId: "enduro",
			lessonNumber: previous,
			studentId: 1,
			score: 420,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(-7), 15, 5),
		},
		// Pong, aula atual: a tie at the top and the same kids in the record.
		{
			gameId: "pong",
			lessonNumber: current,
			studentId: 2,
			score: 42,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 20),
		},
		{
			gameId: "pong",
			lessonNumber: current,
			studentId: 4,
			score: 42,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 22),
		},
		{
			gameId: "pong",
			lessonNumber: current,
			studentId: 1,
			score: 30,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 24),
		},
		{
			gameId: "pong",
			lessonNumber: current,
			studentId: 5,
			score: 12,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(0), 14, 26),
		},
		{
			gameId: "pong",
			lessonNumber: previous,
			studentId: 1,
			score: 55,
			method: "auto",
			approved: true,
			createdAt: at(isoDay(-7), 15, 20),
		},
		// Waiting for the teacher.
		{
			gameId: "pong",
			lessonNumber: current,
			studentId: 1,
			score: 18,
			method: "self",
			approved: false,
			createdAt: at(isoDay(0), 14, 40),
		},
		{
			gameId: "pong",
			lessonNumber: current,
			studentId: 5,
			score: 25,
			method: "self",
			approved: false,
			createdAt: at(isoDay(0), 14, 42),
		},
		{
			gameId: "enduro",
			lessonNumber: current,
			studentId: 2,
			score: 300,
			method: "self",
			approved: false,
			createdAt: at(isoDay(0), 14, 44),
		},
	];
	return seeded.map((score, index) => ({ id: index + 1, ...score }));
}

function activeStudents(): MockStudent[] {
	return students
		.filter((student) => student.active)
		.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function currentLesson(): MockLesson | null {
	if (override !== null) {
		const forced = lessons.find((lesson) => lesson.number === override);
		if (forced) return forced;
	}
	const today = isoDay(0);
	const started = lessons.filter((lesson) => lesson.date <= today);
	return (
		started.reduce<MockLesson | null>(
			(best, lesson) =>
				best === null ||
				lesson.date > best.date ||
				(lesson.date === best.date && lesson.number > best.number)
					? lesson
					: best,
			null,
		) ?? null
	);
}

function field(body: unknown, key: string): unknown {
	if (body === null || typeof body !== "object") return undefined;
	return (body as Record<string, unknown>)[key];
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function empty(): Response {
	return new Response(null, { status: 204 });
}

function failure(status: number, message: string): Response {
	return json(status, { error: message });
}

function publicSession(): unknown {
	const student = students.find((s) => s.id === identity && s.active);
	const lesson = currentLesson();
	return {
		csrf: CSRF,
		student: student ? { id: student.id, name: student.name } : null,
		currentLesson: lesson ? { number: lesson.number, date: lesson.date } : null,
	};
}

function adminSession(): unknown {
	const lesson = currentLesson();
	return {
		admin: signedIn,
		csrf: CSRF,
		currentLesson: lesson
			? {
					number: lesson.number,
					date: lesson.date,
					override: override !== null,
				}
			: null,
	};
}

function attendanceSheet(number: number): unknown {
	const marks = attendance.get(number) ?? new Set<number>();
	const lesson = lessons.find((l) => l.number === number);
	return {
		lesson: lesson ? { number: lesson.number, date: lesson.date } : null,
		students: students
			.filter((student) => student.active || marks.has(student.id))
			.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
			.map((student) => ({
				id: student.id,
				name: student.name,
				present: marks.has(student.id),
			})),
	};
}

interface MockUploadRow {
	id: number;
	lessonNumber: number;
	name: string;
	size: number;
	createdAt: string;
}

function uploadRow(upload: MockUpload): MockUploadRow {
	return {
		id: upload.id,
		lessonNumber: upload.lessonNumber,
		name: upload.name,
		size: upload.size,
		createdAt: upload.createdAt,
	};
}

function adminUploadRow(upload: MockUpload): MockUploadRow & {
	student: { id: number; name: string };
} {
	const student = students.find((item) => item.id === upload.studentId);
	return {
		...uploadRow(upload),
		student: student
			? { id: student.id, name: student.name }
			: { id: upload.studentId, name: "Aluno removido" },
	};
}

/** newestFirst is the server's order: newest first, id breaking the tie. */
function newestFirst(a: MockUpload, b: MockUpload): number {
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
	return b.id - a.id;
}

/** nowStamp is `createdAt` in the server's format, `YYYY-MM-DD HH:MM:SS`. */
function nowStamp(): string {
	const now = new Date();
	const two = (value: number): string => String(value).padStart(2, "0");
	return `${isoDay(0)} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
}

/**
 * createUpload is the multipart POST, and the one handler that reads a body
 * that is not JSON.
 *
 * The refusals mirror the server's: no identity and no aula atual are 409, an
 * extension outside the list is 422, an empty file is 422, and anything over the
 * limit is the 413 the upload screen shows per file.
 */
function createUpload(body: unknown): Response {
	const student = students.find((item) => item.id === identity && item.active);
	if (!student) return failure(409, "Escolha seu nome primeiro.");
	const lesson = currentLesson();
	if (!lesson) return failure(409, "Nenhuma aula começou ainda.");
	if (!(body instanceof FormData)) {
		return failure(422, "Envie o arquivo no campo file.");
	}
	const file = body.get("file");
	if (!(file instanceof File))
		return failure(422, "Nenhum arquivo foi enviado.");
	if (file.size === 0) return failure(422, "O arquivo está vazio.");
	if (file.size > MAX_UPLOAD) {
		return failure(413, "Arquivo grande demais: o limite é 20 MB por arquivo.");
	}
	const dot = file.name.lastIndexOf(".");
	const extension = (dot < 0 ? "" : file.name.slice(dot)).toLowerCase();
	if (!ALLOWED_EXTENSIONS.includes(extension)) {
		return failure(
			422,
			`Tipo de arquivo não aceito. Pode enviar: ${ALLOWED_EXTENSIONS.join(", ")}.`,
		);
	}

	const upload: MockUpload = {
		id: Math.max(0, ...uploads.map((item) => item.id)) + 1,
		lessonNumber: lesson.number,
		studentId: student.id,
		name: file.name,
		size: file.size,
		createdAt: nowStamp(),
	};
	uploads = [upload, ...uploads];
	return json(201, uploadRow(upload));
}

/**
 * sheetList is the folhas of the aulas that have started.
 *
 * The aula atual has only a ficha: the desafios of the class being taught are
 * written after it, and the screen has to look right with one button as well as
 * with two.
 */
function sheetList(): unknown {
	const lesson = currentLesson();
	if (!lesson) return [];
	return [...lessons]
		.sort((a, b) => a.number - b.number)
		.filter((item) => item.number <= lesson.number)
		.map((item) => ({
			lessonNumber: item.number,
			sheets: [
				{
					kind: "ficha",
					title: "Ficha",
					url: `/folhas/aula${item.number}-ficha.pdf`,
				},
				...(item.number < lesson.number
					? [
							{
								kind: "desafios",
								title: "Desafios",
								url: `/folhas/aula${item.number}-desafios.pdf`,
							},
						]
					: []),
			],
		}));
}

/**
 * visibleGames is what the kid's API answers with, by the same rule the server
 * uses: free mode is every playable game, single mode is the active one when it
 * can be played, and nothing otherwise.
 */
function visibleGames(): MockGame[] {
	if (freeMode) return CATALOGUE.filter((game) => game.playable);
	const active = CATALOGUE.find((game) => game.id === activeGame);
	return active?.playable ? [active] : [];
}

/** publicGame is one entry as the kid's screens carry it: no playability. */
function publicGame(game: MockGame): unknown {
	return {
		id: game.id,
		title: game.title,
		type: game.type,
		system: game.system,
		year: game.year,
		maker: game.maker,
		about: game.about,
		controls: game.controls,
		autoScore: game.autoScore,
		cover: game.cover,
	};
}

/** adminGameRow is one entry as the teacher's table carries it. */
function adminGameRow(game: MockGame): unknown {
	return {
		id: game.id,
		title: game.title,
		type: game.type,
		system: game.system,
		core: game.core,
		year: game.year,
		maker: game.maker,
		playable: game.playable,
		missing: game.missing,
		cover: game.cover,
	};
}

/**
 * byRank orders pontuações the way the placar reads: best first, and a tie is
 * decided by who got there first.
 */
function byRank(a: MockScore, b: MockScore): number {
	if (a.score !== b.score) return b.score - a.score;
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
	return a.id - b.id;
}

/**
 * newestScoreFirst is the server's order for a list of pontuações: newest
 * first, the id breaking a tie.
 */
function newestScoreFirst(a: MockScore, b: MockScore): number {
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
	return b.id - a.id;
}

/** studentName is the name a pontuação is filed under. */
function studentName(id: number): string {
	const student = students.find((item) => item.id === id);
	return student ? student.name : "Aluno removido";
}

/**
 * scoreboardOf is `GET /api/games/<id>/scoreboard`.
 *
 * The three rules the server applies, applied here: the top list is the aula
 * atual's approved pontuações with the best one per aluno, ten of them, and a
 * tie SHARES a place (two kids on 42 are both first, the next one is third); the
 * record is the best approved pontuação of all time; and the pending list is the
 * session student's own self-reports of this aula.
 */
function scoreboardOf(gameId: string): unknown {
	const lesson = currentLesson();
	const approved = scores
		.filter((score) => score.gameId === gameId && score.approved)
		.sort(byRank);
	const record = approved[0] ?? null;

	const best = new Map<number, MockScore>();
	if (lesson) {
		for (const score of approved) {
			if (score.lessonNumber !== lesson.number) continue;
			if (!best.has(score.studentId)) best.set(score.studentId, score);
		}
	}

	const top: unknown[] = [];
	let rank = 0;
	let previous: number | null = null;
	[...best.values()].slice(0, 10).forEach((score, index) => {
		if (previous === null || score.score !== previous) rank = index + 1;
		previous = score.score;
		top.push({
			rank,
			student: { id: score.studentId, name: studentName(score.studentId) },
			score: score.score,
		});
	});

	return {
		record: record
			? {
					score: record.score,
					student: {
						id: record.studentId,
						name: studentName(record.studentId),
					},
					lessonNumber: record.lessonNumber,
				}
			: null,
		top,
		myPending: scores
			.filter(
				(score) =>
					score.gameId === gameId &&
					!score.approved &&
					score.studentId === identity &&
					score.lessonNumber === lesson?.number,
			)
			.sort(newestScoreFirst)
			.map((score) => ({
				id: score.id,
				score: score.score,
				createdAt: score.createdAt,
			})),
	};
}

/**
 * createScore is `POST /api/scores`, with the server's refusals.
 *
 * An automatic pontuação is only accepted from a game that can count its own --
 * our own page, or an emulated game whose catalogue entry says where its score
 * lives -- and it is approved as it arrives, where a self-report waits for the
 * teacher.
 */
function createScore(body: unknown): Response {
	const student = students.find((item) => item.id === identity && item.active);
	if (!student) return failure(409, "Escolha seu nome primeiro.");
	const lesson = currentLesson();
	if (!lesson) return failure(409, "Nenhuma aula começou ainda.");

	const gameId = text(field(body, "gameId"));
	const game = visibleGames().find((item) => item.id === gameId);
	if (!game) return failure(404, "Este jogo não está liberado.");

	const score = Number(field(body, "score"));
	if (!Number.isInteger(score) || score < 0 || score > 9_999_999) {
		return failure(422, "A pontuação precisa ser um número de 0 a 9999999.");
	}

	const method = field(body, "method");
	if (method !== "auto" && method !== "self") {
		return failure(422, "Forma de pontuação inválida.");
	}
	if (method === "auto" && !game.autoScore) {
		return failure(422, "Este jogo não manda a pontuação sozinho.");
	}

	const created: MockScore = {
		id: Math.max(0, ...scores.map((item) => item.id)) + 1,
		gameId,
		lessonNumber: lesson.number,
		studentId: student.id,
		score,
		method,
		approved: method === "auto",
		createdAt: nowStamp(),
	};
	scores = [created, ...scores];
	return json(201, {
		id: created.id,
		score: created.score,
		approved: created.approved,
	});
}

/** adminScoreRow is one pontuação as the teacher's list carries it. */
function adminScoreRow(score: MockScore): unknown {
	const game = CATALOGUE.find((item) => item.id === score.gameId);
	return {
		id: score.id,
		game: { id: score.gameId, title: game ? game.title : score.gameId },
		student: { id: score.studentId, name: studentName(score.studentId) },
		lessonNumber: score.lessonNumber,
		score: score.score,
		method: score.method,
		approved: score.approved,
		createdAt: score.createdAt,
	};
}

/**
 * fileResponse stands in for a download.
 *
 * The bytes are a sentence rather than a real file: nothing is committed for the
 * mock to serve, and what the screens depend on is the attachment header and the
 * file name, which the server sets from the entrega's own name.
 */
function fileResponse(name: string): Response {
	return new Response(`Arquivo de mentira (${MOCK_MARKER}): ${name}`, {
		status: 200,
		headers: {
			"Content-Type": "application/octet-stream",
			"Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
		},
	});
}

function handlePublic(
	method: string,
	api: string,
	body: unknown,
): Response | null {
	if (method === "GET" && api === "/session") return json(200, publicSession());
	if (method === "GET" && api === "/students") {
		return json(
			200,
			activeStudents().map((student) => ({
				id: student.id,
				name: student.name,
			})),
		);
	}
	if (method === "PUT" && api === "/identity") {
		const wanted = Number(field(body, "studentId"));
		const student = students.find((s) => s.id === wanted && s.active);
		if (!student) return failure(422, "Escolha um aluno da lista.");
		identity = student.id;
		return empty();
	}
	if (method === "DELETE" && api === "/identity") {
		identity = null;
		return empty();
	}
	if (method === "POST" && api === "/uploads") return createUpload(body);
	if (method === "GET" && api === "/my-uploads") {
		const student = students.find(
			(item) => item.id === identity && item.active,
		);
		if (!student) return failure(409, "Escolha seu nome primeiro.");
		return json(
			200,
			uploads
				.filter((upload) => upload.studentId === student.id)
				.sort(newestFirst)
				.map(uploadRow),
		);
	}
	const mine = /^\/uploads\/(\d+)\/download$/.exec(api);
	if (method === "GET" && mine) {
		const id = Number(mine[1] ?? "");
		const upload = uploads.find(
			(item) => item.id === id && item.studentId === identity,
		);
		if (!upload) return failure(404, "Este arquivo não existe.");
		return fileResponse(upload.name);
	}
	if (method === "GET" && api === "/sheets") return json(200, sheetList());
	if (method === "GET" && api === "/games") {
		return json(200, {
			mode: freeMode ? "free" : "single",
			games: visibleGames().map(publicGame),
		});
	}
	const board = /^\/games\/([a-z0-9-]+)\/scoreboard$/.exec(api);
	if (method === "GET" && board) {
		const id = board[1] ?? "";
		if (!visibleGames().some((item) => item.id === id)) {
			return failure(404, "Este jogo não está liberado.");
		}
		return json(200, scoreboardOf(id));
	}
	if (method === "POST" && api === "/scores") return createScore(body);
	const oneGame = /^\/games\/([a-z0-9-]+)$/.exec(api);
	if (method === "GET" && oneGame) {
		const id = oneGame[1] ?? "";
		const game = visibleGames().find((item) => item.id === id);
		if (!game) return failure(404, "Este jogo não está liberado.");
		return json(200, publicGame(game));
	}
	return null;
}

function handleAdmin(
	method: string,
	api: string,
	query: URLSearchParams,
	body: unknown,
): Response | null {
	if (method === "GET" && api === "/session") return json(200, adminSession());
	if (method === "POST" && api === "/login") {
		if (text(field(body, "password")) !== WRONG_PASSWORD) {
			signedIn = true;
			return empty();
		}
		return failure(401, "Senha incorreta.");
	}
	if (method === "POST" && api === "/logout") {
		signedIn = false;
		return empty();
	}

	if (!signedIn) return failure(401, MESSAGE_NO_SESSION);

	if (api === "/students") {
		if (method === "GET") {
			// The server answers this list ordered by name, deactivated students
			// included -- the only way the reactivate action can be reached.
			return json(
				200,
				[...students].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
			);
		}
		if (method === "POST") {
			const name = text(field(body, "name"));
			if (name === "") return failure(422, "Escreva o nome do aluno.");
			const clash = students.some(
				(s) => s.name.toLowerCase() === name.toLowerCase(),
			);
			if (clash) return failure(409, `Já existe um aluno chamado ${name}.`);
			const id = Math.max(0, ...students.map((s) => s.id)) + 1;
			students = [...students, { id, name, active: true }];
			return empty();
		}
	}

	const student = /^\/students\/(\d+)$/.exec(api);
	if (student) {
		const id = Number(student[1] ?? "");
		const found = students.find((s) => s.id === id);
		if (!found) return failure(404, "Este aluno não existe.");
		if (method === "PATCH") {
			const name = field(body, "name");
			const active = field(body, "active");
			if (name !== undefined) {
				const wanted = text(name);
				if (wanted === "") return failure(422, "Escreva o nome do aluno.");
				const clash = students.some(
					(s) => s.id !== id && s.name.toLowerCase() === wanted.toLowerCase(),
				);
				if (clash) return failure(409, `Já existe um aluno chamado ${wanted}.`);
				found.name = wanted;
			}
			if (typeof active === "boolean") found.active = active;
			return empty();
		}
		if (method === "DELETE") {
			const referenced = [...attendance.values()].some((marks) =>
				marks.has(id),
			);
			if (referenced) {
				return failure(
					409,
					`${found.name} já tem presença registrada e não pode ser excluído.`,
				);
			}
			students = students.filter((s) => s.id !== id);
			return empty();
		}
	}

	if (api === "/lessons") {
		if (method === "GET") {
			return json(
				200,
				[...lessons].sort((a, b) => a.number - b.number),
			);
		}
		if (method === "POST") {
			const number = Number(field(body, "number"));
			const date = text(field(body, "date"));
			if (!Number.isInteger(number) || number <= 0) {
				return failure(422, "O número da aula precisa ser maior que zero.");
			}
			if (date === "") return failure(422, "Escolha a data da aula.");
			if (lessons.some((l) => l.number === number)) {
				return failure(409, `Já existe uma aula com o número ${number}.`);
			}
			lessons = [...lessons, { number, date }];
			return empty();
		}
	}

	const lesson = /^\/lessons\/(\d+)$/.exec(api);
	if (lesson) {
		const number = Number(lesson[1] ?? "");
		const found = lessons.find((l) => l.number === number);
		if (!found) return failure(404, "Esta aula não existe.");
		if (method === "PATCH") {
			const date = text(field(body, "date"));
			if (date === "") return failure(422, "Escolha a data da aula.");
			found.date = date;
			return empty();
		}
		if (method === "DELETE") {
			if (attendance.has(number)) {
				return failure(409, "Esta aula já tem presença registrada.");
			}
			lessons = lessons.filter((l) => l.number !== number);
			if (override === number) override = null;
			return empty();
		}
	}

	if (api === "/override") {
		if (method === "GET") return json(200, { lesson: override });
		if (method === "PUT") {
			const wanted = field(body, "lesson");
			if (wanted === null) {
				override = null;
				return empty();
			}
			const number = Number(wanted);
			if (!lessons.some((l) => l.number === number)) {
				return failure(422, "Esta aula não está cadastrada.");
			}
			override = number;
			return empty();
		}
	}

	if (api === "/games" && method === "GET") {
		return json(200, {
			activeGame,
			freeMode,
			games: CATALOGUE.map(adminGameRow),
		});
	}

	if (api === "/games/mode" && method === "PUT") {
		const wanted = field(body, "activeGame");
		const wantedFree = field(body, "freeMode");
		if (typeof wantedFree !== "boolean") {
			return failure(422, "Modo de jogo inválido.");
		}
		if (wanted !== null && typeof wanted !== "string") {
			return failure(422, "Jogo inválido.");
		}
		const entry =
			wanted === null ? null : CATALOGUE.find((game) => game.id === wanted);
		if (wanted !== null && !entry?.playable) {
			return failure(422, "Este jogo não está pronto para jogar.");
		}
		activeGame = wanted;
		freeMode = wantedFree;
		return empty();
	}

	if (api === "/scores" && method === "GET") {
		const status = query.get("status");
		const lessonParam = query.get("lesson");
		const gameParam = query.get("game");
		const lessonNumber = lessonParam === null ? null : Number(lessonParam);
		if (
			(status !== null && status !== "pending" && status !== "approved") ||
			(lessonNumber !== null && !Number.isInteger(lessonNumber))
		) {
			return failure(422, "Filtro inválido.");
		}
		return json(
			200,
			scores
				.filter(
					(score) =>
						status === null || score.approved === (status === "approved"),
				)
				.filter(
					(score) =>
						lessonNumber === null || score.lessonNumber === lessonNumber,
				)
				.filter((score) => gameParam === null || score.gameId === gameParam)
				.sort(newestScoreFirst)
				.map(adminScoreRow),
		);
	}

	const approval = /^\/scores\/(\d+)\/approval$/.exec(api);
	if (approval && method === "PUT") {
		const score = scores.find((item) => item.id === Number(approval[1] ?? ""));
		if (!score) return failure(404, "Esta pontuação não existe.");
		const approved = field(body, "approved");
		if (typeof approved !== "boolean") {
			return failure(422, "Confirmação inválida.");
		}
		score.approved = approved;
		return empty();
	}

	const scoreEntry = /^\/scores\/(\d+)$/.exec(api);
	if (scoreEntry && method === "DELETE") {
		const id = Number(scoreEntry[1] ?? "");
		if (!scores.some((item) => item.id === id)) {
			return failure(404, "Esta pontuação não existe.");
		}
		scores = scores.filter((item) => item.id !== id);
		return empty();
	}

	const sheet = /^\/attendance\/(\d+)$/.exec(api);
	if (sheet) {
		const number = Number(sheet[1] ?? "");
		if (!lessons.some((l) => l.number === number)) {
			return failure(404, "Esta aula não existe.");
		}
		if (method === "GET") return json(200, attendanceSheet(number));
		if (method === "PUT") {
			const present = field(body, "present");
			if (!Array.isArray(present)) {
				return failure(422, "Lista de presença inválida.");
			}
			const marks = attendance.get(number) ?? new Set<number>();
			// Only the active students' marks are replaced, so a student who
			// left mid-course keeps the record of the classes they attended.
			for (const student of students) {
				if (!student.active) continue;
				if (present.includes(student.id)) marks.add(student.id);
				else marks.delete(student.id);
			}
			attendance.set(number, marks);
			return empty();
		}
	}

	if (method === "GET" && api === "/uploads") {
		const lessonParam = query.get("lesson");
		const studentParam = query.get("student");
		const lessonNumber = lessonParam === null ? null : Number(lessonParam);
		const studentId = studentParam === null ? null : Number(studentParam);
		if (
			(lessonNumber !== null && !Number.isInteger(lessonNumber)) ||
			(studentId !== null && !Number.isInteger(studentId))
		) {
			return failure(422, "Filtro inválido.");
		}
		return json(
			200,
			uploads
				.filter(
					(upload) =>
						lessonNumber === null || upload.lessonNumber === lessonNumber,
				)
				.filter(
					(upload) => studentId === null || upload.studentId === studentId,
				)
				.sort(newestFirst)
				.map(adminUploadRow),
		);
	}

	const zip = /^\/uploads\/lesson\/(\d+)\.zip$/.exec(api);
	if (method === "GET" && zip) {
		const number = Number(zip[1] ?? "");
		if (!lessons.some((l) => l.number === number)) {
			return failure(404, "Esta aula não existe.");
		}
		const count = uploads.filter((item) => item.lessonNumber === number).length;
		return new Response(
			`Zip de mentira (${MOCK_MARKER}): Aula ${number}, ${count} arquivo(s).`,
			{
				status: 200,
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition": `attachment; filename="aula-${number}.zip"`,
				},
			},
		);
	}

	const entry = /^\/uploads\/(\d+)$/.exec(api);
	if (entry) {
		const id = Number(entry[1] ?? "");
		const upload = uploads.find((item) => item.id === id);
		if (!upload) return failure(404, "Esta entrega não existe.");
		if (method === "PATCH") {
			const wanted = Number(field(body, "lessonNumber"));
			if (!lessons.some((l) => l.number === wanted)) {
				return failure(422, "Esta aula não está cadastrada.");
			}
			upload.lessonNumber = wanted;
			return json(200, adminUploadRow(upload));
		}
	}

	const entryDownload = /^\/uploads\/(\d+)\/download$/.exec(api);
	if (method === "GET" && entryDownload) {
		const id = Number(entryDownload[1] ?? "");
		const upload = uploads.find((item) => item.id === id);
		if (!upload) return failure(404, "Esta entrega não existe.");
		return fileResponse(upload.name);
	}

	return null;
}

function respond(
	isAdmin: boolean,
	method: string,
	api: string,
	query: URLSearchParams,
	body: unknown,
): Response | null {
	return isAdmin
		? handleAdmin(method, api, query, body)
		: handlePublic(method, api, body);
}

/**
 * installAdminMeta puts the admin path in <head>, the way the server does.
 *
 * Before the render, so the router reads it on its first pass -- the same
 * ordering the server guarantees by injecting the tag into index.html.
 */
function installAdminMeta(): void {
	if (document.querySelector(`meta[name="sala-admin-base"]`)) return;
	const meta = document.createElement("meta");
	meta.name = "sala-admin-base";
	meta.content = ADMIN_BASE;
	document.head.append(meta);
}

/**
 * MockXhr is the upload's transport, stood in for.
 *
 * The upload client uses XMLHttpRequest because it is the only way to watch a
 * request body leave (lib/api.ts says why), and patching `fetch` does not touch
 * it -- so without this, handing a file in would be the one thing that does not
 * work in mock mode.
 *
 * It is a shim and not an implementation: it takes the request, hands it to the
 * same mocked `fetch`, and reports the answer through the two events the client
 * listens for. The progress event is a single one at the end, because there is
 * nothing in flight to measure.
 */
class MockXhr {
	readonly upload = new EventTarget();
	readonly responseType = "";
	withCredentials = false;
	status = 0;
	responseText = "";

	private readonly target = new EventTarget();
	private method = "GET";
	private url = "";
	private readonly headers: Record<string, string> = {};

	open(method: string, url: string): void {
		this.method = method;
		this.url = url;
	}

	setRequestHeader(name: string, value: string): void {
		this.headers[name] = value;
	}

	addEventListener(type: string, listener: EventListener): void {
		this.target.addEventListener(type, listener);
	}

	removeEventListener(type: string, listener: EventListener): void {
		this.target.removeEventListener(type, listener);
	}

	send(body?: XMLHttpRequestBodyInit | null): void {
		void this.answer(body ?? null);
	}

	private async answer(body: XMLHttpRequestBodyInit | null): Promise<void> {
		const response = await globalThis.fetch(this.url, {
			method: this.method,
			headers: this.headers,
			...(body === null ? {} : { body }),
		});
		this.status = response.status;
		this.responseText = await response.text();
		this.upload.dispatchEvent(
			new ProgressEvent("progress", {
				loaded: 1,
				total: 1,
				lengthComputable: true,
			}),
		);
		this.target.dispatchEvent(new Event("load"));
	}
}

/**
 * installMock replaces fetch -- and XMLHttpRequest, for the upload -- with the
 * fixture above.
 *
 * Anything that is not under /api or the admin API falls through to the real
 * fetch, so the mock does not have to know about the things Vite itself serves.
 * The one thing it does not answer is a download: those are links the browser
 * follows, not requests the SPA makes, and in mock mode they land on Vite's
 * fallback rather than on a file.
 */
export function installMock(): void {
	installAdminMeta();
	resetData();

	const realFetch = globalThis.fetch.bind(globalThis);

	globalThis.fetch = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const url = new URL(
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url,
			window.location.origin,
		);
		const method = (
			init?.method ?? (input instanceof Request ? input.method : "GET")
		).toUpperCase();

		const adminApi = `${ADMIN_BASE}/api`;
		const isAdmin = url.pathname.startsWith(`${adminApi}/`);
		let api: string | null = null;
		if (isAdmin) api = url.pathname.slice(adminApi.length);
		else if (url.pathname.startsWith("/api/")) api = url.pathname.slice(4);
		if (api === null) return realFetch(input, init);

		const mutating =
			method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
		if (mutating) {
			const headers = new Headers(init?.headers);
			if (headers.get("X-CSRF-Token") !== CSRF) {
				return failure(400, MESSAGE_CSRF);
			}
		}

		// A JSON body is parsed; anything else -- the upload's FormData -- is
		// handed to the handler as it arrived.
		let body: unknown = init?.body ?? undefined;
		if (typeof init?.body === "string" && init.body !== "") {
			body = JSON.parse(init.body);
		}

		return (
			respond(isAdmin, method, api, url.searchParams, body) ??
			failure(404, `${MESSAGE_OFFLINE}: ${method} ${url.pathname}`)
		);
	};

	// The cast is the whole point of the shim: it implements the four members
	// the upload client uses, not the DOM interface.
	globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;

	console.info(
		`${MOCK_MARKER}: /api e ${ADMIN_BASE}/ são servidos por src/dev/mock.ts`,
	);
}
