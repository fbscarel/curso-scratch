import pongCover from "@/assets/pong-capa.png";
import { adminCoverUrl, coverUrl } from "@/lib/api";
import type { Game, GameSystem } from "@/lib/types";

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
 * What a kid reads where a console would be named for a game that has none.
 *
 * Pong is ours and never ran on a console, so the badge that names a system on
 * every other game's card says this instead. It is also the honest answer for a
 * teacher's table row: there is no console to name.
 */
export const BUILTIN_LABEL = "Jogo da sala";

/** systemLabel names a game's console, or says that it has none. */
export function systemLabel(system: GameSystem | null): string {
	return system === null ? BUILTIN_LABEL : SYSTEM_LABELS[system];
}

/**
 * Whether the SPA is running on its own, without a lab server (`VITE_MOCK=1`).
 *
 * Development only: a production build folds this to `false`, and the stand-in
 * below with it.
 */
const MOCK_MODE = import.meta.env.DEV && import.meta.env.VITE_MOCK === "1";

/**
 * mockCover is what the development mock shows where a cover image would be.
 *
 * There is no lab server in mock mode and no image for a `<img>` to load -- a
 * request for one would be answered with the SPA's own index.html, which is not
 * a picture -- so the grid would only ever show icons and the cover layout could
 * not be looked at. Development only.
 */
function mockCover(title: string): string {
	const safe = title
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
	const svg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
		'<rect width="300" height="200" fill="#1b1b2f"/>' +
		`<text x="150" y="108" fill="#ffd166" font-family="sans-serif" font-size="26"` +
		` font-weight="bold" text-anchor="middle">${safe}</text></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * coverSrc is where a game's cover image is, or `null` when it has none.
 *
 * Two sources, and the kind of the game is what picks between them: our own
 * game's cover is a screenshot that travels inside this bundle, and an emulated
 * game's is served by the lab server at the route the API builds.
 *
 * The flag on the game is what says whether there is an image at all: the covers
 * are downloaded once per laptop (`just sala-capas`) and are in no repository, so
 * a laptop that never ran it has boxes to show only because of the icons.
 *
 * `admin` picks the teacher's route instead of the kid's: the teacher's table
 * lists the whole catalogue, and the public route 404s for the games the kids
 * cannot see right now.
 */
export function coverSrc(
	game: Pick<Game, "id" | "title" | "type" | "cover">,
	{ admin = false }: { admin?: boolean } = {},
): string | null {
	if (game.type === "builtin") return pongCover;
	if (!game.cover) return null;
	if (MOCK_MODE) return mockCover(game.title);
	return admin ? adminCoverUrl(game.id) : coverUrl(game.id);
}

/**
 * What the emulator page tells its parent.
 *
 * `sala:ready` is the runtime loaded, `sala:started` is the game booted, and
 * `sala:error` carries a pt-BR sentence for the kid -- the page knows why it
 * could not start, and the SPA does not.
 *
 * `sala:score` is one sample of the game's own score, read from the core's
 * memory while it runs: `inGame` says whether a match is running or the attract
 * screen is showing, and `score` is the points the sample decoded to -- or null
 * when it could not be read (a digit out of range, a state too short for the
 * offsets), which is not the same as a score of zero.
 */
export type EmulatorMessage =
	| { type: "sala:ready" }
	| { type: "sala:started" }
	| { type: "sala:error"; message: string }
	| { type: "sala:score"; inGame: boolean; score: number | null };

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
 * error: the page may grow new messages later, and a listener that turned every
 * one of them into a red box would make that impossible. The same goes for a
 * known message whose fields are not the shapes it promised -- a score that is
 * not a whole count of points is a sample to skip, not a broken game.
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
	if (type === "sala:score") {
		const { inGame, score } = data as { inGame?: unknown; score?: unknown };
		if (typeof inGame !== "boolean") return null;
		// A null score is the page saying it could not read this sample, which
		// is a real answer: the sample is kept, only without a number.
		if (score === null) return { type, inGame, score: null };
		if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
			return null;
		}
		return { type, inGame, score };
	}
	return null;
}
