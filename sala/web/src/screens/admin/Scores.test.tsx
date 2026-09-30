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
import type { AdminGame, AdminScore, Lesson } from "@/lib/types";
import { Scores } from "@/screens/admin/Scores";

/** The admin path a deployment injects into <head>. */
const BASE = "/professor-kqzt";

const LESSONS: Lesson[] = [
	{ number: 3, date: "2026-09-23" },
	{ number: 4, date: "2026-09-30" },
];

const GAMES: AdminGame[] = [
	{
		id: "pong",
		title: "Pong",
		type: "builtin",
		system: null,
		core: null,
		year: 1972,
		maker: "Atari",
		playable: true,
		missing: null,
		cover: true,
	},
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
		cover: false,
	},
];

/** A self-report nobody has answered yet. */
const PENDING: AdminScore = {
	id: 7,
	game: { id: "pong", title: "Pong" },
	student: { id: 1, name: "Ana Teste" },
	lessonNumber: 4,
	score: 18,
	method: "self",
	approved: false,
	createdAt: "2026-09-30 14:40:00",
};

/** A pontuação the game counted itself, already on the placar. */
const APPROVED: AdminScore = {
	id: 5,
	game: { id: "pong", title: "Pong" },
	student: { id: 2, name: "Bruno Teste" },
	lessonNumber: 4,
	score: 42,
	method: "auto",
	approved: true,
	createdAt: "2026-09-30 14:20:00",
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("the admin Placar screen", () => {
	let fetchMock: Mock;
	/** What the server holds, which the two writes change. */
	let pending: AdminScore[];
	let approved: AdminScore[];
	/** The queries `GET /api/scores` was called with, in order. */
	let queried: string[];

	beforeEach(() => {
		pending = [PENDING];
		approved = [APPROVED];
		queried = [];
		rememberCsrf("tok-1");
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const meta = document.createElement("meta");
		meta.name = "sala-admin-base";
		meta.content = BASE;
		document.head.append(meta);

		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (path.startsWith(`${BASE}/api/scores?`)) {
				queried.push(path);
				const status = new URL(path, "http://localhost").searchParams.get(
					"status",
				);
				return jsonResponse(200, status === "approved" ? approved : pending);
			}
			if (path === `${BASE}/api/lessons`) return jsonResponse(200, LESSONS);
			if (path === `${BASE}/api/games`) {
				return jsonResponse(200, {
					activeGame: "pong",
					freeMode: false,
					games: GAMES,
				});
			}
			const approval = new RegExp(`^${BASE}/api/scores/(\\d+)/approval$`).exec(
				path,
			);
			if (approval && init?.method === "PUT") {
				const id = Number(approval[1] ?? "");
				const score = pending.find((item) => item.id === id);
				if (!score) return jsonResponse(404, { error: "não existe" });
				pending = pending.filter((item) => item.id !== id);
				approved = [{ ...score, approved: true }, ...approved];
				return new Response(null, { status: 204 });
			}
			const entry = new RegExp(`^${BASE}/api/scores/(\\d+)$`).exec(path);
			if (entry && init?.method === "DELETE") {
				const id = Number(entry[1] ?? "");
				pending = pending.filter((item) => item.id !== id);
				approved = approved.filter((item) => item.id !== id);
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

	it("confirms a self-reported pontuação, which is what puts it on the placar", async () => {
		render(<Scores currentNumber={4} />);
		expect(await screen.findByText("Ana Teste")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Aprovar/ }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				`${BASE}/api/scores/7/approval`,
				expect.objectContaining({ method: "PUT" }),
			),
		);
		const [, init] = fetchMock.mock.calls.find(
			(call) => call[0] === `${BASE}/api/scores/7/approval`,
		) as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({ approved: true });
		expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe("tok-1");
		// The row is out of the pending list, and it is on the board now.
		await waitFor(() =>
			expect(
				screen.getByText("Nenhuma pontuação esperando confirmação."),
			).toBeTruthy(),
		);
		expect(screen.getByText("Do jogo")).toBeTruthy();
	});

	it("refuses a pontuação only after the teacher confirms it", async () => {
		render(<Scores currentNumber={4} />);
		expect(await screen.findByText("Ana Teste")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Recusar/ }));
		// Nothing is deleted while the question is still on the screen.
		expect(await screen.findByText("Recusar esta pontuação?")).toBeTruthy();
		expect(
			fetchMock.mock.calls.some((call) =>
				String(call[0]).startsWith(`${BASE}/api/scores/7`),
			),
		).toBe(false);

		fireEvent.click(screen.getByRole("button", { name: "Recusar" }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				`${BASE}/api/scores/7`,
				expect.objectContaining({ method: "DELETE" }),
			),
		);
		expect(pending).toEqual([]);
	});

	it("takes a pontuação off the placar, with the aula and the game as filters", async () => {
		render(<Scores currentNumber={4} />);
		expect(await screen.findByText("Bruno Teste")).toBeTruthy();
		// It opens on the aula the lab is in.
		await waitFor(() =>
			expect(queried.some((path) => path.includes("lesson=4"))).toBe(true),
		);

		fireEvent.click(screen.getByRole("button", { name: /Remover/ }));
		expect(await screen.findByText("Remover do placar?")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Remover" }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				`${BASE}/api/scores/5`,
				expect.objectContaining({ method: "DELETE" }),
			),
		);
		expect(approved).toEqual([]);
	});

	it("asks the server for the filter the teacher chose", async () => {
		// Radix scrolls the chosen option into view, which jsdom has no
		// implementation of.
		Element.prototype.scrollIntoView = vi.fn();
		render(<Scores currentNumber={4} />);
		await screen.findByText("Bruno Teste");

		fireEvent.click(screen.getByLabelText("Filtrar por jogo"));
		fireEvent.click(await screen.findByRole("option", { name: "Enduro" }));

		await waitFor(() =>
			expect(queried.some((path) => path.includes("game=enduro"))).toBe(true),
		);
	});

	it("keeps every aula when the teacher picks it", async () => {
		// Radix scrolls the chosen option into view, which jsdom has no
		// implementation of.
		Element.prototype.scrollIntoView = vi.fn();
		render(<Scores currentNumber={4} />);
		await screen.findByText("Bruno Teste");
		// It opens on the aula the lab is in.
		await waitFor(() =>
			expect(queried.some((path) => path.includes("lesson=4"))).toBe(true),
		);

		fireEvent.click(screen.getByLabelText("Filtrar por aula"));
		fireEvent.click(
			await screen.findByRole("option", { name: "Todas as aulas" }),
		);

		// Every aula is a choice, not "nothing picked yet": the screen must not
		// put the current aula back, and the request carries no lesson at all.
		const settled = queried.length;
		await act(async () => {
			await Promise.resolve();
		});
		expect(queried.length).toBe(settled);
		expect(queried.at(-1)).not.toContain("lesson=");
		const filter = screen.getByLabelText("Filtrar por aula");
		expect(filter.textContent).toContain("Todas as aulas");
		expect(filter.textContent).not.toContain("Aula 4");
	});

	it("shows a hand-in that arrives while the queue is open", async () => {
		pending = [];
		vi.useFakeTimers();
		try {
			render(<Scores currentNumber={4} />);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(
				screen.getByText("Nenhuma pontuação esperando confirmação."),
			).toBeTruthy();

			// A kid hands a pontuação in; nothing on this screen knows it yet.
			pending = [PENDING];
			await act(async () => {
				await vi.advanceTimersByTimeAsync(15_000);
			});

			expect(screen.getByText("Ana Teste")).toBeTruthy();
			// One tick, one read: a queue that asked again on every render would
			// be a request a second from the teacher's tab.
			expect(
				queried.filter((path) => path.includes("status=pending")).length,
			).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reads the queue again when the teacher comes back to the tab", async () => {
		pending = [];
		render(<Scores currentNumber={4} />);
		expect(
			await screen.findByText("Nenhuma pontuação esperando confirmação."),
		).toBeTruthy();

		pending = [PENDING];
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});

		expect(await screen.findByText("Ana Teste")).toBeTruthy();
	});
});
