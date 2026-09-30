import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ApiError,
	adminLogin,
	adminLogout,
	CSRF_HEADER,
	csrfToken,
	deleteStudent,
	forgetCsrf,
	getAdminSession,
	getPublicSession,
	listStudents,
	putIdentity,
	rememberCsrf,
	setUnauthorizedHandler,
	updateStudent,
} from "@/lib/api";

/** The admin path a deployment injects into <head>. */
const BASE = "/professor-kqzt";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** withAdminBase puts the server's meta tag in the document, as Flask does. */
function withAdminBase(): void {
	const meta = document.createElement("meta");
	meta.name = "sala-admin-base";
	meta.content = BASE;
	document.head.append(meta);
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
	return (init?.headers ?? {}) as Record<string, string>;
}

describe("the CSRF header", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		forgetCsrf();
		rememberCsrf("tok-1");
		withAdminBase();
		setUnauthorizedHandler(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	it("rides on every mutating method, public and admin alike", async () => {
		const writes: [string, string, () => Promise<void>][] = [
			["PUT", "/api/identity", () => putIdentity(3)],
			["POST", `${BASE}/api/logout`, () => adminLogout()],
			[
				"PATCH",
				`${BASE}/api/students/1`,
				() => updateStudent(1, { name: "Ana" }),
			],
			["DELETE", `${BASE}/api/students/1`, () => deleteStudent(1)],
		];
		for (const [method, path, call] of writes) {
			fetchMock.mockClear();
			fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
			rememberCsrf("tok-1");
			await call();
			const [sentPath, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(sentPath).toBe(path);
			expect(init.method).toBe(method);
			expect(headersOf(init)[CSRF_HEADER]).toBe("tok-1");
			expect(init.credentials).toBe("same-origin");
		}
	});

	it("is re-read after a login, because the server rotates it", async () => {
		// Session-fixation defence: the token the anonymous browser held is not
		// the one the signed-in session uses, so the first write after logging in
		// would be refused as a malformed request if this tab kept the old one.
		fetchMock.mockReset();
		fetchMock
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(
				jsonResponse(200, {
					admin: true,
					csrf: "tok-rotated",
					currentLesson: null,
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await adminLogin("segredo");
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/api/login`);
		expect(fetchMock.mock.calls[1]?.[0]).toBe(`${BASE}/api/session`);
		expect(csrfToken()).toBe("tok-rotated");

		await deleteStudent(1);
		const [, init] = fetchMock.mock.calls[2] as [string, RequestInit];
		expect(headersOf(init)[CSRF_HEADER]).toBe("tok-rotated");
	});

	it("is dropped on logout, so the next write reads a fresh session", async () => {
		await adminLogout();
		expect(csrfToken()).toBe("");
	});

	it("is not sent on a GET, which the server does not check", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, []));
		await listStudents();
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(headersOf(init)[CSRF_HEADER]).toBeUndefined();
	});

	it("is fetched from the session when a write arrives before any session was read", async () => {
		// A form submitted from a deep-linked admin page: the screen never read
		// a session, and a write with an empty header would be a 400 the teacher
		// could do nothing about.
		forgetCsrf();
		fetchMock.mockReset();
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(200, {
					csrf: "tok-9",
					student: null,
					currentLesson: null,
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await putIdentity(2);

		const [firstPath, firstInit] = fetchMock.mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(firstPath).toBe("/api/session");
		expect(headersOf(firstInit)[CSRF_HEADER]).toBeUndefined();

		const [secondPath, secondInit] = fetchMock.mock.calls[1] as [
			string,
			RequestInit,
		];
		expect(secondPath).toBe("/api/identity");
		expect(headersOf(secondInit)[CSRF_HEADER]).toBe("tok-9");
		expect(csrfToken()).toBe("tok-9");
	});
});

describe("reading a session", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		forgetCsrf();
		withAdminBase();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	it("arms the CSRF cache, which is the only place the token comes from", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, { csrf: "tok-2", student: null, currentLesson: null }),
		);
		await getPublicSession();
		expect(csrfToken()).toBe("tok-2");
	});

	it("reads the admin session under the injected admin base", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, { admin: true, csrf: "tok-3", currentLesson: null }),
		);
		const session = await getAdminSession();
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/api/session`);
		expect(session.admin).toBe(true);
		expect(csrfToken()).toBe("tok-3");
	});
});

describe("a refusal", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
		withAdminBase();
		setUnauthorizedHandler(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	it("becomes an ApiError carrying the status and the message the API wrote", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(409, {
				error: "Ana Teste já tem presença registrada e não pode ser excluída.",
			}),
		);

		const failure = await deleteStudent(1).catch((e: unknown) => e);

		expect(failure).toBeInstanceOf(ApiError);
		expect((failure as ApiError).status).toBe(409);
		expect((failure as ApiError).message).toBe(
			"Ana Teste já tem presença registrada e não pode ser excluída.",
		);
	});

	it("falls back to a pt-BR sentence when the body is not the API's JSON", async () => {
		// What a proxy, or a server that is not running, answers.
		fetchMock.mockResolvedValue(
			new Response("<html>502</html>", {
				status: 502,
				statusText: "Bad Gateway",
			}),
		);

		const failure = (await listStudents().catch((e: unknown) => e)) as ApiError;

		expect(failure.status).toBe(502);
		expect(failure.message).toBe(
			"Não foi possível falar com o servidor. Tente de novo.",
		);
	});

	it("tells the admin shell about a 401, and leaves the login form alone", async () => {
		const seen: string[] = [];
		setUnauthorizedHandler(() => seen.push("volta para o login"));

		fetchMock.mockResolvedValue(jsonResponse(401, { error: "Entre de novo." }));
		await listStudents().catch(() => undefined);
		expect(seen).toEqual(["volta para o login"]);

		// A wrong password IS a 401, and it is the answer to the form rather
		// than an expired session: nothing should navigate anywhere.
		fetchMock.mockResolvedValue(
			jsonResponse(401, { error: "Senha incorreta." }),
		);
		await adminLogin("errada").catch(() => undefined);
		expect(seen).toEqual(["volta para o login"]);
	});

	it("reads the session again and retries once when the token no longer matches", async () => {
		// The cookie was dropped: the tab still holds the token of the session it
		// read, the server has a session it never handed that token to, and the
		// write comes back as a malformed request.
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(400, {
					error: "Requisição inválida: token do formulário errado.",
					code: "csrf",
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse(200, {
					csrf: "tok-novo",
					student: null,
					currentLesson: null,
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await deleteStudent(1);

		expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
			`${BASE}/api/students/1`,
			"/api/session",
			`${BASE}/api/students/1`,
		]);
		const [, retry] = fetchMock.mock.calls[2] as [string, RequestInit];
		expect(headersOf(retry)[CSRF_HEADER]).toBe("tok-novo");
		expect(csrfToken()).toBe("tok-novo");
	});

	it("sends the shell to the login card when the retry is a 401", async () => {
		const seen: string[] = [];
		setUnauthorizedHandler(() => seen.push("volta para o login"));
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(400, { error: "Falta o token.", code: "csrf" }),
			)
			.mockResolvedValueOnce(
				jsonResponse(200, {
					admin: false,
					csrf: "tok-novo",
					currentLesson: null,
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse(401, { error: "Entre como professor para fazer isso." }),
			);

		const failure = (await deleteStudent(1).catch(
			(e: unknown) => e,
		)) as ApiError;

		expect(failure.status).toBe(401);
		expect(seen).toEqual(["volta para o login"]);
	});

	it("does not retry a 400 that is not the token", async () => {
		// A malformed body is the caller's mistake, not a stale token, and
		// re-sending it would only produce the same refusal.
		fetchMock.mockResolvedValue(
			jsonResponse(400, {
				error: "Requisição inválida: corpo JSON ausente ou malformado.",
			}),
		);

		const failure = (await deleteStudent(1).catch(
			(e: unknown) => e,
		)) as ApiError;

		expect(failure.status).toBe(400);
		expect(failure.code).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
