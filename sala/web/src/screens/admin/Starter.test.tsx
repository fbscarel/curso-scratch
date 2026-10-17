import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, forgetCsrf, rememberCsrf } from "@/lib/api";
import type { AdminStarter } from "@/lib/types";
import { StarterCard } from "@/screens/admin/Starter";

/** The admin path a deployment injects into <head>. */
const BASE = "/professor-kqzt";
const STARTER = `${BASE}/api/starter`;

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** A file the browser would hand over when the teacher picks one. */
function sb3(name: string): File {
	return new File(["conteudo do projeto"], name, {
		type: "application/zip",
	});
}

describe("the admin Projeto da aula card", () => {
	let fetchMock: Mock;
	/** What the server holds, which the two writes change. */
	let held: AdminStarter | null;
	/** The multipart body of the last upload, and what it was sent with. */
	let posted: FormData | null;
	let sent: { method: string; csrf: string | null } | null;
	/** The headers of the last upload, which must not name a content type. */
	let sentHeaders: Headers | null;
	/** How many removals reached the server. */
	let deletes: number;

	beforeEach(() => {
		held = {
			name: "aula-4-pong.sb3",
			size: 84300,
			uploadedAt: "2026-09-29 14:32:05",
		};
		posted = null;
		sent = null;
		sentHeaders = null;
		deletes = 0;
		rememberCsrf("tok-1");
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const meta = document.createElement("meta");
		meta.name = "sala-admin-base";
		meta.content = BASE;
		document.head.append(meta);

		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (path !== STARTER) {
				return jsonResponse(404, { error: `pedido inesperado: ${path}` });
			}
			const method = init?.method ?? "GET";
			const csrf = new Headers(init?.headers).get(CSRF_HEADER);
			if (method === "GET") return jsonResponse(200, held);
			if (method === "POST") {
				const body = init?.body;
				if (!(body instanceof FormData)) {
					return jsonResponse(400, { error: "corpo não é multipart" });
				}
				const file = body.get("file");
				posted = body;
				sent = { method, csrf };
				sentHeaders = new Headers(init?.headers);
				if (!(file instanceof File)) {
					return jsonResponse(422, { error: "Escolha um projeto (.sb3)." });
				}
				held = {
					name: file.name,
					size: file.size,
					uploadedAt: "2026-09-29 15:10:00",
				};
				return jsonResponse(201, held);
			}
			if (method === "DELETE") {
				sent = { method, csrf };
				deletes += 1;
				held = null;
				return new Response(null, { status: 204 });
			}
			return jsonResponse(404, { error: `método inesperado: ${method}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	/** fileInput is the browser's own picker, hidden behind the buttons. */
	function fileInput(): HTMLInputElement {
		const input = document.querySelector('input[type="file"]');
		if (!(input instanceof HTMLInputElement)) {
			throw new Error("a tela não tem input de arquivo");
		}
		return input;
	}

	it("shows the project, its size and when it arrived", async () => {
		render(<StarterCard />);

		expect(await screen.findByText("aula-4-pong.sb3")).toBeTruthy();
		expect(screen.getByText(/82,3 KB/)).toBeTruthy();
		expect(screen.getByText(/29\/09 às 14h32/)).toBeTruthy();
		expect(screen.getByRole("button", { name: /Trocar/ })).toBeTruthy();
	});

	it("offers the file itself as a download", async () => {
		render(<StarterCard />);
		await screen.findByText("aula-4-pong.sb3");

		const link = screen.getByRole("link", { name: /Baixar/ });

		expect(link.getAttribute("href")).toBe("/api/starter/file");
		expect(link.getAttribute("download")).toBe("aula-4-pong.sb3");
	});

	it("sends the file the teacher picks, as the multipart the API reads", async () => {
		render(<StarterCard />);
		await screen.findByText("aula-4-pong.sb3");
		expect(fileInput().getAttribute("accept")).toBe(".sb3");

		fireEvent.change(fileInput(), {
			target: { files: [sb3("aula-5-jogo.sb3")] },
		});

		await waitFor(() => expect(posted).not.toBeNull());
		expect(posted).toBeInstanceOf(FormData);
		const chosen = posted?.get("file");
		if (!(chosen instanceof File))
			throw new Error("o campo file não foi enviado");
		expect(chosen.name).toBe("aula-5-jogo.sb3");
		// The FormData carries its own Content-Type, boundary included: naming
		// JSON here would make the server read the parts as a JSON body.
		const headers = sentHeaders;
		if (headers === null) throw new Error("o pedido não chegou");
		expect(headers.get("Content-Type")).toBeNull();
		expect(sent).toEqual({ method: "POST", csrf: "tok-1" });
		// The card reloads what it changed rather than patching a local copy.
		expect(await screen.findByText("aula-5-jogo.sb3")).toBeTruthy();
	});

	it("replaces the project that was there", async () => {
		render(<StarterCard />);
		await screen.findByText("aula-4-pong.sb3");

		fireEvent.change(fileInput(), {
			target: { files: [sb3("aula-6-jogo.sb3")] },
		});

		expect(await screen.findByText("aula-6-jogo.sb3")).toBeTruthy();
		expect(screen.queryByText("aula-4-pong.sb3")).toBeNull();
	});

	it("removes the project only after the teacher confirms", async () => {
		render(<StarterCard />);
		await screen.findByText("aula-4-pong.sb3");

		fireEvent.click(screen.getByRole("button", { name: "Remover" }));
		expect(await screen.findByText("Remover o projeto da aula?")).toBeTruthy();
		// Nothing is removed while the question is still on the screen.
		expect(deletes).toBe(0);

		fireEvent.click(screen.getByRole("button", { name: "Remover" }));

		await waitFor(() => expect(deletes).toBe(1));
		expect(sent).toEqual({ method: "DELETE", csrf: "tok-1" });
		// The card goes back to the empty state, which is what the kids' screen
		// sees as no tile at all.
		expect(
			await screen.findByRole("button", { name: /Enviar projeto/ }),
		).toBeTruthy();
		expect(screen.queryByText("aula-4-pong.sb3")).toBeNull();
	});

	it("invites the teacher to send one when there is none", async () => {
		held = null;
		render(<StarterCard />);

		expect(
			await screen.findByRole("button", { name: /Enviar projeto/ }),
		).toBeTruthy();
		expect(screen.getByText(/Nenhum projeto ainda/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Remover" })).toBeNull();
		expect(screen.queryByRole("link", { name: /Baixar/ })).toBeNull();
	});
});
