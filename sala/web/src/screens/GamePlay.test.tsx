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
import type { Game, Scoreboard, Student } from "@/lib/types";
import { GamePlay } from "@/screens/GamePlay";

/**
 * The game of our own, stood in for.
 *
 * A builtin game draws into a canvas and reads the keyboard, none of which
 * jsdom has: what this file is about is the screen AROUND the game -- who
 * a finished game's pontuação is filed for, and what the screen does with the
 * answer -- so the game is replaced by a button that ends one.
 */
vi.mock("@/games/pong/PongGame", () => {
	const Over = ({
		onGameOver,
		onStart,
	}: {
		onGameOver: (score: number) => void;
		onStart?: () => void;
	}) => (
		<>
			<button type="button" onClick={() => onStart?.()}>
				jogar de novo
			</button>
			<button type="button" onClick={() => onGameOver(7)}>
				fim de jogo de mentira
			</button>
			<button type="button" onClick={() => onGameOver(1)}>
				fim de jogo de um ponto
			</button>
		</>
	);
	return { PongGame: Over, default: Over };
});

/** The burst a finished game earns, which jsdom has no canvas for. */
vi.mock("canvas-confetti", () => {
	const celebrate = vi.fn();
	return {
		default: Object.assign(celebrate, { create: vi.fn(() => celebrate) }),
	};
});

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

/** An emulated game whose catalogue entry has no score block: nothing to read. */
const GALAGA: Game = {
	id: "galaga",
	title: "Galaga",
	type: "emulated",
	system: "arcade",
	year: 1981,
	maker: "Namco",
	about: "Pilote a nave e destrua as ondas de alienígenas.",
	controls: [{ keys: ["←", "→"], action: "mover" }],
	autoScore: false,
	cover: false,
};

const ANA: Student = { id: 1, name: "Ana Teste" };
const BRUNO: Student = { id: 2, name: "Bruno Teste" };

