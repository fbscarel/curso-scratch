import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ApiError,
	CSRF_HEADER,
	csrfToken,
	forgetCsrf,
	rememberCsrf,
	setUnauthorizedHandler,
	type UploadProgress,
	uploadFile,
} from "@/lib/api";

/**
 * FakeXhr stands in for the browser's XMLHttpRequest.
 *
 * The upload client uses it and not `fetch` (it is the only way to watch a
 * request body leave), so a test of the client has to drive the same four
 * members the client does: `open`, `setRequestHeader`, `upload.onprogress` and
 * the `load` event. Everything else -- sending bytes, a real socket -- is what
 * this replaces.
 */
class FakeXhr {
	static instances: FakeXhr[] = [];

	readonly upload = new EventTarget();
	withCredentials = false;
	status = 0;
	responseText = "";
	method = "";
	url = "";
	headers: Record<string, string> = {};
	body: FormData | null = null;

	private readonly target = new EventTarget();

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

	send(body?: XMLHttpRequestBodyInit | null): void {
		this.body = body instanceof FormData ? body : null;
		FakeXhr.instances.push(this);
	}

	/** report is one upload progress event, as the browser emits them. */
	report(loaded: number, total: number): void {
		this.upload.dispatchEvent(
			new ProgressEvent("progress", {
				loaded,
				total,
				lengthComputable: true,
			}),
		);
	}

	/** answer is the response the server would have written. */
	answer(status: number, body: unknown): void {
		this.answerText(status, JSON.stringify(body));
	}

	/** answerText is a response that is not the API's JSON at all. */
	answerText(status: number, text: string): void {
		this.status = status;
		this.responseText = text;
		this.target.dispatchEvent(new Event("load"));
	}
}

/**
 * settle waits until the client has opened `count` requests.
 *
 * The client awaits the session's token before it opens anything, so the
 * request is not there the moment `uploadFile` is called.
 */
async function settle(count: number): Promise<void> {
	await vi.waitFor(() => {
		if (FakeXhr.instances.length < count) {
			throw new Error(
				`o cliente abriu ${FakeXhr.instances.length} requisições`,
			);
		}
	});
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const CREATED = {
	id: 7,
	lessonNumber: 3,
	name: "labirinto.sb3",
	size: 2048,
	createdAt: "2026-09-29 14:32:05",
};

describe("the upload client", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		FakeXhr.instances = [];
		fetchMock = vi.fn();
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
		vi.stubGlobal("fetch", fetchMock);
		forgetCsrf();
		rememberCsrf("tok-1");
		setUnauthorizedHandler(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	it("sends the file as multipart with the CSRF header, and reports progress", async () => {
		const file = new File([new Uint8Array(2048)], "labirinto.sb3");
		const progress: UploadProgress[] = [];

		const pending = uploadFile(file, (step) => progress.push(step));
		await settle(1);

		const xhr = FakeXhr.instances[0];
		expect(xhr?.method).toBe("POST");
		expect(xhr?.url).toBe("/api/uploads");
		expect(xhr?.headers[CSRF_HEADER]).toBe("tok-1");
		expect(xhr?.withCredentials).toBe(true);
		// The API reads the file from the `file` field of the multipart body.
		expect(xhr?.body?.get("file")).toBe(file);

		xhr?.report(1024, 2048);
		xhr?.report(2048, 2048);
		expect(progress).toEqual([
			{ loaded: 1024, total: 2048 },
			{ loaded: 2048, total: 2048 },
		]);

		xhr?.answer(201, CREATED);
		await expect(pending).resolves.toEqual(CREATED);
	});

	it("reads a refusal into an ApiError carrying the API's own message", async () => {
		const pending = uploadFile(
			new File([new Uint8Array(4)], "gigante.sb3"),
			() => undefined,
		);
		await settle(1);
		FakeXhr.instances[0]?.answer(413, {
			error: "Arquivo grande demais: o limite é 20 MB por arquivo.",
		});

		const failure = (await pending.catch((e: unknown) => e)) as ApiError;
		expect(failure).toBeInstanceOf(ApiError);
		expect(failure.status).toBe(413);
		expect(failure.message).toBe(
			"Arquivo grande demais: o limite é 20 MB por arquivo.",
		);
	});

	it("falls back to a pt-BR sentence when the answer is not the API's JSON", async () => {
		const pending = uploadFile(
			new File([new Uint8Array(4)], "x.sb3"),
			() => undefined,
		);
		await settle(1);
		FakeXhr.instances[0]?.answerText(502, "<html>502 Bad Gateway</html>");

		const failure = (await pending.catch((e: unknown) => e)) as ApiError;
		expect(failure.status).toBe(502);
		expect(failure.message).toBe(
			"Não foi possível falar com o servidor. Tente de novo.",
		);
	});

	it("reads the session again and retries ONCE when the token no longer matches", async () => {
		fetchMock.mockImplementation(() =>
			jsonResponse(200, {
				csrf: "tok-novo",
				student: null,
				currentLesson: null,
			}),
		);

		const pending = uploadFile(
			new File([new Uint8Array(4)], "x.sb3"),
			() => undefined,
		);
		await settle(1);
		FakeXhr.instances[0]?.answer(400, {
			error: "Requisição inválida: token do formulário errado.",
			code: "csrf",
		});

		await settle(2);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session");
		expect(csrfToken()).toBe("tok-novo");
		const retry = FakeXhr.instances[1];
		expect(retry?.headers[CSRF_HEADER]).toBe("tok-novo");

		retry?.answer(201, CREATED);
		await expect(pending).resolves.toEqual(CREATED);

		// A token refused a second time is not a stale token, so there is no
		// second retry: the client gives up and hands the refusal to the screen.
		const stuck = uploadFile(
			new File([new Uint8Array(4)], "y.sb3"),
			() => undefined,
		);
		await settle(3);
		FakeXhr.instances[2]?.answer(400, {
			error: "Falta o token.",
			code: "csrf",
		});
		await settle(4);
		FakeXhr.instances[3]?.answer(400, {
			error: "Falta o token.",
			code: "csrf",
		});

		const failure = (await stuck.catch((e: unknown) => e)) as ApiError;
		expect(failure).toBeInstanceOf(ApiError);
		expect(failure.message).toBe("Falta o token.");
		expect(FakeXhr.instances).toHaveLength(4);
	});

	it("tells the admin shell about a 401 rather than showing a red box", async () => {
		const seen: string[] = [];
		setUnauthorizedHandler(() => seen.push("volta para o login"));

		const pending = uploadFile(
			new File([new Uint8Array(4)], "x.sb3"),
			() => undefined,
		);
		await settle(1);
		FakeXhr.instances[0]?.answer(401, { error: "Entre de novo." });
		await pending.catch(() => undefined);

		expect(seen).toEqual(["volta para o login"]);
	});
});
