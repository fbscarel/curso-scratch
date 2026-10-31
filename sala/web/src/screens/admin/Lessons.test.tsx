import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCsrf, rememberCsrf } from "@/lib/api";
import type { Lesson } from "@/lib/types";
import { Lessons } from "@/screens/admin/Lessons";

/** The admin path a deployment injects into <head>. */
const BASE = "/professor-kqzt";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * The calendar's music mark.
 *
 * "Batidas (Groovie)" is a property of the aula, and the write it makes is the
 * one thing the kids' home reads: a PATCH with `music` and nothing else, so
 * flipping the box cannot rewrite the date from a copy the screen loaded
 * earlier.
 */
describe("the admin Aulas screen", () => {
	let fetchMock: Mock;
	let lessons: Lesson[];
	let patchBody: unknown;

	beforeEach(() => {
		lessons = [
			{ number: 5, date: "2026-10-30", music: false },
			{ number: 6, date: "2026-11-03", music: false },
		];
		patchBody = null;
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
		const meta = document.createElement("meta");
		meta.name = "sala-admin-base";
		meta.content = BASE;
		document.head.append(meta);
		fetchMock.mockImplementation((path: string, init?: RequestInit) => {
			if (path === `${BASE}/api/lessons` && (init?.method ?? "GET") === "GET") {
				return jsonResponse(200, lessons);
			}
			if (path === `${BASE}/api/lessons/6` && init?.method === "PATCH") {
				patchBody = JSON.parse(String(init.body));
				lessons = lessons.map((lesson) =>
					lesson.number === 6 ? { ...lesson, music: true } : lesson,
				);
				return new Response(null, { status: 204 });
			}
			return jsonResponse(404, { error: `pedido inesperado: ${path}` });
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.head.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	it("marks an aula as a music class without sending the date", async () => {
		render(<Lessons />);

		const box = await screen.findByRole("checkbox", {
			name: "Batidas (Groovie) na aula 6",
		});
		expect(box.getAttribute("aria-checked")).toBe("false");

		fireEvent.click(box);

		await waitFor(() => expect(patchBody).toEqual({ music: true }));
		await waitFor(() =>
			expect(
				screen
					.getByRole("checkbox", { name: "Batidas (Groovie) na aula 6" })
					.getAttribute("aria-checked"),
			).toBe("true"),
		);
		// The other aula keeps its own answer.
		expect(
			screen
				.getByRole("checkbox", { name: "Batidas (Groovie) na aula 5" })
				.getAttribute("aria-checked"),
		).toBe("false");
	});
});
