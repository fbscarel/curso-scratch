import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

export interface AsyncState<T> {
	data: T | null;
	error: Error | null;
	loading: boolean;
	reload: () => void;
}

/**
 * useAsync runs a fetch when the identity of the request changes.
 *
 * `key` is that identity -- a screen composes it from what it is showing -- and
 * `reload` bumps a counter beside it, so a retry is just a new identity for the
 * same query. The two are combined into one `requestId` that the effect both
 * depends on and reads, which is also the staleness guard: an in-flight response
 * whose requestId is no longer current is discarded rather than painted over a
 * newer one. AbortController alone does not cover that, because a promise can
 * resolve in the tick before the abort lands.
 *
 * The function itself is held in a ref. A screen rebuilds its closure on every
 * render, so depending on it would refetch forever.
 *
 * A 401 never reaches `error`. The api client has already told the admin shell
 * to fall back to the login screen by the time it is thrown, and rendering
 * "401" behind that is a flash of a message nobody can act on.
 */
export function useAsync<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	key: string,
): AsyncState<T> {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [loading, setLoading] = useState(true);
	const [attempt, setAttempt] = useState(0);

	// Joined on an escaped NUL, which cannot occur inside a key a screen
	// composed. WRITTEN AS THE ESCAPE, never as the byte: a literal NUL makes
	// this file `data` to git -- no diff, no blame, and a pull request that
	// reads `Bin 2421 -> 3709 bytes`.
	const requestId = `${attempt}\0${key}`;

	const latest = useRef(fn);
	latest.current = fn;
	const current = useRef(requestId);

	const reload = useCallback(() => setAttempt((n) => n + 1), []);

	// What the PREVIOUS key answered is not an answer to this one, and the
	// render right after a screen navigates is where that shows: a guard that
	// reads the session would read the answer to the screen the browser is
	// LEAVING, decide on it, and send the reader back where they came from.
	// Clearing it here -- during the render, so React re-renders before this one
	// is committed -- is what stops any consumer from reading one query's answer
	// as another's.
	const [answeredKey, setAnsweredKey] = useState(key);
	if (answeredKey !== key) {
		setAnsweredKey(key);
		setData(null);
		setError(null);
		setLoading(true);
	}

	useEffect(() => {
		current.current = requestId;
		const ac = new AbortController();
		const fresh = () => current.current === requestId && !ac.signal.aborted;
		setLoading(true);
		setError(null);
		latest
			.current(ac.signal)
			.then((value) => {
				if (!fresh()) return;
				setData(value);
				setLoading(false);
			})
			.catch((e: unknown) => {
				if (!fresh()) return;
				setLoading(false);
				if (e instanceof ApiError && e.status === 401) return;
				setError(e instanceof Error ? e : new Error(String(e)));
			});
		return () => ac.abort();
	}, [requestId]);

	return { data, error, loading, reload };
}
