import type { GameSystem } from "@/lib/types";

/**
 * What a kid calls each console, in pt-BR.
 *
 * A record and not a function: the lookup is the whole of it, and a call site
 * that reads `SYSTEM_LABELS[game.system]` says exactly as much. Written out
 * rather than derived from the catalogue value, because `arcade` is "Fliperama"
 * here and no rule turns one into the other -- the SPA owns the reading, the
 * server's `jogos.yml` keeps the code names.
 */
export const SYSTEM_LABELS: Record<GameSystem, string> = {
	atari2600: "Atari 2600",
	arcade: "Fliperama",
	nes: "Nintendo",
	snes: "Super Nintendo",
	genesis: "Mega Drive",
};

/**
 * What the emulator page tells its parent.
 *
 * `sala:ready` is the runtime loaded, `sala:started` is the game booted, and
 * `sala:error` carries a pt-BR sentence for the kid -- the page knows why it
 * could not start, and the SPA does not.
 */
export type EmulatorMessage =
	| { type: "sala:ready" }
	| { type: "sala:started" }
	| { type: "sala:error"; message: string };

/** What an `sala:error` without a readable message is shown as. */
const EMULATOR_FALLBACK_ERROR = "Não foi possível abrir o jogo.";

/**
 * readEmulatorMessage decides whether a `message` event is the emulator's.
 *
 * Two checks, and both are needed. The origin says the frame really is ours:
 * `postMessage` is a broadcast, and any page this tab has open -- an
 * advertisement in another tab, a document inside another iframe -- can send one
 * that arrives here. The source says WHICH of our frames sent it, because a
 * second same-origin frame is still a different document that this listener has
 * no business acting on. The origin alone would let one of our own pages drive
 * the screen; the source alone would accept any origin that happens to hold a
 * reference to this window.
 *
 * Anything unrecognised answers null and is ignored rather than treated as an
 * error: the page may grow new messages later (the scores), and a listener that
 * turned every one of them into a red box would make that impossible.
 */
export function readEmulatorMessage(
	event: MessageEvent,
	source: unknown,
	origin: string,
): EmulatorMessage | null {
	if (event.origin !== origin) return null;
	if (source === null || event.source !== source) return null;

	const data: unknown = event.data;
	if (data === null || typeof data !== "object") return null;
	const { type } = data as { type?: unknown };
	if (type === "sala:ready" || type === "sala:started") return { type };
	if (type === "sala:error") {
		const message = (data as { message?: unknown }).message;
		return {
			type,
			message:
				typeof message === "string" && message.trim() !== ""
					? message
					: EMULATOR_FALLBACK_ERROR,
		};
	}
	return null;
}
