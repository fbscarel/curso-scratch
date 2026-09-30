import { describe, expect, it } from "vitest";
import { hrefFor, parseRoute, safeNext } from "@/lib/router";

/** A deployment's admin path, of the shape config.toml generates. */
const BASE = "/professor-kqzt";

describe("parseRoute", () => {
	it("maps the public screens", () => {
		expect(parseRoute("/", BASE)).toEqual({ name: "home" });
		expect(parseRoute("/quem-sou-eu", BASE)).toEqual({ name: "identity" });
	});

	it("maps the admin screens under the admin base", () => {
		const cases: Record<string, string> = {
			[BASE]: "admin-current",
			[`${BASE}/`]: "admin-current",
			[`${BASE}/login`]: "admin-login",
			[`${BASE}/alunos`]: "admin-students",
			[`${BASE}/aulas`]: "admin-lessons",
			[`${BASE}/presenca`]: "admin-attendance",
		};
		for (const [path, name] of Object.entries(cases)) {
			expect(parseRoute(path, BASE).name).toBe(name);
		}
	});

	it("serves no admin screen at all when the page carries no admin base", () => {
		// The path is never in the bundle; it arrives in <head> from the server.
		// Without it this is an ordinary public page, and `/alunos` is a typo.
		expect(parseRoute(`${BASE}/alunos`, "")).toEqual({
			name: "notfound",
			path: `${BASE}/alunos`,
			admin: false,
		});
		expect(parseRoute("/alunos", "")).toEqual({
			name: "notfound",
			path: "/alunos",
			admin: false,
		});
	});

	it("does not take a path that merely starts with the base for the admin tree", () => {
		expect(parseRoute("/professor-kqzt2/alunos", BASE)).toEqual({
			name: "notfound",
			path: "/professor-kqzt2/alunos",
			admin: false,
		});
	});

	it("treats anything else as not found rather than guessing a screen", () => {
		// The server hands index.html to every extension-less GET, so a typo
		// would otherwise land on the nearest match.
		const paths = [
			"/nada",
			"/quem-sou-eu/extra",
			`${BASE}/alunos/1`,
			`${BASE}/constructor`,
			`${BASE}/login/extra`,
		];
		for (const path of paths) {
			expect(parseRoute(path, BASE).name).toBe("notfound");
		}
	});

	it("round-trips through hrefFor, so a link and its route agree", () => {
		for (const name of [
			"home",
			"identity",
			"admin-login",
			"admin-current",
			"admin-students",
			"admin-lessons",
			"admin-attendance",
		] as const) {
			const route = { name };
			expect(parseRoute(hrefFor(route, BASE), BASE)).toEqual(route);
		}
	});

	it("keeps the unknown path in the href, so the link goes where it says", () => {
		const route = { name: "notfound", path: "/nada", admin: false } as const;
		expect(hrefFor(route, BASE)).toBe("/nada");
	});
});

describe("safeNext", () => {
	it("keeps a same-origin relative path", () => {
		expect(safeNext("/x")).toBe("/x");
		expect(safeNext("/x?y=1")).toBe("/x?y=1");
		expect(safeNext("/aulas/aula-03#top")).toBe("/aulas/aula-03#top");
		expect(safeNext("  /x  ")).toBe("/x");
	});

	it("falls back to the home screen for anything that could leave the origin", () => {
		for (const value of [
			"//evil.example",
			"http://evil.example",
			"https://evil.example",
			"javascript:alert(1)",
			"mailto:a@b.example",
			"data:text/html,<script>",
			"x",
			"\\evil",
			"/\\evil",
			"/\t/evil",
			"/\n/evil",
			"/ /evil",
		]) {
			expect(safeNext(value)).toBe("/");
		}
	});

	it("falls back when there is no next at all", () => {
		expect(safeNext(null)).toBe("/");
		expect(safeNext(undefined)).toBe("/");
		expect(safeNext("")).toBe("/");
		expect(safeNext("   ")).toBe("/");
	});
});
