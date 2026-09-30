import { afterEach, describe, expect, it } from "vitest";
import {
	BALL_RADIUS,
	CPU_FACE,
	createState,
	FIELD_HEIGHT,
	FIELD_WIDTH,
	PADDLE_HEIGHT,
	PADDLE_WIDTH,
	PLAYER_FACE,
	type PongState,
} from "@/games/pong/engine";
import { drawBoard, isTypingTarget } from "@/games/pong/PongGame";

/**
 * What the board is made of.
 *
 * jsdom has no canvas, and the board is nothing but rectangles: what a test can
 * check is not a picture but the list of rectangles the renderer asked for --
 * two paddles of the rules' own size on the rules' own faces, one ball, and a
 * net of dashes down the middle. The rules themselves are tested in
 * engine.test.ts; this is the drawing of them.
 */

/** One rectangle the renderer asked for, with the ink that was set at the time. */
interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
	ink: string;
}

/**
 * recorder is a 2D context that writes down what was drawn on it.
 *
 * It answers the two properties drawBoard touches and the one method it calls,
 * and nothing else: a stand-in that answered more would be a canvas library
 * this test does not need.
 */
function recorder(): { context: CanvasRenderingContext2D; rects: Rect[] } {
	const rects: Rect[] = [];
	let ink = "";
	const context = {
		get fillStyle(): string {
			return ink;
		},
		set fillStyle(value: string) {
			ink = value;
		},
		imageSmoothingEnabled: true,
		fillRect(x: number, y: number, width: number, height: number): void {
			rects.push({ x, y, width, height, ink });
		},
	};
	return { context: context as unknown as CanvasRenderingContext2D, rects };
}

/**
 * A canvas measuring the field at exactly ten pixels a unit.
 *
 * Whole pixels, and every position in the state an integer: a rectangle can
 * then be asserted exactly rather than within a pixel of slack.
 */
const SCALE = 10;
const BOARD_WIDTH = FIELD_WIDTH * SCALE;
const BOARD_HEIGHT = FIELD_HEIGHT * SCALE;

/** midRally is a game in play, with the actors at the heights a rally would put them at. */
function midRally(): PongState {
	const state = createState(7);
	state.ball.x = 100;
	state.ball.y = 30;
	state.player.y = 40;
	state.cpu.y = 20;
	return state;
}

