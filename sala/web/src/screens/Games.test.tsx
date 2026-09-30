import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCsrf, rememberCsrf } from "@/lib/api";
import type { Game, GamesView } from "@/lib/types";
import { Games } from "@/screens/Games";

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

const FROGGER: Game = {
	id: "frogger",
	title: "Frogger",
	type: "emulated",
	system: "arcade",
	year: 1981,
	maker: "Konami",
	about: "Atravesse a rua e o rio para levar o sapo até a casa.",
	controls: [
		{ keys: ["↑", "↓", "←", "→"], action: "pular" },
		{ keys: ["v"], action: "ficha (moeda)" },
	],
	autoScore: true,
	cover: false,
};

/** The one game of our own: no console, so no console badge either. */
const PONG: Game = {
	id: "pong",
	title: "Pong",
	type: "builtin",
	system: null,
	year: 1972,
	maker: "Atari",
	about: "Rebata a bola com a sua raquete.",
	controls: [{ keys: ["↑", "↓"], action: "mover a raquete" }],
	autoScore: true,
	cover: true,
};

const EMPTY_BOARD = { record: null, top: [], myPending: [] };

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * `/jogo` is two screens, and which one it is comes from the server: the mode
 * and the visible games are one answer, so the screen shows what it is given
 * rather than deciding for itself what a kid may play.
 */
describe("the /jogo screen", () => {
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
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			const one = /^\/api\/games\/(.+)$/.exec(path);
			if (one) {
				const found = view.games.find((game) => game.id === one[1]);
				return found
					? jsonResponse(200, found)
					: jsonResponse(404, { error: "Este jogo não está liberado." });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	}

	/** renderGames is the screen as the application mounts it. */
	function renderGames() {
		return render(<Games student={null} onStudentChanged={() => undefined} />);
	}

	it("lists the visible games, with the console and the year", async () => {
		serve({ mode: "free", games: [ENDURO, FROGGER, PONG] });
		renderGames();

		expect(await screen.findByText("Enduro")).toBeTruthy();
		expect(screen.getByText("Frogger")).toBeTruthy();
		// The pt-BR names of the consoles, not the catalogue's code names.
		expect(screen.getByText("Atari 2600")).toBeTruthy();
		expect(screen.getByText("Fliperama")).toBeTruthy();
		expect(screen.getByText("1983")).toBeTruthy();
		// A game of our own has no console to name, so the badge says which it is.
		expect(screen.getByText("Pong")).toBeTruthy();
		expect(screen.getByText("Jogo da sala")).toBeTruthy();
		// A grid, not a game: nothing is embedded until one is chosen.
		expect(document.querySelector("iframe")).toBeNull();
	});

	it("shows the cover of a game that has one, and the console icon otherwise", async () => {
		serve({ mode: "free", games: [ENDURO, FROGGER, PONG] });
		renderGames();

		await screen.findByText("Enduro");

		// The cover is the server's own route: it answers 404 for a game the
		// teacher turned off, so the picture cannot outlive the mode.
		const enduro = screen.getByRole("link", { name: /Enduro/ });
		expect(enduro.querySelector("img")?.getAttribute("src")).toBe(
			"/api/games/enduro/capa",
		);
		// A game whose cover was never downloaded keeps the console icon: a card
		// with a broken image would be worse than no picture.
		const frogger = screen.getByRole("link", { name: /Frogger/ });
		expect(frogger.querySelector("img")).toBeNull();
		// Our own game's cover travels inside the bundle, so it is an asset of
		// this app and not an API route.
		const pong = screen.getByRole("link", { name: /Pong/ });
		expect(pong.querySelector("img")?.getAttribute("src")).toMatch(/pong-capa/);
	});

	it("falls back to the console icon when the cover image fails to load", async () => {
		serve({ mode: "free", games: [ENDURO] });
		renderGames();

		await screen.findByText("Enduro");
		const card = screen.getByRole("link", { name: /Enduro/ });
		const image = card.querySelector("img");
		expect(image).toBeTruthy();

		// A corrupt scan, or a file the teacher removed after the answer
		// arrived: the card keeps the icon rather than a broken picture.
		fireEvent.error(image as HTMLImageElement);

		await waitFor(() => expect(card.querySelector("img")).toBeNull());
		expect(card.querySelector("svg")).toBeTruthy();
	});

	it("opens the active game's page in single mode", async () => {
		serve({ mode: "single", games: [ENDURO] });
		renderGames();

		expect(await screen.findByRole("heading", { name: "Enduro" })).toBeTruthy();
		expect(screen.getByText("Sobre o jogo")).toBeTruthy();
		expect(
			screen.getByText(
				"Corrida de resistência: ultrapasse os carros dia e noite.",
			),
		).toBeTruthy();
		await waitFor(() =>
			expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
				"/emulador/play?game=enduro",
			),
		);
	});

	it("says so, kindly, when no game is visible at all", async () => {
		serve({ mode: "single", games: [] });
		renderGames();

		expect(await screen.findByText(/Nenhum jogo liberado agora/)).toBeTruthy();
		expect(document.querySelector("iframe")).toBeNull();
	});

	it("revalidates when the kid comes back, and falls back to the empty state", async () => {
		serve({ mode: "single", games: [ENDURO] });
		renderGames();
		expect(await screen.findByRole("heading", { name: "Enduro" })).toBeTruthy();

		// The teacher turned the class's game off while the kid was in another
		// tab: nothing else would ever tell this screen.
		serve({ mode: "single", games: [] });
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		expect(await screen.findByText(/Nenhum jogo liberado agora/)).toBeTruthy();
		expect(document.querySelector("iframe")).toBeNull();
	});

	it("leaves the running game alone when the answer did not change", async () => {
		serve({ mode: "single", games: [ENDURO] });
		renderGames();
		expect(await screen.findByRole("heading", { name: "Enduro" })).toBeTruthy();
		const frame = document.querySelector("iframe");

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		// Same game, same frame: reloading here would restart the emulator the
		// kid is playing.
		expect(document.querySelector("iframe")).toBe(frame);
		expect(screen.getByRole("heading", { name: "Enduro" })).toBeTruthy();
	});
});