const EMPTY_BOARD: Scoreboard = { record: null, top: [], myPending: [] };

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
	/** What `POST /api/scores` was called with, in order. */
	let posted: unknown[];

	beforeEach(() => {
		posted = [];
		rememberCsrf("tok-1");
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/pong") return jsonResponse(200, PONG);
			if (path === "/api/games/enduro") return jsonResponse(200, ENDURO);
			if (path === "/api/games/galaga") return jsonResponse(200, GALAGA);
			if (path === "/api/students") {
				return jsonResponse(200, [ANA, BRUNO]);
			}
			if (path === "/api/identity" && init?.method === "PUT") {
				return new Response(null, { status: 204 });
			}
			if (path === "/api/scores" && init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				return jsonResponse(201, { id: 1, score: 7, approved: true });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	/** renderGame is the screen as the application mounts it, with a name picked. */
	function renderGame(id: string, student: Student | null = ANA) {
		return render(
			<GamePlay id={id} student={student} onStudentChanged={() => undefined} />,
		);
	}

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

	it("shows the cover of the game in the panel", async () => {
		renderGame("enduro");

		expect(await screen.findByRole("heading", { name: "Enduro" })).toBeTruthy();
		expect(document.querySelector("aside img")?.getAttribute("src")).toBe(
			"/api/games/enduro/capa",
		);
	});

	it("leaves the panel without a picture for a game that has no cover", async () => {
		// The covers are downloaded once per laptop and are in no repository, so
		// a game without one is a normal thing to find.
		renderGame("galaga");

		expect(await screen.findByRole("heading", { name: "Galaga" })).toBeTruthy();
		expect(document.querySelector("aside img")).toBeNull();
	});

	it("embeds the emulator page and says what it is doing until the game boots", async () => {
		renderGame("enduro");

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
		renderGame("enduro");
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
		renderGame("enduro");
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
		renderGame("enduro");
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
		renderGame("enduro");
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
		renderGame("enduro");
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
		renderGame("enduro");
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
		renderGame("nao-existe");

		expect(
			await screen.findByText(/Este jogo não está liberado agora/),
		).toBeTruthy();
	});
});

/**
 * An emulated game that counts its own pontuação.
 *
 * The page reads the score out of the core's memory once a second and sends it;
 * what the screen does with those samples is the whole flow: show the number
 * while a match runs, keep the last one it could read, and file it when the
 * match ends -- once, and only when there is a number to file.
 */
describe("an emulated game that reads its own score", () => {
	let fetchMock: Mock;
	/** What `POST /api/scores` was called with, in order. */
	let posted: unknown[];

	beforeEach(() => {
		posted = [];
		rememberCsrf("tok-1");
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/enduro") return jsonResponse(200, ENDURO);
			if (path === "/api/games/galaga") return jsonResponse(200, GALAGA);
			if (path === "/api/students") return jsonResponse(200, [ANA, BRUNO]);
			if (path === "/api/identity" && init?.method === "PUT") {
				return new Response(null, { status: 204 });
			}
			if (path === "/api/scores" && init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				return jsonResponse(201, { id: 1, score: 30, approved: true });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	/** renderGame is the screen as the application mounts it. */
	function renderGame(id: string, student: Student | null = ANA) {
		return render(
			<GamePlay id={id} student={student} onStudentChanged={() => undefined} />,
		);
	}

	/** sample is one `sala:score` the page would send, from the frame it sends it from. */
	async function sample(
		from: MessageEventSource | null,
		inGame: boolean,
		score: number | null,
	) {
		const event = new MessageEvent("message", {
			data: { type: "sala:score", inGame, score },
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
		return await waitFor(() => {
			const frame = document.querySelector("iframe");
			if (!frame) throw new Error("no iframe on the screen yet");
			return frame;
		});
	}

	it("shows the score while a match runs, and files it once when the match ends", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		// The attract screen: no match, so nothing to latch and nothing to show.
		await sample(frame.contentWindow, false, 0);
		expect(screen.queryByText("Pontos agora")).toBeNull();

		await sample(frame.contentWindow, true, 10);
		expect(await screen.findByText("Pontos agora")).toBeTruthy();
		expect(screen.getByText("10 pontos")).toBeTruthy();

		await sample(frame.contentWindow, true, 30);
		expect(await screen.findByText("30 pontos")).toBeTruthy();

		await sample(frame.contentWindow, false, 30);

		expect(await screen.findByText("Fim de jogo!")).toBeTruthy();
		expect(screen.getByText("Você fez 30 pontos 🎉")).toBeTruthy();
		await waitFor(() =>
			expect(posted).toEqual([{ gameId: "enduro", score: 30, method: "auto" }]),
		);
		// Once, and the live number goes with the match.
		expect(posted).toHaveLength(1);
		expect(screen.queryByText("Pontos agora")).toBeNull();
	});

	it("files one match once, however many samples the ended match still sends", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await sample(frame.contentWindow, true, 30);
		await sample(frame.contentWindow, false, 30);
		await waitFor(() => expect(posted).toHaveLength(1));

		// The page keeps sampling after the match is over -- the attract screen
		// reads the demo's own score -- and none of those is the match's result
		// again: the latch went with the number that was filed.
		await sample(frame.contentWindow, false, 30);
		await sample(frame.contentWindow, false, 30);

		expect(posted).toHaveLength(1);
	});

	it("files nothing for an attract sequence that writes a score", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		// The attract demo plays by itself and writes a score into the same
		// memory; with no match running it is not the kid's.
		await sample(frame.contentWindow, false, 1580);

		expect(screen.queryByText("Pontos agora")).toBeNull();
		expect(screen.queryByText("Fim de jogo!")).toBeNull();
		expect(posted).toEqual([]);
	});

	it("keeps the last score it could read when a sample has no number", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await sample(frame.contentWindow, true, 30);
		expect(await screen.findByText("30 pontos")).toBeTruthy();

		// A sample that could not be read is skipped, not read as zero.
		await sample(frame.contentWindow, true, null);
		expect(screen.getByText("30 pontos")).toBeTruthy();

		await sample(frame.contentWindow, false, null);
		await waitFor(() =>
			expect(posted).toEqual([{ gameId: "enduro", score: 30, method: "auto" }]),
		);
	});

	it("files the next match too, and nothing for a match that never scored", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await sample(frame.contentWindow, true, 10);
		await sample(frame.contentWindow, false, 10);
		await waitFor(() => expect(posted).toHaveLength(1));

		// A second match: the card goes and the latch starts empty.
		await sample(frame.contentWindow, true, 5);
		await waitFor(() => expect(screen.queryByText("Fim de jogo!")).toBeNull());
		expect(screen.getByText("5 pontos")).toBeTruthy();
		await sample(frame.contentWindow, false, 5);
		await waitFor(() => expect(posted).toHaveLength(2));

		// A match that ends without scoring files nothing.
		await sample(frame.contentWindow, true, 0);
		await sample(frame.contentWindow, false, 0);
		expect(posted).toHaveLength(2);
		expect(posted).toEqual([
			{ gameId: "enduro", score: 10, method: "auto" },
			{ gameId: "enduro", score: 5, method: "auto" },
		]);
	});

	it("files nothing for a new match whose samples carry no score", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await sample(frame.contentWindow, true, 30);
		await sample(frame.contentWindow, false, 30);
		await waitFor(() => expect(posted).toHaveLength(1));
		expect(await screen.findByText("Você fez 30 pontos 🎉")).toBeTruthy();

		// A new match that never manages to read a number: the last match's 30
		// is not this one's, on the screen or in a file.
		await sample(frame.contentWindow, true, null);
		expect(screen.queryByText("Pontos agora")).toBeNull();
		expect(screen.queryByText("Você fez 30 pontos 🎉")).toBeNull();

		await sample(frame.contentWindow, false, null);

		expect(posted).toHaveLength(1);
	});

	it("ignores the samples of a game that cannot report its own", async () => {
		renderGame("galaga");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await sample(frame.contentWindow, true, 30);
		await sample(frame.contentWindow, false, 30);

		expect(screen.queryByText("Pontos agora")).toBeNull();
		expect(screen.queryByText("Fim de jogo!")).toBeNull();
		expect(posted).toEqual([]);
	});

	it("ignores a score sample from an origin that is not ours", async () => {
		renderGame("enduro");
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		const foreign = new MessageEvent("message", {
			data: { type: "sala:score", inGame: true, score: 99 },
			origin: "https://evil.example",
		});
		Object.defineProperty(foreign, "source", { value: frame.contentWindow });
		await act(async () => {
			window.dispatchEvent(foreign);
		});

		expect(screen.queryByText("Pontos agora")).toBeNull();
		expect(posted).toEqual([]);
	});

	it("asks who the kid is, and files the match's score after they pick a name", async () => {
		renderGame("enduro", null);
		const frame = await theFrame();
		await waitFor(() => expect(frame.contentWindow).toBeTruthy());

		await sample(frame.contentWindow, true, 40);
		await sample(frame.contentWindow, false, 40);

		expect(
			await screen.findByText(/Quem é você\? Escolha o seu nome/),
		).toBeTruthy();
		expect(screen.getByText("Você fez 40 pontos 🎉")).toBeTruthy();
		// Nothing is filed until there is a name to file it under.
		expect(posted).toEqual([]);

		fireEvent.click(await screen.findByRole("button", { name: /Bruno Teste/ }));

		await waitFor(() =>
			expect(posted).toEqual([{ gameId: "enduro", score: 40, method: "auto" }]),
		);
	});
});

