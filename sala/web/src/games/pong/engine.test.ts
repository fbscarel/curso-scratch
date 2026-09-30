import { describe, expect, it } from "vitest";
import {
	BALL_RADIUS,
	BALL_SPEED_MAX,
	BALL_SPEED_START,
	BALL_SPEED_STEP,
	CPU_FACE,
	CPU_REACTION_MS,
	createState,
	FIELD_HEIGHT,
	FIELD_WIDTH,
	FIXED_STEP_MS,
	MAX_BOUNCE_ANGLE,
	MAX_STEP_MS,
	NO_EVENTS,
	PADDLE_HEIGHT,
	PLAYER_FACE,
	type PongEvent,
	type PongInput,
	type PongState,
	START_LIVES,
	step,
} from "@/games/pong/engine";

const IDLE: PongInput = { up: false, down: false };

/**
 * advance plays a stretch of game time and answers everything that happened in
 * it.
 *
 * The slice is the fixed one the loop uses, because that is the step the rules
 * are written against -- and it is short enough that nothing is measured across
 * a jump.
 */
function advance(
	state: PongState,
	ms: number,
	input: PongInput = IDLE,
): PongEvent[] {
	const events: PongEvent[] = [];
	let left = ms;
	while (left > 0 && !state.over) {
		const dt = Math.min(FIXED_STEP_MS, left);
		events.push(...step(state, dt, input));
		left -= dt;
	}
	return events;
}

/**
 * ballAtPlayer puts the ball one step away from the player's paddle, at height
 * `y`, travelling toward it.
 *
 * A rally is built out of positions like this one: the rules only care where the
 * ball crosses the paddle's face, so starting the ball a fraction of a step
 * short of it is the whole setup a hit needs.
 */
function ballAtPlayer(
	state: PongState,
	y: number,
	speed = BALL_SPEED_START,
): void {
	state.ball.x = PLAYER_FACE + BALL_RADIUS + 0.5;
	state.ball.y = y;
	state.ball.speed = speed;
	state.ball.vx = -speed;
	state.ball.vy = 0;
}

/** ballPastPlayer puts the ball off the player's side, already lost. */
function ballPastPlayer(state: PongState): PongEvent[] {
	state.ball.x = -BALL_RADIUS;
	state.ball.y = FIELD_HEIGHT / 2;
	state.ball.speed = BALL_SPEED_START;
	state.ball.vx = -BALL_SPEED_START;
	state.ball.vy = 0;
	return [...step(state, FIXED_STEP_MS, IDLE)];
}

/**
 * snapshot is everything about a state except its generator, which is a function
 * and so compares by identity rather than by what it would draw next.
 */
function snapshot(state: PongState) {
	return {
		ball: { ...state.ball },
		player: { ...state.player },
		cpu: { ...state.cpu },
		score: state.score,
		lives: state.lives,
		elapsedMs: state.elapsedMs,
		over: state.over,
	};
}

describe("createState", () => {
	it("starts a level game with a full stock of lives and no points", () => {
		const state = createState(1);

		expect(state.score).toBe(0);
		expect(state.lives).toBe(START_LIVES);
		expect(state.over).toBe(false);
		expect(state.player.y).toBe(FIELD_HEIGHT / 2);
		expect(state.cpu.y).toBe(FIELD_HEIGHT / 2);
	});

	it("serves the ball from the middle toward the player", () => {
		const state = createState(1);

		expect(state.ball.x).toBe(FIELD_WIDTH / 2);
		expect(state.ball.y).toBe(FIELD_HEIGHT / 2);
		expect(state.ball.speed).toBe(BALL_SPEED_START);
		expect(state.ball.vx).toBeLessThan(0);
		expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(
			BALL_SPEED_START,
		);
		// The serve is a draw, but a shallow one: the kid gets a ball they can
		// actually reach with a paddle they have not moved yet.
		expect(Math.abs(state.ball.vy)).toBeLessThanOrEqual(
			BALL_SPEED_START * Math.sin(Math.PI / 6),
		);
	});

	it("draws a different serve for a different seed, and the same one twice", () => {
		const angles = [1, 2, 3, 4, 5].map((seed) => createState(seed).ball.vy);

		expect(createState(3).ball.vy).toBe(angles[2]);
		expect(new Set(angles).size).toBeGreaterThan(1);
	});
});

