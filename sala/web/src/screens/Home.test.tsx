import { act, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCsrf, rememberCsrf } from "@/lib/api";
import type { Game, GamesView, PublicSession } from "@/lib/types";
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

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * The home screen's jogo tile exists only when there is a game to open.
 *
 * What the server answers decides that, and the two answers that mean "no game"
 * are the empty list of the off state and one where nothing is playable: in
 * both, the tile is absent rather than standing in front of an empty screen.
 */
describe("the home screen's jogo tile", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	function serve(view: GamesView): void {
		fetchMock.mockImplementation((path: string) => {
			if (path === "/api/games") return jsonResponse(200, view);
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
});
