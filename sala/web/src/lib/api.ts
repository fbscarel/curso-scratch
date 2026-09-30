import { readAdminBase } from "@/lib/adminBase";
import type {
	AdminSession,
	AdminStudent,
	Attendance,
	Lesson,
	OverrideView,
	PublicSession,
	Student,
} from "@/lib/types";

/**
 * The header every mutating request carries. It must equal the session's CSRF
 * token: the server refuses a non-GET request without it (400), so a write sent
 * with an empty or stale header is refused as a malformed request rather than
 * performed.
 */
export const CSRF_HEADER = "X-CSRF-Token";

/** The public API prefix. The admin tree has its own, under the admin path. */
export const API_PREFIX = "/api";

/** The `code` the API tags a refused CSRF token with. */
const CSRF_ERROR_CODE = "csrf";

/**
 * What a failure with no readable body is shown as.
 *
 * The API answers every error with `{"error": "<pt-BR message>"}`, but the thing
 * in front of it -- a proxy, a server that is not running -- does not, and a
 * screen that showed an empty red box would be worse than this sentence.
 */
const OFFLINE_MESSAGE = "Não foi possível falar com o servidor. Tente de novo.";

/**
 * The session's CSRF token, remembered from the last session this tab read.
 *
 * Cached rather than re-read per write because the token belongs to the SESSION,
 * not to the request: fetching it again for every PUT would double the traffic
 * of every screen for a value that cannot have changed.
 */
let csrf = "";

export function rememberCsrf(token: string): void {
	csrf = token;
}

export function forgetCsrf(): void {
	csrf = "";
}

/** The token this tab would send, or "" before any session has been read. */
export function csrfToken(): string {
	return csrf;
}

/**
 * What to do about a 401: the admin session is gone and the answer is the login
 * screen, not a red box.
 *
 * Injected rather than called directly so the admin shell owns the decision and
 * a test can observe it. The session probes suppress it -- a cold browser has no
 * session and `/session` is EXPECTED to answer `admin: false`, so a redirect on
 * that one would be a loop.
 */
let onUnauthorized: () => void = () => undefined;

export function setUnauthorizedHandler(fn: () => void): void {
	onUnauthorized = fn;
}

/** ApiError carries the status and the message the API wrote for display. */
export class ApiError extends Error {
	readonly status: number;
	/**
	 * The API's machine-readable code, when the refusal carried one. It is what
	 * a caller reads when the KIND of refusal changes what it should do (a stale
	 * CSRF token means "read the session again", and the message alone cannot
	 * say that).
	 */
	readonly code: string | null;

	constructor(status: number, message: string, code: string | null = null) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
	}
}

interface RequestOptions {
	method?: string;
	body?: unknown;
	signal?: AbortSignal;
	/** Suppress the unauthorized handler. Only the session probes and login set this. */
	silentUnauthorized?: boolean;
}

/** The parts of a refused response the client acts on. */
interface RequestFailure {
	status: number;
	message: string;
	code: string | null;
}

/**
 * request is the ONE place a JSON call leaves this application.
 *
 * Same-origin, credentials included so the session cookie rides along, and the
 * CSRF header attached to every mutating method rather than to a list of routes
 * somebody has to keep in step with the server's.
 */
