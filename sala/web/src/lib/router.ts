import { useCallback, useEffect, useState } from "react";
import { readAdminBase } from "@/lib/adminBase";

/**
 * A router in ninety lines, because the route set is nine entries and a
 * dependency would be more code than this.
 *
 * Real paths rather than a hash, so a screen's URL can be pasted into a message
 * to the teacher. The server serves index.html for any GET it does not
 * otherwise route, which is what makes a deep link survive a reload.
 *
 * The admin tree is not a second router: it is the same one, told where the
 * admin path starts. The path is a deployment fact that arrives in <head>, so
 * every function here takes it as an argument with the meta tag as its default.
 */

export type Route =
	| { name: "home" }
	| { name: "identity" }
	| { name: "upload" }
	| { name: "my-files" }
	| { name: "sheets" }
	| { name: "games" }
	| { name: "game"; id: string }
	| { name: "admin-login" }
	| { name: "admin-current" }
	| { name: "admin-students" }
	| { name: "admin-lessons" }
	| { name: "admin-attendance" }
	| { name: "admin-uploads" }
	| { name: "admin-games" }
	| { name: "notfound"; path: string; admin: boolean };

/**
 * A catalogue id, and the only shape one can have.
 *
 * Checked here rather than only by the server, because the id comes from the URL
 * bar: `/jogos/<id>` is a route, and a path that is not an id (`/jogos/..`,
 * `/jogos/x/y`) is a typo that must land on the not-found screen instead of
 * being turned into a request.
 */
const GAME_ID = /^[a-z0-9-]+$/;

export function parseRoute(
	pathname: string,
	base: string = readAdminBase(),
): Route {
	if (base !== "" && (pathname === base || pathname.startsWith(`${base}/`))) {
		const parts = pathname.slice(base.length).split("/").filter(Boolean);
		if (parts.length > 1)
			return { name: "notfound", path: pathname, admin: true };
		// A switch and not a lookup table: `table[segment]` answers
		// `Object.prototype.constructor` for `/professor-x/constructor`, which is
		// a route whose name is a function.
		switch (parts[0] ?? "") {
			case "":
				return { name: "admin-current" };
			case "login":
				return { name: "admin-login" };
			case "alunos":
				return { name: "admin-students" };
			case "aulas":
				return { name: "admin-lessons" };
			case "presenca":
				return { name: "admin-attendance" };
			case "entregas":
				return { name: "admin-uploads" };
			case "jogos":
				return { name: "admin-games" };
			default:
				return { name: "notfound", path: pathname, admin: true };
		}
	}

	const parts = pathname.split("/").filter(Boolean);
	if (parts.length === 0) return { name: "home" };
	if (parts.length === 1) {
		switch (parts[0]) {
			case "quem-sou-eu":
				return { name: "identity" };
			case "entregar":
				return { name: "upload" };
			case "meus-arquivos":
				return { name: "my-files" };
			case "folhas":
				return { name: "sheets" };
			case "jogo":
				return { name: "games" };
		}
	}
	// `/jogos/<id>` is the one two-segment public route; anything else with two
	// segments is a path this application does not serve.
	const [first, second] = parts;
	if (
		parts.length === 2 &&
		first === "jogos" &&
		second &&
		GAME_ID.test(second)
	) {
		return { name: "game", id: second };
	}
	return { name: "notfound", path: pathname, admin: false };
}

export function hrefFor(route: Route, base: string = readAdminBase()): string {
	switch (route.name) {
		case "home":
			return "/";
		case "identity":
			return "/quem-sou-eu";
		case "upload":
			return "/entregar";
		case "my-files":
			return "/meus-arquivos";
		case "sheets":
			return "/folhas";
		case "games":
			return "/jogo";
		case "game":
			return `/jogos/${route.id}`;
		case "admin-login":
			return `${base}/login`;
		case "admin-current":
			return `${base}/`;
		case "admin-students":
			return `${base}/alunos`;
		case "admin-lessons":
			return `${base}/aulas`;
		case "admin-attendance":
			return `${base}/presenca`;
		case "admin-uploads":
			return `${base}/entregas`;
		case "admin-games":
			return `${base}/jogos`;
		case "notfound":
			return route.path;
	}
}

/**
 * safeNext sanitises the `?next=` an identity card is asked to return to.
 *
 * The value comes from the URL, which anybody can write. Only a same-origin
 * RELATIVE path is accepted, and everything else falls back to `/`:
 *
 *  - `//evil.example` is protocol-relative, so a browser reads it as another
 *    origin -- the classic open redirect, and the reason the check is on the
 *    second character and not only the first.
 *  - `http://evil`, `javascript:alert(1)` and `mailto:` never start with a
 *    single slash and are refused by the first test.
 *  - `\` and control characters are refused too: a browser normalises `\` to `/`
 *    and strips tabs and newlines while parsing, so `/\t/evil` would become
 *    `//evil` only after this check had already passed.
 *  - empty is not a destination, so it is `/`.
 */
export function safeNext(value: string | null | undefined): string {
	const target = (value ?? "").trim();
	if (!target.startsWith("/") || target.startsWith("//")) return "/";
	for (const char of target) {
		if (char === "\\" || char.charCodeAt(0) <= 0x20) return "/";
	}
	return target;
}

export function navigate(to: string): void {
	window.history.pushState({}, "", to);
	window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(base: string = readAdminBase()): Route {
	const [route, setRoute] = useState<Route>(() =>
		parseRoute(window.location.pathname, base),
	);
	const sync = useCallback(
		() => setRoute(parseRoute(window.location.pathname, base)),
		[base],
	);
	useEffect(() => {
		window.addEventListener("popstate", sync);
		return () => window.removeEventListener("popstate", sync);
	}, [sync]);
	return route;
}
