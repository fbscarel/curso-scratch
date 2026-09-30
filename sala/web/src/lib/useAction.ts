import { useCallback, useState } from "react";
import { ApiError } from "@/lib/api";

export interface ActionState {
	busy: boolean;
	error: Error | null;
	/** Clear the last error, for a form the teacher is editing again. */
	reset: () => void;
	run: <T>(
		fn: () => Promise<T>,
		options?: RunOptions,
	) => Promise<T | undefined>;
}

export interface RunOptions {
	/**
	 * Record a 401 instead of swallowing it.
	 *
	 * The login form is the one caller that wants it: its 401 IS the answer to
	 * the submission (a wrong password), not a session that expired somewhere
	 * else, so it belongs on the screen beside the field that caused it.
	 */
	keepUnauthorized?: boolean;
}

/**
 * useAction runs one write and holds its busy/error state.
 *
 * Four admin screens mutate, and every one of them needs the same three things:
 * the control disabled while the request is in flight, a refusal rendered rather
 * than swallowed, and the error cleared when the teacher edits the form again.
 * Hand-rolling that per screen is how one of them ends up without the disabled
 * state and a double submit of an INSERT.
 *
 * A 401 is NOT recorded. The api client has already told the shell to fall back
 * to the login screen, and a red box behind that navigation is a message nobody
 * can act on. A caller whose own request the 401 answers opts out with
 * `keepUnauthorized`.
 */
export function useAction(): ActionState {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const reset = useCallback(() => setError(null), []);

	const run = useCallback(
		async <T>(
			fn: () => Promise<T>,
			options: RunOptions = {},
		): Promise<T | undefined> => {
			setBusy(true);
			setError(null);
			try {
				return await fn();
			} catch (e: unknown) {
				if (
					!options.keepUnauthorized &&
					e instanceof ApiError &&
					e.status === 401
				) {
					return undefined;
				}
				setError(e instanceof Error ? e : new Error(String(e)));
				return undefined;
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	return { busy, error, reset, run };
}
