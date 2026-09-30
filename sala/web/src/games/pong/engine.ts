/**
 * Pong, as rules rather than as pixels.
 *
 * Nothing here touches the DOM, a clock or a speaker: the whole game is one
 * value that `step` advances by a slice of time and the keys that are down. That
 * is what makes the rules testable at all -- "a hit is worth a point and speeds
 * the ball up until a cap" is a claim about a function, and it can be checked by
 * calling it instead of by watching a canvas.
 *
 * The unit is the field: 160 by 90, the same shape as the picture, so a position
 * here is a position on the screen. `x` grows to the right and `y` grows
 * DOWNWARD, which is how a picture is addressed; the renderer flips y into the
 * upward axis three draws with, in one place of its own.
 *
 * Every random choice comes from a seeded generator carried in the state, so two
 * states built from the same seed and stepped with the same input stay identical
 * for as long as anybody cares to step them.
 */

/** The field the ball is played in, in game units. 16:9, like the picture. */
export const FIELD_WIDTH = 160;
export const FIELD_HEIGHT = 90;

/** How thick and how tall a paddle is. Tall enough to be a target at a glance. */
export const PADDLE_WIDTH = 2.5;
export const PADDLE_HEIGHT = 18;

/** The distance from the wall to the middle of a paddle. */
export const PADDLE_MARGIN = 5;

export const BALL_RADIUS = 1.5;

/** The inner surface of each paddle: the plane the ball actually touches. */
export const PLAYER_FACE = PADDLE_MARGIN + PADDLE_WIDTH / 2;
export const CPU_FACE = FIELD_WIDTH - PLAYER_FACE;

/** How many balls the player may let past before the game is over. */
export const START_LIVES = 3;

/**
 * How fast the player's paddle follows the keys, and how fast the CPU's follows
 * the ball.
 *
 * The player is quicker than the ball can ever be, so a lost life is always a
 * life the kid could have saved -- and the CPU is slower than the ball at its
 * cap, so the game can be won by making the ball fast.
 */
export const PLAYER_SPEED = 105;
export const CPU_SPEED = 55;

/** The ball starts here, gains this much per paddle hit, and never passes the cap. */
export const BALL_SPEED_START = 60;
export const BALL_SPEED_STEP = 5;
export const BALL_SPEED_MAX = 92;

/**
 * How long the CPU keeps its old aim after the ball turns its way.
 *
 * A paddle that is slower than the ball AND blind for a fifth of a second can
 * still return almost everything -- which is the point. It loses the balls that
 * arrive fast and far from where it was looking, so a kid who keeps the ball
 * alive gets rewarded with a point instead of with an unbeatable wall.
 */
export const CPU_REACTION_MS = 220;

/** The steepest angle a paddle can send the ball off at, and the widest serve. */
export const MAX_BOUNCE_ANGLE = Math.PI / 3;
export const MAX_SERVE_ANGLE = Math.PI / 6;

/**
 * The slice `step` is meant to be called with, and the most it will advance in
 * one call.
 *
 * A fixed slice is what keeps the game the same game on a slow machine: the
 * caller feeds real elapsed time in fixed portions, so a frame that took twice
 * as long moves the ball twice as far in two steps rather than once in one big
 * jump. The cap is the other half of that: a tab that was hidden for a minute
 * comes back to a ball a step away from where it was, not one already past both
 * paddles.
 */
export const FIXED_STEP_MS = 1000 / 120;
export const MAX_STEP_MS = 50;

/** Which way the player is asking the paddle to go. Both keys down means neither. */
export interface PongInput {
	up: boolean;
	down: boolean;
}

/** A number in [0, 1). The state's source of randomness, seeded and reproducible. */
export type Rng = () => number;

/** The ball: where it is and how fast it is going, in units and units per second. */
export interface Ball {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** The magnitude of the velocity, kept so the cap is checked in one place. */
	speed: number;
}

/** A paddle that only has a place to be. */
export interface Paddle {
	y: number;
}

/** The CPU's paddle, which also has somewhere it is looking and since when. */
export interface CpuPaddle extends Paddle {
	/** The height the paddle is heading for; it only changes once the CPU has reacted. */
	aimY: number;
	/** The moment the CPU is allowed to look again, in the state's own clock. */
	reactAtMs: number;
}

/** The whole game. */
export interface PongState {
	ball: Ball;
	player: Paddle;
	cpu: CpuPaddle;
	/** Paddle hits by the player. This is the score. */
	score: number;
	/** Balls the player still has to lose. */
	lives: number;
	elapsedMs: number;
	over: boolean;
	rng: Rng;
}

/**
 * What happened during one step, in the order it happened.
 *
 * The state says what IS; the events say what CHANGED, which is what the picture
 * and the sounds are made of -- a bounce has a flash and a blip, and neither can
 * be derived from two positions without guessing.
 */
