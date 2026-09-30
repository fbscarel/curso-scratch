import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * The decoder the emulator page runs: `app/emulator/score.js`.
 *
 * The file is not part of this bundle -- the server serves it to the page in
 * the iframe -- so this reads its source and runs it against a window of its
 * own, which is the decoder the page ends up with. What is pinned here is the
 * number that is filed under a kid's name: the BCD order, the multiplier, and
 * every way a savestate can fail to be a score.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(
	resolve(HERE, "../../../app/emulator/score.js"),
	"utf8",
);

/** One `score` block of the catalogue, as the page receives it. */
type ScoreBlock = {
	bcd: number[];
	multiplier: number;
	inGame: { offset: number; is?: number; not?: number };
};

type Decoded = { inGame: boolean; score: number | null };

type Decoder = {
	decode: (state: Uint8Array, block: ScoreBlock) => Decoded | null;
};

/** The decoder as the page gets it: the file run with a window to hang it on. */
function loadDecoder(): Decoder {
	const window: { SalaScore?: Decoder } = {};
	runInNewContext(SOURCE, { window });
	if (!window.SalaScore)
		throw new Error("score.js did not define window.SalaScore");
	return window.SalaScore;
}

/** A savestate of `length` zero bytes, with the pairs' bytes written into it. */
function state(length: number, ...at: [number, number][]): Uint8Array {
	const bytes = new Uint8Array(length);
	for (const [offset, value] of at) {
		bytes[offset] = value;
	}
	return bytes;
}

const ENDURO: ScoreBlock = {
	bcd: [0xa6, 0xa5, 0xa4],
	multiplier: 1,
	inGame: { offset: 0x90, is: 0xff },
};

const FROGGER: ScoreBlock = {
	bcd: [0x453c, 0x453b],
	multiplier: 10,
	inGame: { offset: 0x454c, not: 0x00 },
};

describe("the score decoder", () => {
	it("reads Enduro's odometer most significant byte first", () => {
		const decoded = loadDecoder().decode(
			state(512, [0xa6, 0x01], [0xa5, 0x23], [0xa4, 0x45], [0x90, 0xff]),
			ENDURO,
		);

		expect(decoded).toEqual({ inGame: true, score: 12345 });
	});

	it("restores the digits Frogger does not store", () => {
		const decoded = loadDecoder().decode(
			state(0x454d, [0x453c, 0x12], [0x453b, 0x34], [0x454c, 0x01]),
			FROGGER,
		);

		expect(decoded).toEqual({ inGame: true, score: 12340 });
	});

	it("refuses a byte that is not two decimal digits", () => {
		const decode = loadDecoder();

		// A high nibble and a low one outside 0-9: the bytes are not a score.
		expect(decode.decode(state(512, [0xa6, 0xa0]), ENDURO)?.score).toBeNull();
		expect(decode.decode(state(512, [0xa6, 0x0a]), ENDURO)?.score).toBeNull();
	});

	it("refuses a savestate shorter than the offsets it reads", () => {
		const decode = loadDecoder();

		// Both of Enduro's offsets are past the end of 100 bytes.
		expect(decode.decode(state(100), ENDURO)).toEqual({
			inGame: false,
			score: null,
		});
		// Frogger's flag is a `not`: reading past the end would turn the attract
		// demo's silence into a match.
		expect(decode.decode(state(100), FROGGER)).toEqual({
			inGame: false,
			score: null,
		});
	});

	it("reads the in-game flag both ways round", () => {
		const decode = loadDecoder();

		// Enduro says which byte means playing.
		expect(decode.decode(state(512, [0x90, 0xff]), ENDURO)?.inGame).toBe(true);
		expect(decode.decode(state(512, [0x90, 0x00]), ENDURO)?.inGame).toBe(false);
		// Frogger says which byte means the attract demo.
		expect(decode.decode(state(0x454d, [0x454c, 0x00]), FROGGER)?.inGame).toBe(
			false,
		);
		expect(decode.decode(state(0x454d, [0x454c, 0x01]), FROGGER)?.inGame).toBe(
			true,
		);
	});
});
