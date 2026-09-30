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
type InGameTest = { offset: number; is?: number; not?: number };
type InGame = InGameTest | { any: InGameTest[] } | { all: InGameTest[] };

type ScoreBlock = {
	bcd?: number[];
	digits?: number[];
	digitShift?: number;
	blank?: number;
	multiplier: number;
	inGame: InGame;
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

// The other games the catalogue reads a score from, with the offsets they
// really use: one digit per byte (River Raid shifts it three bits up and writes
// 0x58 in an empty cell; Galaga keeps a Namco tile code, 0x24 for a blank), and
// the flags that need more than one test (Pitfall! freezes the frame and plays
// the death tune at the same time; River Raid's lives cell is blank outside a
// match and zero for the first frames after power-on; Space Invaders' demo flag
// and its game-over latch are two different bytes).
const SPACE_INVADERS: ScoreBlock = {
	bcd: [0xe2, 0xe4],
	multiplier: 1,
	inGame: {
		all: [
			{ offset: 0xa6, not: 0x80 },
			{ offset: 0xe1, not: 0x80 },
		],
	},
};

const RIVER_RAID: ScoreBlock = {
	digits: [0xc9, 0xcb, 0xcd, 0xcf, 0xd1, 0xd3],
	digitShift: 3,
	blank: 0x58,
	multiplier: 1,
	inGame: {
		all: [
			{ offset: 0xbc, not: 0x58 },
			{ offset: 0xbc, not: 0x00 },
		],
	},
};

const GALAGA: ScoreBlock = {
	digits: [0x1c2d9, 0x1c2d8, 0x1c2d7, 0x1c2d6, 0x1c2d5, 0x1c2d4],
	blank: 0x24,
	multiplier: 1,
	inGame: { offset: 0x1ceee, is: 0x01 },
};

const PITFALL: ScoreBlock = {
	bcd: [0xd1, 0xd2, 0xd3],
	multiplier: 1,
	inGame: {
		any: [
			{ offset: 0x9a, is: 0x00 },
			{ offset: 0xdc, not: 0x00 },
		],
	},
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

	it("reads one digit per byte, shifted up, with a blank cell as a zero", () => {
		const decoded = loadDecoder().decode(
			state(
				0x100,
				// The six digits of the score, most significant first: an empty
				// cell, the constant hundreds, and 6 and 9 in the last two.
				[0xc9, 0x58],
				[0xcb, 0x58],
				[0xcd, 0x58],
				[0xcf, 0x58],
				[0xd1, 0x30],
				[0xd3, 0x48],
				// The lives digit is not the blank, so the race is running.
				[0xbc, 0x18],
			),
			RIVER_RAID,
		);

		expect(decoded).toEqual({ inGame: true, score: 69 });
	});

	it("reads Galaga's tiles most significant last, with the blank tile as a zero", () => {
		const decoded = loadDecoder().decode(
			state(
				0x1cf00,
				[0x1c2d9, 0x24],
				[0x1c2d8, 0x24],
				[0x1c2d7, 0x00],
				[0x1c2d6, 0x09],
				[0x1c2d5, 0x07],
				[0x1c2d4, 0x00],
				[0x1ceee, 0x01],
			),
			GALAGA,
		);

		expect(decoded).toEqual({ inGame: true, score: 970 });
	});

	it("refuses a byte that is not one decimal digit", () => {
		const decode = loadDecoder();

		// Bits below the digit's place: the byte is not `digit << 3`.
		expect(
			decode.decode(state(0x100, [0xd3, 0x49]), RIVER_RAID)?.score,
		).toBeNull();
		// Shifted back it is ten, which is not a digit.
		expect(
			decode.decode(state(0x100, [0xd3, 0x50]), RIVER_RAID)?.score,
		).toBeNull();
		// Galaga's tiles run 0x00-0x09 and 0x24; a character tile is not one.
		expect(
			decode.decode(state(0x1cf00, [0x1c2d4, 0x0a]), GALAGA)?.score,
		).toBeNull();
	});

	it("refuses a savestate shorter than the digit offsets it reads", () => {
		// The score bytes and the flag are all past the end of 100 bytes.
		expect(loadDecoder().decode(state(100), RIVER_RAID)).toEqual({
			inGame: false,
			score: null,
		});
		expect(loadDecoder().decode(state(100), GALAGA)).toEqual({
			inGame: false,
			score: null,
		});
	});

	it("accepts any of the in-game tests", () => {
		const decode = loadDecoder();

		// The game frame is the player's: the ROM is running a match.
		expect(decode.decode(state(0x100, [0x9a, 0x00]), PITFALL)?.inGame).toBe(
			true,
		);
		// A death: the frame is frozen and the tune is playing.
		expect(
			decode.decode(state(0x100, [0x9a, 0x84], [0xdc, 0x31]), PITFALL)?.inGame,
		).toBe(true);
		// Title and game over: neither test holds.
		expect(
			decode.decode(state(0x100, [0x9a, 0x84], [0xdc, 0x00]), PITFALL)?.inGame,
		).toBe(false);
		// A savestate too short for either byte is not a match.
		expect(decode.decode(state(0x80), PITFALL)).toEqual({
			inGame: false,
			score: null,
		});
	});

	it("needs every one of the in-game tests when the flag says all", () => {
		const decode = loadDecoder();
		// The single point the demonstration leaves in the score bytes.
		const demo = [0xd3, 0x08] as [number, number];

		// The first frames after power-on: the lives cell is still zero, so the
		// match has not started -- and the demonstration's score is already
		// there, which is exactly the number that must not be filed.
		expect(decode.decode(state(0x100, demo, [0xbc, 0x00]), RIVER_RAID)).toEqual(
			{ inGame: false, score: 1 },
		);
		// The attract demo: the lives cell is blank.
		expect(
			decode.decode(state(0x100, demo, [0xbc, 0x58]), RIVER_RAID)?.inGame,
		).toBe(false);
		// Three planes in hand: a match.
		expect(decode.decode(state(0x100, demo, [0xbc, 0x18]), RIVER_RAID)).toEqual(
			{ inGame: true, score: 1 },
		);
	});

	it("keeps Space Invaders' flag off in the demo and after the last life", () => {
		const decode = loadDecoder();
		// The score the game leaves on the bytes: one hundred, four digits.
		const score = [0xe2, 0x01] as [number, number];

		// The attract demo: the demo flag ($AA bit 7) is set, and the bytes the
		// demo writes there are the illegal pattern 0xAA/0xA1.
		expect(
			decode.decode(
				state(0x100, [0xa6, 0x80], [0xe2, 0xaa], [0xe4, 0xa1]),
				SPACE_INVADERS,
			),
		).toEqual({ inGame: false, score: null });
		// A match, and a death inside it: the flag byte is one of the playing
		// values and the game-over latch is still clear.
		expect(
			decode.decode(
				state(0x100, score, [0xa6, 0x04], [0xe1, 0x00]),
				SPACE_INVADERS,
			),
		).toEqual({ inGame: true, score: 100 });
		// The last life lost: the ROM sets the latch ($E5 bit 7) and the score
		// stays on the screen -- the number must not be filed again.
		expect(
			decode.decode(
				state(0x100, score, [0xa6, 0x01], [0xe1, 0x80]),
				SPACE_INVADERS,
			),
		).toEqual({ inGame: false, score: 100 });
	});
});