describe("drawBoard", () => {
	it("draws the two paddles, one square ball and a net of dashes", () => {
		const { context, rects } = recorder();
		drawBoard(context, midRally(), BOARD_WIDTH, BOARD_HEIGHT);

		// Nothing here is scaled and nothing is smoothed: the board's whole look
		// is its hard edges.
		expect(context.imageSmoothingEnabled).toBe(false);

		// The screen first, and the whole of it, in black.
		expect(rects[0]).toEqual({
			x: 0,
			y: 0,
			width: BOARD_WIDTH,
			height: BOARD_HEIGHT,
			ink: "#000000",
		});
		const marks = rects.slice(1);
		expect(marks.every((rect) => rect.ink === "#ffffff")).toBe(true);

		// The paddles: the rules' own size, and on the planes the rules measure a
		// hit against -- the player's left block against PLAYER_FACE, the
		// machine's right one from CPU_FACE on.
		const paddles = marks.filter(
			(rect) => rect.height === PADDLE_HEIGHT * SCALE,
		);
		expect(paddles).toEqual([
			{
				x: Math.round((PLAYER_FACE - PADDLE_WIDTH) * SCALE),
				y: (40 - PADDLE_HEIGHT / 2) * SCALE,
				width: PADDLE_WIDTH * SCALE,
				height: PADDLE_HEIGHT * SCALE,
				ink: "#ffffff",
			},
			{
				x: Math.round(CPU_FACE * SCALE),
				y: (20 - PADDLE_HEIGHT / 2) * SCALE,
				width: PADDLE_WIDTH * SCALE,
				height: PADDLE_HEIGHT * SCALE,
				ink: "#ffffff",
			},
		]);
		// The face a paddle turns to the field is the plane the ball turns on.
		expect(paddles.map((rect) => rect.x + rect.width)).toEqual([
			Math.round(PLAYER_FACE * SCALE),
			Math.round((CPU_FACE + PADDLE_WIDTH) * SCALE),
		]);

		// The ball: a square whose side is the diameter the rules bounce with,
		// centred on the ball.
		const side = BALL_RADIUS * 2 * SCALE;
		const balls = marks.filter(
			(rect) => rect.width === side && rect.height === side,
		);
		expect(balls).toEqual([
			{
				x: (100 - BALL_RADIUS) * SCALE,
				y: (30 - BALL_RADIUS) * SCALE,
				width: side,
				height: side,
				ink: "#ffffff",
			},
		]);

		// The net, which is everything white that is neither a paddle nor the
		// ball: dashes down the middle of the field, end to end, with field
		// between them rather than one line drawn down the board.
		const dashes = marks.filter(
			(rect) => !paddles.includes(rect) && !balls.includes(rect),
		);
		expect(dashes.length).toBeGreaterThan(1);
		expect(new Set(dashes.map((dash) => dash.height)).size).toBe(1);
		expect(Math.max(...dashes.map((dash) => dash.width))).toBeLessThan(side);
		const columns = Array.from(new Set(dashes.map((dash) => dash.x)));
		expect(columns).toHaveLength(1);
		expect(columns[0]).toBeGreaterThanOrEqual(Math.floor(BOARD_WIDTH / 2) - 10);
		expect(columns[0]).toBeLessThanOrEqual(Math.ceil(BOARD_WIDTH / 2));
		// Dashed, not solid: every dash starts below the end of the one before it.
		let previousBottom = Number.NEGATIVE_INFINITY;
		for (const dash of dashes) {
			expect(dash.y).toBeGreaterThanOrEqual(previousBottom + dash.height);
			previousBottom = dash.y + dash.height;
		}
		expect(Math.min(...dashes.map((dash) => dash.y))).toBeLessThan(
			BOARD_HEIGHT * 0.1,
		);
		expect(
			Math.max(...dashes.map((dash) => dash.y + dash.height)),
		).toBeGreaterThan(BOARD_HEIGHT * 0.9);
	});

	it("keeps the field's own proportions on a canvas that is not its shape", () => {
		const { context, rects } = recorder();
		const state = midRally();
		state.ball.x = FIELD_WIDTH / 2;
		state.ball.y = FIELD_HEIGHT / 2;
		drawBoard(context, state, 900, 900);

		// The ball is the only square mark on the board, and on the middle of the
		// field it is on the middle of the canvas: the field is scaled by one
		// factor on both axes and centred, rather than stretched into the shape.
		const balls = rects.filter(
			(rect) => rect.ink === "#ffffff" && rect.width === rect.height,
		);
		expect(balls).toHaveLength(1);
		expect(balls.map((ball) => ball.x + ball.width / 2)).toEqual([450]);
		expect(balls.map((ball) => ball.y + ball.height / 2)).toEqual([450]);
		// Three field units at the field's own scale, to the pixel it is rounded to.
		const unit = 900 / FIELD_WIDTH;
		const drawn = balls.map((ball) => ball.width)[0] ?? 0;
		expect(Math.abs(drawn - unit * BALL_RADIUS * 2)).toBeLessThanOrEqual(1);
	});
});

/**
 * Which keys are the game's to take.
 *
 * The game listens on the window, so it hears every keystroke on the page. A
 * key pressed in a field belongs to that field, and the fields this can ask
 * about are the ones a document carries: an input, a textarea, a select. An
 * editable region is the guard's other half, and it is asked of the browser
 * (`isContentEditable`), which jsdom does not implement -- so that half is
 * checked in a browser, not here.
 */
describe("isTypingTarget", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("is true for the fields a kid types in", () => {
		document.body.innerHTML = `
			<input id="texto" />
			<textarea id="area"></textarea>
			<select id="lista"></select>
		`;

		for (const id of ["texto", "area", "lista"]) {
			expect(isTypingTarget(document.getElementById(id))).toBe(true);
		}
	});

	it("is false for the rest of the page", () => {
		document.body.innerHTML = `
			<button id="botao">Jogar</button>
			<canvas id="tela"></canvas>
		`;

		expect(isTypingTarget(document.getElementById("botao"))).toBe(false);
		expect(isTypingTarget(document.getElementById("tela"))).toBe(false);
		expect(isTypingTarget(document.body)).toBe(false);
		// The listener is on the window, so an event with no element under it --
		// the window itself, or nothing at all -- is nobody's field.
		expect(isTypingTarget(window)).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});
