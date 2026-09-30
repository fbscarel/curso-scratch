import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, forgetCsrf, rememberCsrf } from "@/lib/api";
import { Identity } from "@/screens/Identity";

const STUDENTS = [
	{ id: 1, name: "Ana Teste" },
	{ id: 2, name: "Bruno Teste" },
	{ id: 3, name: "Carla Teste" },
];

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** goTo puts the browser on the identity screen with a query string. */
function goTo(search: string): void {
	window.history.replaceState({}, "", `/quem-sou-eu${search}`);
}

/** callsTo is every fetch that was sent to one path. */
function callsTo(fetchMock: Mock, path: string): [string, RequestInit][] {
	return fetchMock.mock.calls.filter((call) => call[0] === path) as [
		string,
		RequestInit,
	][];
}

describe("the identity screen", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
		fetchMock.mockImplementation((path: string) => {
			if (path === "/api/students") return jsonResponse(200, STUDENTS);
			if (path === "/api/identity") {
				return Promise.resolve(new Response(null, { status: 204 }));
			}
			return Promise.reject(new Error(`unexpected request to ${path}`));
		});
		goTo("");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		goTo("");
	});

	it("picks a name, writes it to the session, and goes to the sanitized next", async () => {
		goTo("?next=/aulas/aula-03?voltar=1");
		render(<Identity />);

		fireEvent.click(await screen.findByRole("button", { name: /Bruno Teste/ }));

		await waitFor(() =>
			expect(window.location.pathname).toBe("/aulas/aula-03"),
		);
		expect(window.location.search).toBe("?voltar=1");

		const writes = callsTo(fetchMock, "/api/identity");
		expect(writes).toHaveLength(1);
		const [, init] = writes[0] as [string, RequestInit];
		expect(init.method).toBe("PUT");
		expect(JSON.parse(String(init.body))).toEqual({ studentId: 2 });
		expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe("tok-1");
	});

	it("sends a next that points off this origin back to the home screen", async () => {
		goTo("?next=//evil.example");
		render(<Identity />);

		fireEvent.click(await screen.findByRole("button", { name: /Carla Teste/ }));

		await waitFor(() => expect(window.location.pathname).toBe("/"));
		expect(window.location.search).toBe("");
	});

	it("goes home when there is no next at all", async () => {
		render(<Identity />);

		fireEvent.click(await screen.findByRole("button", { name: /Ana Teste/ }));

		await waitFor(() => expect(window.location.pathname).toBe("/"));
	});

	it("asks the teacher to register the class when the list is empty", async () => {
		fetchMock.mockImplementation((path: string) =>
			path === "/api/students"
				? jsonResponse(200, [])
				: Promise.reject(new Error(`unexpected request to ${path}`)),
		);
		render(<Identity />);

		expect(
			await screen.findByText(/Peça para o professor cadastrar a turma/),
		).toBeTruthy();
	});

	it("shows a refusal in Portuguese instead of pretending the name was saved", async () => {
		fetchMock.mockImplementation((path: string) => {
			if (path === "/api/students") return jsonResponse(200, STUDENTS);
			return jsonResponse(422, { error: "Escolha um aluno da lista." });
		});
		render(<Identity />);

		fireEvent.click(await screen.findByRole("button", { name: /Ana Teste/ }));

		expect(await screen.findByText("Escolha um aluno da lista.")).toBeTruthy();
		// It stays put: navigating away from a failed write would look like it
		// had worked.
		expect(window.location.pathname).toBe("/quem-sou-eu");
	});
});
