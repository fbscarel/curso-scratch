import { act, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCsrf, rememberCsrf } from "@/lib/api";
import type { Game } from "@/lib/types";
import { GamePlay } from "@/screens/GamePlay";

const ENDURO: Game = {
	id: "enduro",
	title: "Enduro",
	type: "emulated",
	system: "atari2600",
	year: 1983,
	maker: "Activision",
	about: "Corrida de resistência: ultrapasse os carros dia e noite.",
	controls: [{ keys: ["←", "→"], action: "virar" }],
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * What the emulator page says to the screen, and what the screen does with it.
 *
 * The messages are dispatched exactly as the browser delivers them -- with the
 * frame as `source` and the page's own origin -- because that pair is what the
 * screen checks before it believes any of them.
 */
describe("the game page", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ENDURO));
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	/** post says what the emulator page would say, from the frame it says it from. */
	async function post(data: unknown, from: MessageEventSource | null) {
		const event = new MessageEvent("message", {
			data,
			origin: window.location.origin,
		});
		Object.defineProperty(event, "source", { value: from });
		// The listener is the screen's, so dispatching is a state update.
		await act(async () => {
			window.dispatchEvent(event);
		});
	}

	/** theFrame is the iframe the emulator runs in, once the screen showed it. */
	async function theFrame(): Promise<HTMLIFrameElement> {
		// The frame is rendered from the answer to GET /api/games/<id>, so it is
		// not there on the first paint.
		return await waitFor(() => {
			const frame = document.querySelector("iframe");
			if (!frame) throw new Error("no iframe on the screen yet");
			return frame;
		});
	}

	it("embeds the emulator page and says what it is doing until the game boots", async () => {
		render(<GamePlay id="enduro" />);

		expect(await screen.findByRole("heading", { name: "Enduro" })).toBeTruthy();
		const frame = await theFrame();
		expect(frame.getAttribute("src")).toBe("/emulador/play?game=enduro");
		expect(frame.getAttribute("allow")).toBe("fullscreen; gamepad; autoplay");
		// The panel: what the game is, and the keys that are actually in effect.
		expect(screen.getByText("1983 · Activision")).toBeTruthy();
		expect(screen.getByText("Sobre o jogo")).toBeTruthy();
		expect(screen.getByText("Controles")).toBeTruthy();
		expect(screen.getByText("virar")).toBeTruthy();
		expect(screen.getByText("←")).toBeTruthy();
		// The placar is filled in later; the space is marked now.
		expect(screen.getByText("Placar")).toBeTruthy();
		expect(screen.getByText("Tela cheia")).toBeTruthy();
		expect(screen.getByText(/Ligando o emulador/)).toBeTruthy();
	});

	it("takes the overlay off when the game starts, and puts it back on a boot", async () => {
		render(<GamePlay id="enduro" />);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		// The keyboard hint is for a running game: while the emulator boots, the
		// overlay is what the kid reads.
		expect(screen.queryByText(/Use o teclado para jogar/)).toBeNull();

		await post({ type: "sala:ready" }, frame.contentWindow);
		expect(await screen.findByText(/Preparando o jogo/)).toBeTruthy();

		await post({ type: "sala:started" }, frame.contentWindow);
		await waitFor(() =>
			expect(screen.queryByText(/Ligando o emulador/)).toBeNull(),
		);
		expect(screen.queryByText(/Preparando o jogo/)).toBeNull();
		expect(screen.getByText(/Use o teclado para jogar/)).toBeTruthy();
	});

	it("believes nothing from another origin, or from another frame", async () => {
		render(<GamePlay id="enduro" />);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		// Another page of this origin says the game started: not our frame.
		await post({ type: "sala:started" }, window);
		// The frame itself, but the message is from an origin we did not serve.
		const foreign = new MessageEvent("message", {
			data: { type: "sala:started" },
			origin: "https://evil.example",
		});
		Object.defineProperty(foreign, "source", {
			value: frame.contentWindow,
		});
		// Awaited `act`, not a bare dispatch: the listener is a state update, and
		// an assertion that runs before React has committed passes either way --
		// which is how this test stayed green with the origin check deleted.
		await act(async () => {
			window.dispatchEvent(foreign);
		});

		expect(screen.getByText(/Ligando o emulador/)).toBeTruthy();
	});

	it("shows the pt-BR sentence the page sent when the game cannot start", async () => {
		render(<GamePlay id="enduro" />);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await post(
			{
				type: "sala:error",
				message: "Emulador não instalado: rode just sala-emulador.",
			},
			frame.contentWindow,
		);

		expect(
			await screen.findByText(
				"Emulador não instalado: rode just sala-emulador.",
			),
		).toBeTruthy();
		expect(screen.queryByText(/Ligando o emulador/)).toBeNull();
	});

	it("drops the error card once the game is actually running", async () => {
		// The page reports every rejection, including fetches nothing depends
		// on, so an error can arrive and the game can still boot. A red card
		// over a game the kid is playing would be a lie.
		render(<GamePlay id="enduro" />);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await post(
			{ type: "sala:error", message: "Não consegui iniciar o emulador." },
			frame.contentWindow,
		);
		expect(
			await screen.findByText("Não consegui iniciar o emulador."),
		).toBeTruthy();

		await post({ type: "sala:ready" }, frame.contentWindow);
		await post({ type: "sala:started" }, frame.contentWindow);

		await waitFor(() =>
			expect(screen.queryByText("Não consegui iniciar o emulador.")).toBeNull(),
		);
		expect(screen.queryByText("Algo deu errado")).toBeNull();
	});

	it("shows the empty state when the game stops being visible behind the screen", async () => {
		render(<GamePlay id="enduro" />);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		// The kid comes back to the tab and the teacher has turned this game off
		// in the meantime: the server answers 404, which is the empty state.
		fetchMock.mockResolvedValue(
			jsonResponse(404, { error: "Este jogo não está liberado." }),
		);
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		expect(
			await screen.findByText(/Este jogo não está liberado agora/),
		).toBeTruthy();
		expect(document.querySelector("iframe")).toBeNull();
	});

	it("leaves the running game alone when the kid comes back to it", async () => {
		render(<GamePlay id="enduro" />);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		// The same game is the same frame, and the emulator inside it is not torn
		// down: a reload here would restart the game from the title screen.
		expect(document.querySelector("iframe")).toBe(frame);
	});

	it("sends a kid to the list when the game is not in the catalogue", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(404, { error: "Este jogo não está liberado." }),
		);
		render(<GamePlay id="nao-existe" />);

		expect(
			await screen.findByText(/Este jogo não está liberado agora/),
		).toBeTruthy();
	});
});
