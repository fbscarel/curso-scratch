import { act, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCsrf, rememberCsrf } from "@/lib/api";
import type {
	Game,
	GamesView,
	PublicSession,
	PublicStarter,
} from "@/lib/types";
import { Home } from "@/screens/Home";

const ENDURO: Game = {
	id: "enduro",
	title: "Enduro",
	type: "emulated",
	system: "atari2600",
	year: 1983,
	maker: "Activision",
	about: "Corrida de resistência: ultrapasse os carros dia e noite.",
	controls: [{ keys: ["←", "→"], action: "virar" }],
	autoScore: true,
	cover: true,
};

/** The session the application hands the screen; the lesson is not this test. */
const SESSION: PublicSession = {
	csrf: "tok-1",
	student: null,
	currentLesson: null,
};

/** A music aula: the "Batidas" tile is on the home screen for it alone. */
const MUSIC_SESSION: PublicSession = {
	...SESSION,
	currentLesson: { number: 7, date: "2026-11-03", music: true },
};

const PLAIN_SESSION: PublicSession = {
	...SESSION,
	currentLesson: { number: 5, date: "2026-10-30", music: false },
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * The home screen's tiles.
 *
 * What the server answers decides which of them exist: the jogo tile needs a
 * game to open and the projeto tile needs the teacher to have picked one, and in
 * both cases the answer "there is none" is the tile being ABSENT rather than a
 * card standing in front of an empty screen.
 */
describe("the home screen's tiles", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		rememberCsrf("tok-1");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	/** serve answers the two reads this screen makes; anything else is a bug. */
	function serve(view: GamesView, starter: PublicStarter | null = null): void {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((path: string) => {
			if (path === "/api/games") return jsonResponse(200, view);
			if (path === "/api/starter") return jsonResponse(200, starter);
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	}

	/** renderHome is the screen as the application mounts it. */
	function renderHome() {
		return render(<Home session={SESSION} />);
	}

	it("shows no games tile at all when there is no visible game", async () => {
		serve({ mode: "single", games: [] });
		renderHome();

		// The answer has landed: the rest of the grid is on screen and the jogo
		// is simply absent -- no tile, and no "em breve" card standing in for it.
		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		await act(async () => {});
		expect(screen.getByText("Entregar trabalho")).toBeTruthy();
		expect(document.querySelector('a[href="/jogo"]')).toBeNull();
		expect(screen.queryByText(/em breve/i)).toBeNull();
	});

	it("shows the tile, named after the game, when there is one", async () => {
		serve({ mode: "single", games: [ENDURO] });
		renderHome();

		const tile = await screen.findByRole("link", { name: /Enduro/ });
		expect(tile.getAttribute("href")).toBe("/jogo");
		expect(screen.queryByText(/em breve/i)).toBeNull();
	});

	it("names the whole catalogue in free mode", async () => {
		serve({ mode: "free", games: [ENDURO] });
		renderHome();

		const tile = await screen.findByRole("link", { name: /Jogos/ });
		expect(tile.getAttribute("href")).toBe("/jogo");
	});

	describe("a aula de música", () => {
		it("shows the Batidas tile while the aula is a music class", async () => {
			serve({ mode: "single", games: [ENDURO] });
			render(<Home session={MUSIC_SESSION} />);

			const tile = await screen.findByRole("link", { name: /Batidas/ });

			// A page outside the application, opened by a plain link: the SPA
			// has no route for it.
			expect(tile.getAttribute("href")).toBe("/batidas/");
			// Independent of the game of the day: Aula 6 has both.
			expect(screen.getByRole("link", { name: /Enduro/ })).toBeTruthy();
		});

		it("shows no Batidas tile when the aula is not a music class", async () => {
			serve({ mode: "single", games: [ENDURO] });
			render(<Home session={PLAIN_SESSION} />);

			await waitFor(() => expect(fetchMock).toHaveBeenCalled());
			await act(async () => {});
			expect(screen.getByText("Entregar trabalho")).toBeTruthy();
			expect(screen.queryByText("Batidas")).toBeNull();
			expect(document.querySelector('a[href="/batidas/"]')).toBeNull();
		});
	});

	describe("o projeto da aula", () => {
		const STARTER: PublicStarter = {
			name: "Aula 4 - Pong.sb3",
			uploadedAt: "2026-09-29 14:32:05",
			url: "/api/starter/file",
		};

		it("shows no tile when the teacher has not picked a project", async () => {
			serve({ mode: "single", games: [ENDURO] }, null);
			renderHome();

			await waitFor(() => expect(fetchMock).toHaveBeenCalled());
			await act(async () => {});
			expect(screen.getByText("Entregar trabalho")).toBeTruthy();
			expect(screen.queryByText("Projeto da aula")).toBeNull();
			expect(document.querySelector('a[href="/api/starter/file"]')).toBeNull();
		});

		it("links straight to the file, named after the project", async () => {
			serve({ mode: "single", games: [] }, STARTER);
			renderHome();

			const tile = await screen.findByRole("link", {
				name: /Projeto da aula/,
			});

			// A plain link the browser follows: no client routing to turn the
			// click into a request this page reads, and no `download` attribute
			// -- what the browser does with the file is the server's answer.
			expect(tile.getAttribute("href")).toBe("/api/starter/file");
			expect(tile.getAttribute("download")).toBeNull();
			expect(tile.textContent).toContain("Aula 4 - Pong");
			expect(tile.textContent).not.toContain(".sb3");
		});

		it("puts the tile first in the grid", async () => {
			serve({ mode: "single", games: [ENDURO] }, STARTER);
			renderHome();

			await screen.findByRole("link", { name: /Projeto da aula/ });
			const tiles = Array.from(document.querySelectorAll("a"));
			expect(
				tiles.findIndex((tile) =>
					(tile.textContent ?? "").includes("Projeto da aula"),
				),
			).toBe(0);
			expect(
				tiles.findIndex((tile) => (tile.textContent ?? "").includes("Enduro")),
			).toBe(1);
		});
	});
});