export type PongEvent =
	| { type: "wall" }
	| { type: "hit"; paddle: "player" | "cpu"; score: number }
	| { type: "miss"; lives: number }
	| { type: "cpu-miss" }
	| { type: "over"; score: number };

/**
 * The events of a step in which nothing happened.
 *
 * Shared and frozen rather than allocated, because most steps are that step and
 * a game runs a hundred and twenty of them a second. Callers read it; nobody
 * appends to it.
 */
export const NO_EVENTS: readonly PongEvent[] = Object.freeze([]);

/**
 * createRng is a seeded generator (mulberry32), written with integer arithmetic
 * so the same seed gives the same sequence everywhere.
 *
 * A generator rather than a seed-and-index scheme because the ball is served
 * after an event -- a miss -- and the sequence of serves has to be reproducible
 * without the caller having to track how many there have been.
 */
export function createRng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** createState starts a game: paddles level, ball served toward the player. */
export function createState(seed: number): PongState {
	const state: PongState = {
		ball: {
			x: FIELD_WIDTH / 2,
			y: FIELD_HEIGHT / 2,
			vx: 0,
			vy: 0,
			speed: BALL_SPEED_START,
		},
		player: { y: FIELD_HEIGHT / 2 },
		cpu: {
			y: FIELD_HEIGHT / 2,
			aimY: FIELD_HEIGHT / 2,
			reactAtMs: CPU_REACTION_MS,
		},
		score: 0,
		lives: START_LIVES,
		elapsedMs: 0,
		over: false,
		rng: createRng(seed),
	};
	serve(state);
	return state;
}

/**
 * serve puts the ball back in the middle at its starting speed, on its way to
 * the player.
 *
 * Toward the player every time, including the first: the ball a kid has to
 * return is the ball they were just given, and a serve they never had a chance
 * at would read as the game cheating. The angle is the seeded draw, so a game is
 * varied between seeds and identical within one.
 */
function serve(state: PongState): void {
	const ball = state.ball;
	const angle = (state.rng() * 2 - 1) * MAX_SERVE_ANGLE;
	ball.x = FIELD_WIDTH / 2;
	ball.y = FIELD_HEIGHT / 2;
	ball.speed = BALL_SPEED_START;
	ball.vx = -ball.speed * Math.cos(angle);
	ball.vy = ball.speed * Math.sin(angle);
	state.cpu.reactAtMs = state.elapsedMs + CPU_REACTION_MS;
}

/**
 * step advances the game by `dtMs` and answers what happened.
 *
 * The state is advanced in place: a game is a long-lived thing that is read
 * every frame, and rebuilding it sixty times a second would be a copy of the
 * ball, the paddles and the generator per frame for nothing. `dtMs` is clamped
 * to a single slice (see MAX_STEP_MS), so a caller that hands over a minute of
 * elapsed time still gets one sane step. A game that is over does not move.
 */
export function step(
	state: PongState,
	dtMs: number,
	input: PongInput,
): readonly PongEvent[] {
	if (state.over) return NO_EVENTS;

	const dt = clamp(dtMs, 0, MAX_STEP_MS) / 1000;
	state.elapsedMs += dt * 1000;

	const events: PongEvent[] = [];
	movePlayer(state, input, dt);
	moveCpu(state, dt);
	moveBall(state, dt, events);
	return events.length === 0 ? NO_EVENTS : events;
}

/** movePlayer slides the paddle toward the key that is down, inside the field. */
function movePlayer(state: PongState, input: PongInput, dt: number): void {
	const direction = (input.down ? 1 : 0) - (input.up ? 1 : 0);
	if (direction === 0) return;
	state.player.y = clampPaddle(state.player.y + direction * PLAYER_SPEED * dt);
}

/**
 * moveCpu walks the CPU's paddle toward what it is aiming at.
 *
 * What it aims at is the ball, and only while the ball is coming its way -- a
 * paddle that chased a ball it had already returned would be standing wherever
 * that ball ended up, which is a machine nobody can beat. And only once its
 * reaction has elapsed: while it is still reacting it keeps walking toward the
 * last height it looked at, which is what makes a ball that arrives fast and
 * steep beat it.
 */
function moveCpu(state: PongState, dt: number): void {
	const cpu = state.cpu;
	if (state.elapsedMs >= cpu.reactAtMs && state.ball.vx > 0) {
		cpu.aimY = clampPaddle(state.ball.y);
	}

	const difference = cpu.aimY - cpu.y;
	const reach = CPU_SPEED * dt;
	if (Math.abs(difference) <= reach) {
		cpu.y = cpu.aimY;
		return;
	}
	cpu.y = clampPaddle(cpu.y + Math.sign(difference) * reach);
}