describe("step", () => {
	it("bounces the ball off the top and bottom walls", () => {
		const top = createState(2);
		top.ball.x = FIELD_WIDTH / 2;
		top.ball.y = BALL_RADIUS + 0.2;
		top.ball.vx = 0;
		top.ball.vy = -BALL_SPEED_START;

		expect(step(top, FIXED_STEP_MS, IDLE)).toEqual([{ type: "wall" }]);
		expect(top.ball.y).toBe(BALL_RADIUS);
		expect(top.ball.vy).toBe(BALL_SPEED_START);

		const bottom = createState(2);
		bottom.ball.x = FIELD_WIDTH / 2;
		bottom.ball.y = FIELD_HEIGHT - BALL_RADIUS - 0.2;
		bottom.ball.vx = 0;
		bottom.ball.vy = BALL_SPEED_START;

		expect(step(bottom, FIXED_STEP_MS, IDLE)).toEqual([{ type: "wall" }]);
		expect(bottom.ball.y).toBe(FIELD_HEIGHT - BALL_RADIUS);
		expect(bottom.ball.vy).toBe(-BALL_SPEED_START);
	});

	it("gives the player a point and speeds the ball up on a paddle hit", () => {
		const state = createState(4);
		ballAtPlayer(state, state.player.y);

		expect(step(state, FIXED_STEP_MS, IDLE)).toEqual([
			{ type: "hit", paddle: "player", score: 1 },
		]);
		expect(state.score).toBe(1);
		expect(state.lives).toBe(START_LIVES);
		expect(state.ball.speed).toBe(BALL_SPEED_START + BALL_SPEED_STEP);
		expect(state.ball.vx).toBeGreaterThan(0);
		expect(state.ball.x).toBeCloseTo(PLAYER_FACE + BALL_RADIUS);
		expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(
			state.ball.speed,
		);
	});

	it("stops speeding the ball up at the cap", () => {
		const state = createState(6);

		ballAtPlayer(state, state.player.y, BALL_SPEED_MAX - 1);
		step(state, FIXED_STEP_MS, IDLE);
		expect(state.ball.speed).toBe(BALL_SPEED_MAX);

		ballAtPlayer(state, state.player.y, BALL_SPEED_MAX);
		step(state, FIXED_STEP_MS, IDLE);
		expect(state.ball.speed).toBe(BALL_SPEED_MAX);
		expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(
			BALL_SPEED_MAX,
		);
	});

	it("sends the ball off at an angle taken from where the paddle was hit", () => {
		const middle = createState(8);
		ballAtPlayer(middle, middle.player.y);
		step(middle, FIXED_STEP_MS, IDLE);
		expect(middle.ball.vy).toBeCloseTo(0);
		expect(middle.ball.vx).toBeCloseTo(middle.ball.speed);

		const above = createState(8);
		ballAtPlayer(above, above.player.y - PADDLE_HEIGHT / 4);
		step(above, FIXED_STEP_MS, IDLE);
		expect(above.ball.vy).toBeLessThan(0);
		expect(above.ball.vx).toBeGreaterThan(0);

		// The further from the middle it lands, the steeper it leaves.
		const edge = createState(8);
		ballAtPlayer(edge, edge.player.y - PADDLE_HEIGHT / 2);
		step(edge, FIXED_STEP_MS, IDLE);
		expect(edge.ball.vy).toBeLessThan(above.ball.vy);
		expect(Math.abs(edge.ball.vy)).toBeLessThanOrEqual(
			edge.ball.speed * Math.sin(MAX_BOUNCE_ANGLE) + 1e-9,
		);

		const below = createState(8);
		ballAtPlayer(below, below.player.y + PADDLE_HEIGHT / 2);
		step(below, FIXED_STEP_MS, IDLE);
		expect(below.ball.vy).toBeGreaterThan(0);
		// Symmetric: the two ends of the paddle are the same shot, mirrored.
		expect(below.ball.vy).toBeCloseTo(-edge.ball.vy);
	});

	it("returns the ball when it comes to the CPU's paddle", () => {
		const state = createState(9);
		state.cpu.y = 30;
		state.cpu.aimY = 30;
		state.ball.x = CPU_FACE - BALL_RADIUS - 0.5;
		state.ball.y = 30;
		state.ball.speed = BALL_SPEED_START;
		state.ball.vx = BALL_SPEED_START;
		state.ball.vy = 0;

		expect(step(state, FIXED_STEP_MS, IDLE)).toEqual([
			{ type: "hit", paddle: "cpu", score: 0 },
		]);
		expect(state.ball.vx).toBeLessThan(0);
		expect(state.ball.x).toBeCloseTo(CPU_FACE - BALL_RADIUS);
		// The machine returning the ball is not a point for anybody.
		expect(state.score).toBe(0);
	});

	it("holds the CPU still until its reaction has elapsed", () => {
		const state = createState(10);
		ballAtPlayer(state, state.player.y + PADDLE_HEIGHT / 2);

		expect(step(state, FIXED_STEP_MS, IDLE)).toEqual([
			{ type: "hit", paddle: "player", score: 1 },
		]);
		expect(state.cpu.reactAtMs).toBe(state.elapsedMs + CPU_REACTION_MS);

		// The ball is on its way down and the CPU has not looked yet.
		advance(state, CPU_REACTION_MS - 100);
		expect(state.cpu.y).toBe(FIELD_HEIGHT / 2);

		advance(state, 200);
		expect(state.cpu.y).toBeGreaterThan(FIELD_HEIGHT / 2);
	});

	it("is beatable: a fast, steep ball gets past the CPU", () => {
		const state = createState(11);
		state.cpu.y = 20;
		state.cpu.aimY = 20;
		state.cpu.reactAtMs = state.elapsedMs + CPU_REACTION_MS;
		state.ball.x = CPU_FACE - 20;
		state.ball.y = FIELD_HEIGHT - 5;
		state.ball.speed = BALL_SPEED_MAX;
		state.ball.vx = BALL_SPEED_MAX;
		state.ball.vy = 0;

		let passed = false;
		let hits = 0;
		for (let i = 0; i < 120 && !passed; i += 1) {
			const events = step(state, FIXED_STEP_MS, IDLE);
			hits += events.filter((event) => event.type === "hit").length;
			passed = events.some((event) => event.type === "cpu-miss");
		}

		expect(passed).toBe(true);
		expect(hits).toBe(0);
		// A ball the machine could not reach is not a ball the kid lost.
		expect(state.lives).toBe(START_LIVES);
		expect(state.score).toBe(0);
		// Served again from the middle, toward the player, at its slowest.
		expect(state.ball.x).toBe(FIELD_WIDTH / 2);
		expect(state.ball.y).toBe(FIELD_HEIGHT / 2);
		expect(state.ball.speed).toBe(BALL_SPEED_START);
		expect(state.ball.vx).toBeLessThan(0);
	});

	it("costs a life when the ball gets past the player, and serves again", () => {
		const state = createState(12);

		expect(ballPastPlayer(state)).toEqual([{ type: "miss", lives: 2 }]);
		expect(state.lives).toBe(2);
		expect(state.score).toBe(0);
		expect(state.over).toBe(false);
		expect(state.ball.x).toBe(FIELD_WIDTH / 2);
		expect(state.ball.y).toBe(FIELD_HEIGHT / 2);
		expect(state.ball.speed).toBe(BALL_SPEED_START);
		expect(state.ball.vx).toBeLessThan(0);
	});

	it("ends the game when the last life goes, with the hits as the score", () => {
		const state = createState(13);
		ballAtPlayer(state, state.player.y);
		step(state, FIXED_STEP_MS, IDLE);
		expect(state.score).toBe(1);

		expect(ballPastPlayer(state)).toEqual([{ type: "miss", lives: 2 }]);
		expect(ballPastPlayer(state)).toEqual([{ type: "miss", lives: 1 }]);
		expect(ballPastPlayer(state)).toEqual([
			{ type: "miss", lives: 0 },
			{ type: "over", score: 1 },
		]);
		expect(state.over).toBe(true);
		expect(state.lives).toBe(0);

		// A game that is over does not move, and does not announce itself twice.
		const frozen = { ...state.ball, elapsedMs: state.elapsedMs };
		expect(step(state, FIXED_STEP_MS, { up: true, down: false })).toBe(
			NO_EVENTS,
		);
		expect({ ...state.ball, elapsedMs: state.elapsedMs }).toEqual(frozen);
	});

	it("hands back the shared empty list when nothing happened", () => {
		const state = createState(14);
		state.ball.x = FIELD_WIDTH / 2;
		state.ball.y = FIELD_HEIGHT / 2;
		state.ball.vx = -BALL_SPEED_START;
		state.ball.vy = 0;

		expect(step(state, FIXED_STEP_MS, IDLE)).toBe(NO_EVENTS);
		expect(Object.isFrozen(NO_EVENTS)).toBe(true);
	});

	it("advances at most one slice, however long the caller was away", () => {
		const state = createState(15);
		const before = state.ball.x;

		step(state, 10_000, IDLE);

		expect(state.elapsedMs).toBe(MAX_STEP_MS);
		expect(state.ball.x).toBeGreaterThan(before - 5);
		expect(state.ball.x).toBeLessThan(before);
	});

	it("is the same game for the same seed and the same input", () => {
		const one = createState(21);
		const other = createState(21);
		const third = createState(22);

		// A player who never misses: the ball is returned every time, so the
		// game keeps going and the comparison has a long rally in it.
		for (let i = 0; i < 3000; i += 1) {
			const input: PongInput = {
				up: one.ball.y < one.player.y,
				down: one.ball.y > one.player.y,
			};
			step(one, FIXED_STEP_MS, input);
			step(other, FIXED_STEP_MS, input);
			step(third, FIXED_STEP_MS, input);
		}

		expect(one.score).toBeGreaterThan(0);
		expect(snapshot(other)).toEqual(snapshot(one));
		// The generator is part of the state too: the next serve is the same
		// draw, so the game stays identical past the steps that were compared.
		expect(other.rng()).toBe(one.rng());
		// A different seed is a different game, from the very first serve.
		expect(third.ball).not.toEqual(one.ball);
	});

	it("ends a long game with a score when a player has a kid's reaction time", () => {
		const state = createState(1234);
		const events: PongEvent[] = [];
		// The player is looking at where the ball was a quarter of a second ago,
		// which is what a person does -- and why a ball that has sped up and is
		// leaving at an angle gets past them.
		const LAG_STEPS = Math.round(250 / FIXED_STEP_MS);
		const trail: number[] = [];
		let steps = 0;

		while (!state.over && steps < 120 * 120) {
			const seen = trail[trail.length - LAG_STEPS] ?? state.ball.y;
			const input: PongInput = {
				up: seen < state.player.y - 1,
				down: seen > state.player.y + 1,
			};
			events.push(...step(state, FIXED_STEP_MS, input));
			trail.push(state.ball.y);
			steps += 1;
		}

		expect(state.over).toBe(true);
		expect(steps).toBeLessThan(120 * 120);
		expect(state.score).toBeGreaterThan(0);
		expect(state.score).toBe(
			events.filter(
				(event) => event.type === "hit" && event.paddle === "player",
			).length,
		);
		expect(events.filter((event) => event.type === "over")).toHaveLength(1);
		expect(events.filter((event) => event.type === "miss")).toHaveLength(
			START_LIVES,
		);
	});
});
