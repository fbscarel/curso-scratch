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
	| { name: "admin-login" }
	| { name: "admin-current" }
	| { name: "admin-students" }
	| { name: "admin-lessons" }
	| { name: "admin-attendance" }
	| { name: "notfound"; path: string; admin: boolean };

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
			default:
				return { name: "notfound", path: pathname, admin: true };
		}
	}

	const parts = pathname.split("/").filter(Boolean);
	if (parts.length === 0) return { name: "home" };
	if (parts.length === 1 && parts[0] === "quem-sou-eu") {
		return { name: "identity" };
	}
	return { name: "notfound", path: pathname, admin: false };
}

export function hrefFor(route: Route, base: string = readAdminBase()): string {
	switch (route.name) {
		case "home":
			return "/";
		case "identity":
			return "/quem-sou-eu";
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
