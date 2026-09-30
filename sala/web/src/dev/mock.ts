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
 * Two deliberate differences from the server:
 *
 *  - The admin session starts SIGNED IN, so an admin screen can be opened
 *    directly. "Sair" and a wrong password still exercise the login card.
 *  - The admin path is fixed at /professor-teste rather than read from
 *    config.toml, and it is injected into <head> the way the server injects it.
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

let students: MockStudent[] = [];
let lessons: MockLesson[] = [];
let attendance = new Map<number, Set<number>>();
let override: number | null = null;
let signedIn = true;
let identity: number | null = null;

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
	override = null;
	signedIn = true;
	identity = null;
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
	return null;
}

function handleAdmin(
	method: string,
	api: string,
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

	return null;
}

function respond(
	isAdmin: boolean,
	method: string,
	api: string,
	body: unknown,
): Response | null {
	return isAdmin
		? handleAdmin(method, api, body)
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
 * installMock replaces fetch with the fixture above.
 *
 * Anything that is not under /api or the admin API falls through to the real
 * fetch, so the mock does not have to know about the things Vite itself serves.
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

		let body: unknown;
		if (typeof init?.body === "string" && init.body !== "") {
			body = JSON.parse(init.body);
		}

		return (
			respond(isAdmin, method, api, body) ??
			failure(404, `${MESSAGE_OFFLINE}: ${method} ${url.pathname}`)
		);
	};

	console.info(
		`${MOCK_MARKER}: /api e ${ADMIN_BASE}/ são servidos por src/dev/mock.ts`,
	);
}
