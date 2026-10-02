import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, forgetCsrf, rememberCsrf } from "@/lib/api";
import type { AdminGame } from "@/lib/types";
import { GamesAdmin } from "@/screens/admin/Games";

/** The admin path a deployment injects into <head>. */
const BASE = "/professor-kqzt";

const CATALOGUE: AdminGame[] = [
	{
		id: "enduro",
		title: "Enduro",
		type: "emulated",
		system: "atari2600",
		core: "stella2014",
		year: 1983,
		maker: "Activision",
		playable: true,
		missing: null,
		cover: true,
	},
	{
		id: "super-mario-world",
		title: "Super Mario World",
		type: "emulated",
		system: "snes",
		core: "snes9x",
		year: 1990,
		maker: "Nintendo",
		playable: false,
		missing: "rom",
		cover: false,
	},
	{
		id: "sonic-the-hedgehog",
		title: "Sonic the Hedgehog",
		type: "emulated",
		system: "genesis",
		core: "genesis_plus_gx",
		year: 1991,
		maker: "Sega",
		playable: false,
		missing: "core",
		cover: false,
	},
];

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("the admin Jogos screen", () => {
	let fetchMock: Mock;
	/** The settings the server would be holding, which the PUT changes. */
	let stored: { activeGame: string | null; freeMode: boolean };
	/** The catalogue the server would be answering with. */
	let catalogue: AdminGame[];
	/** Whether the server refuses the next mode write (a 422). */
	let refuseWrite: boolean;
	/**
	 * A held-open answer for `GET /api/games`.
	 *
	 * The write triggers a reload, and the bug this guards against only shows
	 * while that reload is IN FLIGHT: the screen stamped the settings of the
	 * payload from before the PUT over what it had just written. Holding the
	 * answer is what makes the moment deterministic -- an answer that lands
	 * before the screen looks for it hides the whole thing.
	 */
	let held: { promise: Promise<Response>; open: () => void } | null;

	beforeEach(() => {
		stored = { activeGame: "enduro", freeMode: false };
		catalogue = CATALOGUE;
		refuseWrite = false;
		held = null;
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
		const meta = document.createElement("meta");
		meta.name = "sala-admin-base";
		meta.content = BASE;
		document.head.append(meta);

		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (path === `${BASE}/api/games` && (init?.method ?? "GET") === "GET") {
				if (held) return held.promise;
				return jsonResponse(200, { ...stored, games: catalogue });
			}
			if (path === `${BASE}/api/games/mode` && init?.method === "PUT") {
				if (refuseWrite) {
					return jsonResponse(422, { error: "Jogo não está pronto." });
				}
				stored = JSON.parse(String(init.body)) as typeof stored;
				return new Response(null, { status: 204 });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	/** What the screen is showing for a mode button: its pressed state. */
	function modePressed(name: string): string | null {
		return screen.getByRole("button", { name }).getAttribute("aria-pressed");
	}

	/** The body of the mode write the screen sent. */
	function putBody(): { activeGame: string | null; freeMode: boolean } {
		const [, init] = fetchMock.mock.calls.find(
			(call) => call[0] === `${BASE}/api/games/mode`,
		) as [string, RequestInit];
		return JSON.parse(String(init.body)) as {
			activeGame: string | null;
			freeMode: boolean;
		};
	}

	it("writes both settings in one PUT when the mode is switched", async () => {
		render(<GamesAdmin />);

		fireEvent.click(await screen.findByRole("button", { name: "Modo livre" }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				`${BASE}/api/games/mode`,
				expect.objectContaining({ method: "PUT" }),
			),
		);
		const [, init] = fetchMock.mock.calls.find(
			(call) => call[0] === `${BASE}/api/games/mode`,
		) as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({
			activeGame: "enduro",
			freeMode: true,
		});
		expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe("tok-1");
		expect(stored).toEqual({ activeGame: "enduro", freeMode: true });
	});

	it("picks a playable game when single mode is turned on with nothing chosen", async () => {
		// Otherwise "Um jogo" would turn every game off, and the kids would see
		// the empty state until the teacher noticed.
		stored = { activeGame: "super-mario-world", freeMode: true };
		render(<GamesAdmin />);

		fireEvent.click(await screen.findByRole("button", { name: "Um jogo" }));

		await waitFor(() => expect(stored.freeMode).toBe(false));
		// `super-mario-world` has no ROM, so the server would refuse it: the
		// first playable entry stands in.
		expect(stored.activeGame).toBe("enduro");
	});

	it("turns every game off when Desligados is clicked", async () => {
		render(<GamesAdmin />);

		fireEvent.click(await screen.findByRole("button", { name: "Desligados" }));

		// `activeGame` is the field that moves: the stored game is dropped, which
		// is the half of the off state the teacher could not reach before.
		await waitFor(() => expect(stored.activeGame).toBeNull());
		const [, init] = fetchMock.mock.calls.find(
			(call) => call[0] === `${BASE}/api/games/mode`,
		) as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({
			activeGame: null,
			freeMode: false,
		});
		await waitFor(() => expect(modePressed("Desligados")).toBe("true"));
		expect(modePressed("Um jogo")).toBe("false");
		expect(modePressed("Modo livre")).toBe("false");
		expect(stored).toEqual({ activeGame: null, freeMode: false });
		expect(
			screen.getByText(
				"Os jogos estão desligados: a turma não vê jogos na página inicial.",
			),
		).toBeTruthy();
	});

	it("shows Desligados as the stored mode when the games are off", async () => {
		stored = { activeGame: null, freeMode: false };
		render(<GamesAdmin />);

		expect(await screen.findByText("Pronto")).toBeTruthy();
		await waitFor(() => expect(modePressed("Desligados")).toBe("true"));
		expect(modePressed("Um jogo")).toBe("false");
		expect(modePressed("Modo livre")).toBe("false");
	});

	it("turns single mode on from off with the first playable game", async () => {
		// The way back from off: "Um jogo" has to name a game for the teacher,
		// because an empty active game with no free mode is off again.
		stored = { activeGame: null, freeMode: false };
		render(<GamesAdmin />);
		await screen.findByText("Pronto");

		fireEvent.click(screen.getByRole("button", { name: "Um jogo" }));

		await waitFor(() => expect(modePressed("Um jogo")).toBe("true"));
		expect(putBody()).toEqual({ activeGame: "enduro", freeMode: false });
		expect(stored).toEqual({ activeGame: "enduro", freeMode: false });
		expect(modePressed("Desligados")).toBe("false");
		expect(modePressed("Modo livre")).toBe("false");
	});

	it("frees the catalogue from off without naming a game", async () => {
		stored = { activeGame: null, freeMode: false };
		render(<GamesAdmin />);
		await screen.findByText("Pronto");

		fireEvent.click(screen.getByRole("button", { name: "Modo livre" }));

		await waitFor(() => expect(modePressed("Modo livre")).toBe("true"));
		expect(putBody()).toEqual({ activeGame: null, freeMode: true });
		expect(stored).toEqual({ activeGame: null, freeMode: true });
		expect(modePressed("Um jogo")).toBe("false");
		expect(modePressed("Desligados")).toBe("false");
	});

	it("keeps Um jogo disabled while no game can be played", async () => {
		// With nothing playable, "Um jogo" could only write the off state again
		// and leave the screen saying the games are off, so it is disabled --
		// and "Nenhum jogo pronto" is what says why.
		stored = { activeGame: null, freeMode: false };
		catalogue = CATALOGUE.filter((game) => !game.playable);
		render(<GamesAdmin />);

		expect(await screen.findByText(/Nenhum jogo pronto/)).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "Um jogo" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		// "Modo livre" is the way out of off with nothing playable, so it stays
		// live.
		expect(
			(screen.getByRole("button", { name: "Modo livre" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	it("keeps the mode the teacher chose while the reload is in flight", async () => {
		// The write reloads the catalogue, and the reload's answer is what the
		// seed effect copies the settings from. Reading the write's own (void)
		// answer as a refusal re-seeded the screen from the payload of BEFORE
		// the PUT, leaving the buttons showing the mode the teacher had just
		// left -- with the server holding the new one.
		render(<GamesAdmin />);
		await screen.findByText("Pronto");

		const answer = Promise.withResolvers<Response>();
		held = {
			promise: answer.promise,
			open: () =>
				answer.resolve(jsonResponse(200, { ...stored, games: catalogue })),
		};

		fireEvent.click(screen.getByRole("button", { name: "Modo livre" }));
		await waitFor(() => expect(stored.freeMode).toBe(true));
		// Every reply the screen has to the write has run by now, with the reload
		// it triggered still in flight: this is the moment the buttons used to
		// fall back to the setting the teacher had just left.
		await act(async () => {});

		expect(modePressed("Modo livre")).toBe("true");
		expect(modePressed("Um jogo")).toBe("false");

		held.open();
		await waitFor(() => expect(modePressed("Modo livre")).toBe("true"));
		expect(stored).toEqual({ activeGame: "enduro", freeMode: true });
	});

	it("puts the stored mode back when the server refuses the write", async () => {
		refuseWrite = true;
		render(<GamesAdmin />);

		fireEvent.click(await screen.findByRole("button", { name: "Modo livre" }));

		expect(await screen.findByText("Jogo não está pronto.")).toBeTruthy();
		await waitFor(() =>
			expect(
				screen
					.getByRole("button", { name: "Um jogo" })
					.getAttribute("aria-pressed"),
			).toBe("true"),
		);
		expect(
			screen
				.getByRole("button", { name: "Modo livre" })
				.getAttribute("aria-pressed"),
		).toBe("false");
		expect(stored).toEqual({ activeGame: "enduro", freeMode: false });
	});

	it("shows the stored game even when it cannot be played anymore", async () => {
		// The ROM drive was there yesterday and is not today: the teacher's
		// choice is still stored, and a select built from the playable games
		// alone would show an empty box, as if no game were chosen.
		stored = { activeGame: "super-mario-world", freeMode: false };
		render(<GamesAdmin />);

		const select = await screen.findByLabelText("Jogo ativo");
		await waitFor(() =>
			expect(select.textContent).toContain("Super Mario World"),
		);
		expect(select.textContent).not.toContain("Escolha um jogo");
		expect(screen.getByText(/Super Mario World está sem a ROM\./)).toBeTruthy();
	});

	it("shows a small cover for the games that have one, and says when there is none", async () => {
		render(<GamesAdmin />);

		expect(await screen.findByText("Pronto")).toBeTruthy();

		const shown = [...document.querySelectorAll("table img")].map((image) =>
			image.getAttribute("src"),
		);
		// The admin route and not the public one: the table lists the whole
		// catalogue, and the public route 404s for the games the kids cannot see.
		expect(shown).toEqual([`${BASE}/api/games/enduro/capa`]);
		expect(screen.getAllByText("sem capa")).toHaveLength(2);
	});

	it("says 'sem capa' when the cover image fails to load", async () => {
		render(<GamesAdmin />);

		expect(await screen.findByText("Pronto")).toBeTruthy();
		const image = document.querySelector("table img") as HTMLImageElement;

		fireEvent.error(image);

		await waitFor(() => expect(document.querySelector("table img")).toBeNull());
		expect(screen.getAllByText("sem capa")).toHaveLength(3);
	});

	it("shows why an entry cannot be played, for every entry", async () => {
		render(<GamesAdmin />);

		expect(await screen.findByText("Pronto")).toBeTruthy();
		expect(screen.getByText("Falta ROM")).toBeTruthy();
		expect(screen.getByText("Falta emulador")).toBeTruthy();
		// The whole catalogue, not only the games the kids can see.
		expect(screen.getByText("Super Mario World")).toBeTruthy();
		expect(screen.getByText("Sonic the Hedgehog")).toBeTruthy();
		expect(screen.getByText("Super Nintendo")).toBeTruthy();
		expect(screen.getByText("Mega Drive")).toBeTruthy();
	});
});