export async function request<T>(
	path: string,
	opts: RequestOptions = {},
): Promise<T> {
	const res = await send(path, opts);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

/**
 * mutate performs a write and throws away the body.
 *
 * Every write this API serves answers 204, and a screen reloads what it changed
 * rather than patching a local copy -- so reading a body that is not promised is
 * a parse error waiting for the day one of them answers 200 with something else.
 */
export async function mutate(
	path: string,
	opts: RequestOptions = {},
): Promise<void> {
	await send(path, opts);
}

/**
 * isMutating is an ALLOWLIST of safe methods, so a method nobody anticipated
 * carries the token rather than skipping it.
 */
export function isMutating(method: string): boolean {
	switch (method.toUpperCase()) {
		case "GET":
		case "HEAD":
		case "OPTIONS":
			return false;
		default:
			return true;
	}
}

/**
 * send performs one request, with the one retry a stale CSRF token deserves.
 *
 * The token belongs to the SESSION, and a session can end under a tab that is
 * still holding it: the cookie is dropped, or the browser throws the session
 * away, and the next write arrives with a token the server has nothing to match
 * against. That is a 400 `code: "csrf"`, and it is the one refusal that has an
 * answer the client can carry out by itself -- read the session again (which
 * hands over the token of the session the browser actually has) and send the
 * request once more. The retry answers 204, or the 401 that sends the shell to
 * the login card, exactly as a write on an expired session should.
 *
 * The retry happens ONCE: a token refused a second time is not a stale token.
 */
async function send(
	path: string,
	opts: RequestOptions,
	retried = false,
): Promise<Response> {
	const res = await sendOnce(path, opts);
	if (res.ok) return res;

	const failure = await readFailure(res);
	if (!retried && failure.status === 400 && failure.code === CSRF_ERROR_CODE) {
		forgetCsrf();
		await getPublicSession();
		return send(path, opts, true);
	}
	if (failure.status === 401 && !opts.silentUnauthorized) onUnauthorized();
	throw new ApiError(failure.status, failure.message, failure.code);
}

/** sendOnce is the fetch itself: the method, the headers and the body. */
async function sendOnce(path: string, opts: RequestOptions): Promise<Response> {
	const method = (opts.method ?? "GET").toUpperCase();
	const headers: Record<string, string> = { Accept: "application/json" };
	if (isMutating(method)) headers[CSRF_HEADER] = await csrfTokenOrFetch();
	if (opts.body !== undefined) headers["Content-Type"] = "application/json";

	const init: RequestInit = {
		method,
		headers,
		credentials: "same-origin",
		redirect: "error",
	};
	if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
	if (opts.signal) init.signal = opts.signal;

	return fetch(path, init);
}

/**
 * csrfTokenOrFetch answers the token a write needs, reading the session first if
 * this tab has not read one yet.
 *
 * A write issued before any screen has loaded (a form submitted from a
 * deep-linked admin page, say) would otherwise go out with an empty header and
 * be refused as a malformed request. The public session is the source: it needs
 * no authentication, and the token it hands over is the one session both trees
 * share.
 */
async function csrfTokenOrFetch(): Promise<string> {
	if (csrf !== "") return csrf;
	await getPublicSession();
	return csrf;
}

/**
 * readFailure reads the API's `{"error": "…", "code": "…"}` body.
 *
 * NORMALISED rather than cast: this is the one place a response the API did not
 * author reaches the UI, and a proxy is free to answer HTML or a JSON document
 * of its own shape. The code is optional -- the API sends it only for a refusal
 * the client has to act on.
 */
async function readFailure(res: Response): Promise<RequestFailure> {
	const failure: RequestFailure = {
		status: res.status,
		message: OFFLINE_MESSAGE,
		code: null,
	};
	try {
		const body: unknown = await res.json();
		if (body !== null && typeof body === "object") {
			const { error, code } = body as { error?: unknown; code?: unknown };
			if (typeof error === "string" && error.trim() !== "") {
				failure.message = error;
			}
			if (typeof code === "string" && code !== "") failure.code = code;
		}
	} catch {
		// Not JSON, so there is no message to read. The fallback above is what
		// there is to show.
	}
	return failure;
}

function adminPath(path: string): string {
	return `${readAdminBase()}${API_PREFIX}${path}`;
}

function optionalSignal(signal?: AbortSignal): RequestOptions {
	return signal ? { signal } : {};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getPublicSession is also what arms the CSRF cache: it is the only call that
 * hands the token over, and every screen that can write reads it first.
 */
export async function getPublicSession(
	signal?: AbortSignal,
): Promise<PublicSession> {
	const session = await request<PublicSession>(
		`${API_PREFIX}/session`,
		optionalSignal(signal),
	);
	rememberCsrf(session.csrf);
	return session;
}

/** listStudents is the active students, sorted by name. */
export function listStudents(signal?: AbortSignal): Promise<Student[]> {
	return request<Student[]>(`${API_PREFIX}/students`, optionalSignal(signal));
}

export function putIdentity(studentId: number): Promise<void> {
	return mutate(`${API_PREFIX}/identity`, {
		method: "PUT",
		body: { studentId },
	});
}

export function deleteIdentity(): Promise<void> {
	return mutate(`${API_PREFIX}/identity`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

export async function getAdminSession(
	signal?: AbortSignal,
): Promise<AdminSession> {
	const session = await request<AdminSession>(
		adminPath("/session"),
		optionalSignal(signal),
	);
	rememberCsrf(session.csrf);
	return session;
}

/**
 * adminLogin answers 401 with "Senha incorreta." for a wrong password, and that
 * 401 is not an expired session -- it is the answer to the form -- so it must
 * not send the browser anywhere.
 *
 * A successful login ROTATES the CSRF token, which is the session-fixation
 * defence: the token handed to the anonymous browser that asked for the login
 * page is not the one the signed-in session uses. The tab therefore re-reads the
 * session before it returns, so the first write after logging in carries a token
 * the server will accept rather than a stale one that would come back as a 400.
 */
export async function adminLogin(password: string): Promise<void> {
	await mutate(adminPath("/login"), {
		method: "POST",
		body: { password },
		silentUnauthorized: true,
	});
	await getAdminSession();
}

/**
 * adminLogout throws the session away, and with it the token. Forgetting the
 * cached one means the next write reads a fresh session -- and a fresh token --
 * instead of sending a token that belongs to a session the server has ended.
 */
export async function adminLogout(): Promise<void> {
	await mutate(adminPath("/logout"), { method: "POST" });
	forgetCsrf();
}

/** listAdminStudents is ALL students, deactivated ones included. */
export function listAdminStudents(
	signal?: AbortSignal,
): Promise<AdminStudent[]> {
	return request<AdminStudent[]>(
		adminPath("/students"),
		optionalSignal(signal),
	);
}

export function createStudent(name: string): Promise<void> {
	return mutate(adminPath("/students"), { method: "POST", body: { name } });
}

export function updateStudent(
	id: number,
	patch: { name?: string; active?: boolean },
): Promise<void> {
	return mutate(adminPath(`/students/${id}`), { method: "PATCH", body: patch });
}

export function deleteStudent(id: number): Promise<void> {
	return mutate(adminPath(`/students/${id}`), { method: "DELETE" });
}

export function listLessons(signal?: AbortSignal): Promise<Lesson[]> {
	return request<Lesson[]>(adminPath("/lessons"), optionalSignal(signal));
}

export function createLesson(body: {
	number: number;
	date: string;
}): Promise<void> {
	return mutate(adminPath("/lessons"), { method: "POST", body });
}

export function updateLesson(number: number, date: string): Promise<void> {
	return mutate(adminPath(`/lessons/${number}`), {
		method: "PATCH",
		body: { date },
	});
}

export function deleteLesson(number: number): Promise<void> {
	return mutate(adminPath(`/lessons/${number}`), { method: "DELETE" });
}

export function getOverride(signal?: AbortSignal): Promise<OverrideView> {
	return request<OverrideView>(adminPath("/override"), optionalSignal(signal));
}

export function putOverride(lesson: number | null): Promise<void> {
	return mutate(adminPath("/override"), { method: "PUT", body: { lesson } });
}

export function getAttendance(
	number: number,
	signal?: AbortSignal,
): Promise<Attendance> {
	return request<Attendance>(
		adminPath(`/attendance/${number}`),
		optionalSignal(signal),
	);
}

export function putAttendance(
	number: number,
	present: number[],
): Promise<void> {
	return mutate(adminPath(`/attendance/${number}`), {
		method: "PUT",
		body: { present },
	});
}