/** moveBall moves the ball, bounces it off the walls and paddles, and scores what it did. */
function moveBall(state: PongState, dt: number, events: PongEvent[]): void {
	const ball = state.ball;
	const previousX = ball.x;
	const previousY = ball.y;
	let x = previousX + ball.vx * dt;
	let y = previousY + ball.vy * dt;

	// The walls. The ball is put back on the line rather than left past it, so a
	// bounce off the top cannot walk the ball off the field over the next frames.
	if (y - BALL_RADIUS <= 0 && ball.vy < 0) {
		y = BALL_RADIUS;
		ball.vy = -ball.vy;
		events.push({ type: "wall" });
	} else if (y + BALL_RADIUS >= FIELD_HEIGHT && ball.vy > 0) {
		y = FIELD_HEIGHT - BALL_RADIUS;
		ball.vy = -ball.vy;
		events.push({ type: "wall" });
	}

	// The paddles, checked against the plane the ball's edge crosses during this
	// step rather than against where it ended up: at the ball's top speed a step
	// is short enough that nothing tunnels, but the crossing is what "hit" means
	// and asking it directly costs one division.
	if (ball.vx < 0) {
		const contactY = crossingY(
			previousX - BALL_RADIUS,
			x - BALL_RADIUS,
			previousY,
			y,
			PLAYER_FACE,
		);
		if (
			contactY !== null &&
			Math.abs(contactY - state.player.y) <= PADDLE_HEIGHT / 2 + BALL_RADIUS
		) {
			x = PLAYER_FACE + BALL_RADIUS;
			y = contactY;
			bounce(ball, contactY, state.player.y, 1);
			state.score += 1;
			// The ball is the CPU's problem now, and it is blind for a moment.
			state.cpu.reactAtMs = state.elapsedMs + CPU_REACTION_MS;
			events.push({ type: "hit", paddle: "player", score: state.score });
		}
	} else if (ball.vx > 0) {
		const contactY = crossingY(
			previousX + BALL_RADIUS,
			x + BALL_RADIUS,
			previousY,
			y,
			CPU_FACE,
		);
		if (
			contactY !== null &&
			Math.abs(contactY - state.cpu.y) <= PADDLE_HEIGHT / 2 + BALL_RADIUS
		) {
			x = CPU_FACE - BALL_RADIUS;
			y = contactY;
			bounce(ball, contactY, state.cpu.y, -1);
			events.push({ type: "hit", paddle: "cpu", score: state.score });
		}
	}

	ball.x = x;
	ball.y = y;

	// Off the sides. The player's side costs a life; the CPU's side is simply a
	// ball the kid beat the machine to, which is served again without a penalty.
	if (ball.x + BALL_RADIUS <= 0) {
		state.lives -= 1;
		events.push({ type: "miss", lives: state.lives });
		if (state.lives <= 0) {
			state.over = true;
			events.push({ type: "over", score: state.score });
			return;
		}
		serve(state);
		return;
	}
	if (ball.x - BALL_RADIUS >= FIELD_WIDTH) {
		events.push({ type: "cpu-miss" });
		serve(state);
	}
}

/**
 * crossingY answers the ball's height at the moment its edge reaches `face`, or
 * null when it does not reach it during this step.
 *
 * `previousEdge` and `edge` are the ball's leading edge before and after the
 * move, so the crossing is a linear interpolation and not a search. A ball that
 * is already past the face and still travelling the same way has nothing to
 * cross -- it was missed on an earlier step, or by a paddle that was not there.
 */
function crossingY(
	previousEdge: number,
	edge: number,
	previousY: number,
	y: number,
	face: number,
): number | null {
	const approaching =
		previousEdge >= face ? edge <= face : edge >= face && previousEdge <= face;
	if (!approaching) return null;
	const travel = edge - previousEdge;
	if (travel === 0) return y;
	return previousY + (y - previousY) * ((face - previousEdge) / travel);
}

/**
 * bounce sends the ball off a paddle that was hit at `contactY`.
 *
 * Two things happen here, and they are the whole feel of the game. The ball
 * speeds up, up to a cap, so a rally gets faster and the CPU -- which is slower
 * than the cap -- starts to lose. And the angle is taken from WHERE on the
 * paddle it landed: the middle sends it flat, the ends send it away steeply, so
 * the paddle is a tool the kid aims with rather than a wall that returns
 * whatever arrives.
 */
function bounce(
	ball: Ball,
	contactY: number,
	paddleY: number,
	direction: 1 | -1,
): void {
	ball.speed = Math.min(ball.speed + BALL_SPEED_STEP, BALL_SPEED_MAX);
	const offset = clamp((contactY - paddleY) / (PADDLE_HEIGHT / 2), -1, 1);
	const angle = offset * MAX_BOUNCE_ANGLE;
	ball.vx = direction * ball.speed * Math.cos(angle);
	ball.vy = ball.speed * Math.sin(angle);
}

/** clampPaddle keeps a paddle's middle inside the field, ends included. */
function clampPaddle(y: number): number {
	return clamp(y, PADDLE_HEIGHT / 2, FIELD_HEIGHT - PADDLE_HEIGHT / 2);
}

function clamp(value: number, low: number, high: number): number {
	if (Number.isNaN(value)) return low;
	return Math.min(Math.max(value, low), high);
}
