import { describe, expect, it } from "vitest";
import { readEmulatorMessage, SYSTEM_LABELS } from "@/lib/games";

/**
 * The listener's whole job is deciding whether a `message` event is the
 * emulator's, so this is the event and the two things it is checked against:
 * the origin, and the frame that sent it.
 *
 * `source` is set with `defineProperty` rather than through the constructor:
 * jsdom converts a constructor's `source` to the `MessageEventSource` union and
 * throws on the stand-in object this needs -- and the comparison under test is
 * identity, so a plain object is exactly as good a stand-in as a real frame.
 */
const ORIGIN = "http://127.0.0.1:8000";
const FRAME = { name: "the emulator iframe" };
const OTHER_FRAME = { name: "another same-origin frame" };

function messageFrom(
	data: unknown,
	options: { origin?: string; source?: unknown } = {},
): MessageEvent {
	const event = new MessageEvent("message", {
		data,
		origin: options.origin ?? ORIGIN,
	});
	Object.defineProperty(event, "source", {
		value: options.source === undefined ? FRAME : options.source,
	});
	return event;
}

describe("readEmulatorMessage", () => {
	it("reads the three messages the page sends", () => {
		expect(
			readEmulatorMessage(messageFrom({ type: "sala:ready" }), FRAME, ORIGIN),
		).toEqual({ type: "sala:ready" });
		expect(
			readEmulatorMessage(messageFrom({ type: "sala:started" }), FRAME, ORIGIN),
		).toEqual({ type: "sala:started" });
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:error", message: "Emulador não instalado." }),
				FRAME,
				ORIGIN,
			),
		).toEqual({ type: "sala:error", message: "Emulador não instalado." });
	});

	it("ignores a message from another origin, whoever sent it", () => {
		// `postMessage` is a broadcast: a page in another tab, or an
		// advertisement inside another frame, can reach this listener.
		expect(
			readEmulatorMessage(
				messageFrom(
					{ type: "sala:started" },
					{ origin: "https://evil.example" },
				),
				FRAME,
				ORIGIN,
			),
		).toBeNull();
		expect(
			readEmulatorMessage(
				messageFrom(
					{ type: "sala:error", message: "mentira" },
					{ origin: "https://evil.example" },
				),
				FRAME,
				ORIGIN,
			),
		).toBeNull();
	});

	it("ignores a message from a frame that is not this game's", () => {
		// Same origin is not enough: another document of ours is still not the
		// document this screen is listening to.
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:started" }, { source: OTHER_FRAME }),
				FRAME,
				ORIGIN,
			),
		).toBeNull();
	});

	it("ignores everything while the frame is not mounted yet", () => {
		expect(
			readEmulatorMessage(messageFrom({ type: "sala:started" }), null, ORIGIN),
		).toBeNull();
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:started" }, { source: null }),
				null,
				ORIGIN,
			),
		).toBeNull();
	});

	it("ignores what it does not know instead of calling it an error", () => {
		// The page may grow new messages later. A listener that turned each
		// unknown one into a red box would make that impossible.
		const unknown: unknown[] = [
			{ type: "sala:future" },
			{},
			"sala:started",
			null,
			42,
			undefined,
		];
		for (const data of unknown) {
			expect(readEmulatorMessage(messageFrom(data), FRAME, ORIGIN)).toBeNull();
		}
		// A known message with a field it did not promise is still that message:
		// the page adding one must not turn the screen red.
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:ready", extra: true }),
				FRAME,
				ORIGIN,
			),
		).toEqual({ type: "sala:ready" });
	});

	it("reads a score sample, with a number or with none", () => {
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:score", inGame: true, score: 30 }),
				FRAME,
				ORIGIN,
			),
		).toEqual({ type: "sala:score", inGame: true, score: 30 });
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:score", inGame: true, score: 0 }),
				FRAME,
				ORIGIN,
			),
		).toEqual({ type: "sala:score", inGame: true, score: 0 });
		// A sample that could not be read is a real answer: the match flag is
		// kept and the number is null, which is not a score of zero.
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:score", inGame: false, score: null }),
				FRAME,
				ORIGIN,
			),
		).toEqual({ type: "sala:score", inGame: false, score: null });
	});

	it("ignores a score sample that is not the shape the page promised", () => {
		const bad: unknown[] = [
			// The match flag is what decides whether a score means anything, so a
			// sample without one cannot be acted on.
			{ type: "sala:score", score: 10 },
			{ type: "sala:score", inGame: "yes", score: 10 },
			{ type: "sala:score", inGame: true },
			// A count of points is a whole number from zero: anything else is a
			// decoding the screen must not turn into a placar row.
			{ type: "sala:score", inGame: true, score: -1 },
			{ type: "sala:score", inGame: true, score: 1.5 },
			{ type: "sala:score", inGame: true, score: "30" },
		];
		for (const data of bad) {
			expect(readEmulatorMessage(messageFrom(data), FRAME, ORIGIN)).toBeNull();
		}
	});

	it("ignores a score sample from another origin, or another frame", () => {
		expect(
			readEmulatorMessage(
				messageFrom(
					{ type: "sala:score", inGame: true, score: 30 },
					{ origin: "https://evil.example" },
				),
				FRAME,
				ORIGIN,
			),
		).toBeNull();
		expect(
			readEmulatorMessage(
				messageFrom(
					{ type: "sala:score", inGame: true, score: 30 },
					{ source: OTHER_FRAME },
				),
				FRAME,
				ORIGIN,
			),
		).toBeNull();
	});

	it("still shows something when the error carries no readable message", () => {
		expect(
			readEmulatorMessage(messageFrom({ type: "sala:error" }), FRAME, ORIGIN),
		).toEqual({
			type: "sala:error",
			message: "Não foi possível abrir o jogo.",
		});
		expect(
			readEmulatorMessage(
				messageFrom({ type: "sala:error", message: "   " }),
				FRAME,
				ORIGIN,
			),
		).toEqual({
			type: "sala:error",
			message: "Não foi possível abrir o jogo.",
		});
	});
});

describe("SYSTEM_LABELS", () => {
	it("names every console the catalogue can state, in pt-BR", () => {
		expect(SYSTEM_LABELS).toEqual({
			atari2600: "Atari 2600",
			arcade: "Fliperama",
			nes: "Nintendo",
			snes: "Super Nintendo",
			genesis: "Mega Drive",
		});
	});
});
