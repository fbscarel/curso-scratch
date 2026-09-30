import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Placar } from "@/components/Placar";
import { CSRF_HEADER, forgetCsrf, rememberCsrf } from "@/lib/api";
import type { Game, Scoreboard, Student } from "@/lib/types";

/**
 * The burst a pontuação earns, which jsdom has no canvas for. lib/celebrate
 * builds its own instance (`create`, no blob worker), so that is what the mock
 * has to answer.
 */
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

/** Pong is ours, so it reports its own pontuações and has no form to type one in. */
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

/** An emulated game with no score block: the form is the only way to score. */
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

/**
 * A placar with every shape in it: two kids tied on first place, Ana third and
 * looking at her own row, and a record from an earlier aula.
 */
const BOARD: Scoreboard = {
	record: {
		score: 55,
		student: { id: 2, name: "Bruno Teste" },
		lessonNumber: 3,
	},
	top: [
		{ rank: 1, student: { id: 2, name: "Bruno Teste" }, score: 42 },
		{ rank: 1, student: { id: 4, name: "Davi Teste" }, score: 42 },
		{ rank: 3, student: { id: 1, name: "Ana Teste" }, score: 30 },
		{ rank: 4, student: { id: 5, name: "Elisa Teste" }, score: 12 },
	],
	myPending: [],
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("the placar", () => {
	let fetchMock: Mock;
	/** The board the server would answer with, which a self-report changes. */
	let board: Scoreboard;
	/** What `POST /api/scores` was called with, in order. */
	let posted: unknown[];

	beforeEach(() => {
		board = BOARD;
		posted = [];
		rememberCsrf("tok-1");
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (String(path).endsWith("/scoreboard")) {
				return jsonResponse(200, board);
			}
			if (path === "/api/scores" && init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				// The server answers with the pontuação it filed, and it is NOT on
				// the placar: a self-report waits for the teacher.
				board = {
					...board,
					myPending: [{ id: 9, score: 250, createdAt: "2026-09-30 14:32:05" }],
				};
				return jsonResponse(201, { id: 9, score: 250, approved: false });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
	});

	/** scoreboardCalls is how many times the panel has read the placar. */
	function scoreboardCalls(): number {
		return fetchMock.mock.calls.filter((call) =>
			String(call[0]).endsWith("/scoreboard"),
		).length;
	}

	it("shows the record, a medal per place, and the row of the kid looking at it", async () => {
		render(<Placar game={PONG} student={ANA} refreshKey={0} />);

		expect(
			await screen.findByText(/Recorde da turma: 55 — Bruno Teste \(Aula 3\)/),
		).toBeTruthy();

		// A tie shares a place: two golds, no silver, and the next kid is third.
		expect(screen.getAllByLabelText("1º lugar")).toHaveLength(2);
		expect(screen.queryByLabelText("2º lugar")).toBeNull();
		expect(screen.getAllByLabelText("3º lugar")).toHaveLength(1);
		// Fourth place is the number itself, not a medal.
		expect(screen.getByText("4")).toBeTruthy();

		const mine = screen.getByText("Ana Teste").closest("li");
		const theirs = screen.getByText("Bruno Teste").closest("li");
		expect(mine?.textContent).toContain("você");
		expect(mine?.textContent).toContain("30");
		expect(theirs?.textContent).not.toContain("você");
	});

	it("says nobody has scored yet when the aula's placar is empty", async () => {
		board = { record: null, top: [], myPending: [] };
		render(<Placar game={PONG} student={ANA} refreshKey={0} />);

		expect(
			await screen.findByText(
				"Ninguém pontuou ainda nesta aula — seja o primeiro!",
			),
		).toBeTruthy();
		expect(screen.queryByText(/Recorde da turma/)).toBeNull();
	});

	it("files a self-reported pontuação and lists it as waiting for the teacher", async () => {
		render(<Placar game={ENDURO} student={ANA} refreshKey={0} />);
		// Enduro reads its own score, so the form is the fallback: it opens
		// from the button.
		fireEvent.click(
			await screen.findByRole("button", { name: "Anotar à mão" }),
		);
		const field = await screen.findByLabelText("Anotar minha pontuação");

		fireEvent.change(field, { target: { value: "250" } });
		fireEvent.click(screen.getByRole("button", { name: /^Anotar$/ }));

		await waitFor(() =>
			expect(posted).toEqual([
				{ gameId: "enduro", score: 250, method: "self" },
			]),
		);
		const [, init] = fetchMock.mock.calls.find(
			(call) => call[0] === "/api/scores",
		) as [string, RequestInit];
		expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe("tok-1");

		expect(await screen.findByText("Esperando o professor")).toBeTruthy();
		expect(screen.getByText("250 pontos")).toBeTruthy();
	});

	it("writes a single pending pontuação with the singular", async () => {
		board = {
			...board,
			myPending: [{ id: 9, score: 1, createdAt: "2026-09-30 14:32:05" }],
		};
		render(<Placar game={PONG} student={ANA} refreshKey={0} />);

		expect(await screen.findByText("Esperando o professor")).toBeTruthy();
		expect(screen.getByText("1 ponto")).toBeTruthy();
	});

	it("does not offer the form for a game that reports its own pontuação", async () => {
		render(<Placar game={PONG} student={ANA} refreshKey={0} />);

		await screen.findByText(/Recorde da turma/);
		expect(screen.queryByLabelText("Anotar minha pontuação")).toBeNull();
	});

	it("keeps the form behind a button for a game that reads its own score", async () => {
		render(<Placar game={ENDURO} student={ANA} refreshKey={0} />);

		// The automatic reading can fail, so the form stays -- but it does not
		// sit open under a score the game is already reporting.
		await screen.findByText(/Recorde da turma/);
		expect(screen.queryByLabelText("Anotar minha pontuação")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Anotar à mão" }));
		expect(await screen.findByLabelText("Anotar minha pontuação")).toBeTruthy();
	});

	it("shows the form open for an emulated game with no automatic score", async () => {
		render(<Placar game={GALAGA} student={ANA} refreshKey={0} />);

		expect(await screen.findByLabelText("Anotar minha pontuação")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Anotar à mão" })).toBeNull();
	});

	it("asks for a name before offering the form, since a pontuação is filed under one", async () => {
		render(<Placar game={GALAGA} student={null} refreshKey={0} />);

		await screen.findByText(/Recorde da turma/);
		expect(screen.queryByLabelText("Anotar minha pontuação")).toBeNull();
		const link = screen.getByRole("link", { name: "Escolha o seu nome" });
		expect(link.getAttribute("href")).toBe(
			`/quem-sou-eu?next=${encodeURIComponent("/jogos/galaga")}`,
		);
	});

	it("reads the placar again on its timer and when the kid comes back to the tab", async () => {
		vi.useFakeTimers();
		try {
			render(<Placar game={PONG} student={ANA} refreshKey={0} />);
			// The first read is the one the panel makes on mount, and it is the
			// only one: a panel that refetched on every render would never stop.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(scoreboardCalls()).toBe(1);

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10_000);
			});
			expect(scoreboardCalls()).toBe(2);

			await act(async () => {
				window.dispatchEvent(new Event("focus"));
			});
			expect(scoreboardCalls()).toBe(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reads the placar again when the screen says a pontuação was just filed", async () => {
		const { rerender } = render(
			<Placar game={PONG} student={ANA} refreshKey={0} />,
		);
		await screen.findByText(/Recorde da turma/);
		expect(scoreboardCalls()).toBe(1);

		rerender(<Placar game={PONG} student={ANA} refreshKey={1} />);
		await waitFor(() => expect(scoreboardCalls()).toBe(2));
	});
});
