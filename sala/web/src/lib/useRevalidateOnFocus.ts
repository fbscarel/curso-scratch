import { useEffect, useRef } from "react";

/**
 * useRevalidateOnFocus asks the server again when the kid comes back to the tab.
 *
 * The games' screen shows what the teacher turned on, and the teacher can turn
 * it off while the kid is looking at the game -- nothing tells the room's laptop
 * that this happened. A polling loop would, but a game screen that refetches on
 * a timer is a request every few seconds from every laptop on the classroom
 * wifi. Coming back to the tab is the moment the kid looks again: `focus` for
 * the window, `visibilitychange` for the tab that was in the background, and
 * both are one request per look.
 *
 * `check` is the screen's own question, and it answers whether what is on screen
 * is still what the server has: `true` means nothing to do, and `false` means
 * the screen has already dealt with the difference. It gets an AbortSignal that
 * fires when the screen goes away -- the hook is mounted for the life of the
 * screen, so a check in flight must not outlive it.
 */
export function useRevalidateOnFocus(
	check: (signal: AbortSignal) => Promise<boolean>,
): void {
	// The screen rebuilds this closure on every render (it reads that render's
	// data), so the listener is installed once and calls through this ref.
	const latest = useRef(check);
	latest.current = check;

	useEffect(() => {
		let controller = new AbortController();
		const run = () => {
			controller.abort();
			controller = new AbortController();
			latest.current(controller.signal).catch(() => {
				// A check that could not be answered (offline, a refused
				// connection) is not news about the games: the screen keeps
				// showing what it has until one can be.
			});
		};
		const onFocus = () => run();
		const onVisibility = () => {
			if (document.visibilityState === "visible") run();
		};
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisibility);
			controller.abort();
		};
	}, []);
}