/**
 * The game of our own, and what a finished one does to the placar.
 *
 * The game renders here instead of an iframe, reports its own end, and its
 * pontuação is filed as an automatic one -- which is the whole difference from
 * an emulated game, where a kid types the number in and waits for the teacher.
 */
describe("a game of our own", () => {
	let fetchMock: Mock;
	/** What `POST /api/scores` was called with, in order. */
	let posted: unknown[];

	beforeEach(() => {
		posted = [];
		rememberCsrf("tok-1");
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/pong") return jsonResponse(200, PONG);
			if (path === "/api/students") return jsonResponse(200, [ANA, BRUNO]);
			if (path === "/api/identity" && init?.method === "PUT") {
				return new Response(null, { status: 204 });
			}
			if (path === "/api/scores" && init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				return jsonResponse(201, { id: 1, score: 7, approved: true });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	function callsTo(path: string): number {
		return fetchMock.mock.calls.filter((call) => call[0] === path).length;
	}

	it("renders the game in the main area instead of an emulator frame", async () => {
		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);

		expect(await screen.findByRole("heading", { name: "Pong" })).toBeTruthy();
		expect(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		).toBeTruthy();
		expect(document.querySelector("iframe")).toBeNull();
		// No console to name, so the badge says whose game this is.
		expect(screen.getByText("Jogo da sala")).toBeTruthy();
		expect(screen.getByText("1972 · Atari")).toBeTruthy();
		expect(screen.queryByText("Tela cheia")).toBeNull();
	});

	it("files the pontuação of a finished game once, and reads the placar again", async () => {
		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);
		const over = await screen.findByRole("button", {
			name: "fim de jogo de mentira",
		});
		expect(callsTo("/api/games/pong/scoreboard")).toBe(1);

		fireEvent.click(over);

		expect(await screen.findByText("Sua pontuação")).toBeTruthy();
		expect(screen.getByText("7 pontos")).toBeTruthy();
		await waitFor(() =>
			expect(posted).toEqual([{ gameId: "pong", score: 7, method: "auto" }]),
		);
		expect(
			await screen.findByText("Sua pontuação já está no placar!"),
		).toBeTruthy();
		// The pontuação is on the board now, so the panel reads it again.
		await waitFor(() => expect(callsTo("/api/games/pong/scoreboard")).toBe(2));
		// Once: a second write would be a second row for the same game.
		expect(posted).toHaveLength(1);
	});

	it("writes one ponto in the singular, and pontos otherwise", async () => {
		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de um ponto" }),
		);

		expect(await screen.findByText("1 ponto")).toBeTruthy();
		expect(screen.queryByText("1 pontos")).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: "fim de jogo de mentira" }),
		);

		expect(await screen.findByText("7 pontos")).toBeTruthy();
	});

	it("asks who the kid is and files the pontuação after they pick a name", async () => {
		render(
			<GamePlay id="pong" student={null} onStudentChanged={() => undefined} />,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);

		expect(
			await screen.findByText(/Quem é você\? Escolha o seu nome/),
		).toBeTruthy();
		// Nothing is filed until there is a name to file it under.
		expect(posted).toEqual([]);

		fireEvent.click(await screen.findByRole("button", { name: /Bruno Teste/ }));

		await waitFor(() =>
			expect(posted).toEqual([{ gameId: "pong", score: 7, method: "auto" }]),
		);
		const [, init] = fetchMock.mock.calls.find(
			(call) => call[0] === "/api/identity",
		) as [string, RequestInit];
		expect(init.method).toBe("PUT");
		expect(JSON.parse(String(init.body))).toEqual({ studentId: BRUNO.id });
	});

	it("keeps the pontuação on the screen when filing it is refused", async () => {
		// The server refuses an automatic pontuação for a game that cannot count
		// its own, and the kid has just played: the number stays where they can
		// see it, with a way to try again.
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/pong") return jsonResponse(200, PONG);
			if (path === "/api/scores" && init?.method === "POST") {
				return jsonResponse(422, {
					error: "Este jogo não manda a pontuação sozinho.",
				});
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});

		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);

		expect(
			await screen.findByText("Este jogo não manda a pontuação sozinho."),
		).toBeTruthy();
		expect(screen.getByText("7 pontos")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
	});

	it("takes the finished game's card off the screen when a new round starts", async () => {
		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);
		expect(
			await screen.findByText("Sua pontuação já está no placar!"),
		).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "jogar de novo" }));

		// That number belongs to the game that is over; the one starting now has
		// scored nothing yet, and the card over it would read as this game's.
		await waitFor(() => expect(screen.queryByText("Sua pontuação")).toBeNull());
		expect(screen.queryByText("7 pontos")).toBeNull();
	});

	it("keeps a pontuação still waiting for a name when a new round starts", async () => {
		render(
			<GamePlay id="pong" student={null} onStudentChanged={() => undefined} />,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);
		expect(
			await screen.findByText(/Quem é você\? Escolha o seu nome/),
		).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "jogar de novo" }));

		// The card is the only place that number exists until it is filed.
		expect(screen.getByText("7 pontos")).toBeTruthy();
		expect(screen.getByText(/Quem é você\? Escolha o seu nome/)).toBeTruthy();
	});

	it("keeps a pontuação that could not be filed when a new round starts", async () => {
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/pong") return jsonResponse(200, PONG);
			if (path === "/api/scores" && init?.method === "POST") {
				return jsonResponse(422, {
					error: "Este jogo não manda a pontuação sozinho.",
				});
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});

		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);
		expect(
			await screen.findByText("Este jogo não manda a pontuação sozinho."),
		).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "jogar de novo" }));

		// Still the only copy of that number, and still with a way to try again.
		expect(screen.getByText("7 pontos")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
	});

	it("keeps a pontuação whose write is still in flight when a new round starts", async () => {
		// The write outlives the round: the kid starts another one before the
		// answer arrives, and the card has to stay -- a refusal landing after it
		// was cleared would take the number and its retry away with it.
		const answers: Array<(response: Response) => void> = [];
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/pong") return jsonResponse(200, PONG);
			if (path === "/api/scores" && init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				return new Promise<Response>((resolve) => answers.push(resolve));
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);
		expect(await screen.findByText("Salvando a sua pontuação…")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "jogar de novo" }));
		expect(screen.getByText("7 pontos")).toBeTruthy();
		expect(screen.getByText("Salvando a sua pontuação…")).toBeTruthy();

		await act(async () => {
			answers[0]?.(
				jsonResponse(422, {
					error: "Este jogo não manda a pontuação sozinho.",
				}),
			);
		});

		expect(
			await screen.findByText("Este jogo não manda a pontuação sozinho."),
		).toBeTruthy();
		expect(screen.getByText("7 pontos")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
	});

	it("never lets a late answer to one round land on the next round's card", async () => {
		const answers: Array<(response: Response) => void> = [];
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, EMPTY_BOARD);
			}
			if (path === "/api/games/pong") return jsonResponse(200, PONG);
			if (path === "/api/scores" && init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				return new Promise<Response>((resolve) => answers.push(resolve));
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
		render(
			<GamePlay id="pong" student={ANA} onStudentChanged={() => undefined} />,
		);

		// Round one ends and its write is still in flight.
		fireEvent.click(
			await screen.findByRole("button", { name: "fim de jogo de mentira" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "jogar de novo" }));
		// Round two ends too, with a card and a write of its own.
		fireEvent.click(
			screen.getByRole("button", { name: "fim de jogo de um ponto" }),
		);
		await waitFor(() => expect(answers).toHaveLength(2));
		expect(screen.getByText("1 ponto")).toBeTruthy();

		// Round one's write is finally answered: its card is gone, and the one
		// on the screen is round two's, which this answer is not about.
		await act(async () => {
			answers[0]?.(jsonResponse(201, { id: 1, score: 7, approved: true }));
		});
		expect(screen.getByText("1 ponto")).toBeTruthy();
		expect(screen.getByText("Salvando a sua pontuação…")).toBeTruthy();
		expect(screen.queryByText("Sua pontuação já está no placar!")).toBeNull();

		// Round two's own answer is the one that lands on it.
		await act(async () => {
			answers[1]?.(jsonResponse(201, { id: 2, score: 1, approved: true }));
		});
		expect(
			await screen.findByText("Sua pontuação já está no placar!"),
		).toBeTruthy();
		expect(screen.getByText("1 ponto")).toBeTruthy();
	});
});
