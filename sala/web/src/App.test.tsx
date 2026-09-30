import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { forgetCsrf, rememberCsrf } from "@/lib/api";

/**
 * The two screens that need an identity before they mean anything.
 *
 * The guard lives in the application and not in the screens (the session it
 * redirects on is the application's), so this is where it is driven: the URL a
 * kid typed, the name cards they land on, and the way back.
 */
const STUDENTS = [
	{ id: 1, name: "Ana Teste" },
	{ id: 2, name: "Bruno Teste" },
];

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function goTo(path: string): void {
	window.history.replaceState({}, "", path);
}

describe("a screen that needs an identity", () => {
	let fetchMock: Mock;
	/** The student this browser has picked, which is the whole session state. */
	let signedIn: number | null;

	beforeEach(() => {
		fetchMock = vi.fn();
		signedIn = null;
		rememberCsrf("tok-1");
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (path === "/api/session") {
				const student = STUDENTS.find((s) => s.id === signedIn) ?? null;
				return jsonResponse(200, {
					csrf: "tok-1",
					student,
					currentLesson: { number: 3, date: "2026-09-22" },
				});
			}
			if (path === "/api/students") return jsonResponse(200, STUDENTS);
			if (path === "/api/my-uploads") return jsonResponse(200, []);
			if (path === "/api/identity" && init?.method === "PUT") {
				const body: unknown = JSON.parse(String(init.body));
				signedIn = Number((body as { studentId?: unknown }).studentId ?? null);
				return new Response(null, { status: 204 });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		goTo("/");
	});

	it("sends a kid who has not said who they are to the name cards, with the way back", async () => {
		goTo("/entregar");
		render(<App />);

		await waitFor(() => expect(window.location.pathname).toBe("/quem-sou-eu"));
		expect(window.location.search).toBe("?next=%2Fentregar");
	});

	it("does the same for Meus arquivos, with that screen as the way back", async () => {
		goTo("/meus-arquivos");
		render(<App />);

		await waitFor(() => expect(window.location.pathname).toBe("/quem-sou-eu"));
		expect(window.location.search).toBe("?next=%2Fmeus-arquivos");
	});

	it("comes back to where the kid was going once they pick a name", async () => {
		goTo("/entregar");
		render(<App />);

		fireEvent.click(await screen.findByRole("button", { name: /Ana Teste/ }));

		await waitFor(() => expect(window.location.pathname).toBe("/entregar"));
		expect(await screen.findByText("Entregar trabalho")).toBeTruthy();
	});

	it("leaves a kid who already said who they are on the screen they opened", async () => {
		signedIn = 2;
		goTo("/meus-arquivos");
		render(<App />);

		expect(await screen.findByText("Meus arquivos")).toBeTruthy();
		expect(window.location.pathname).toBe("/meus-arquivos");
	});
});
