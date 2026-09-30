import { Heart, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	BALL_RADIUS,
	CPU_FACE,
	createState,
	FIELD_HEIGHT,
	FIELD_WIDTH,
	FIXED_STEP_MS,
	PADDLE_HEIGHT,
	PADDLE_WIDTH,
	PLAYER_FACE,
	type PongEvent,
	type PongInput,
	type PongState,
	START_LIVES,
	step,
} from "@/games/pong/engine";
import { pontos } from "@/lib/format";

/**
 * Pong, drawn.
 *
 * The rules are in engine.ts and know nothing about a screen; this file is the
 * screen: a black board, a keyboard, a speaker and the big letters over the
 * field. It owns exactly one game at a time and drives it from a fixed-timestep
 * loop -- the elapsed time of a frame is fed to the engine in slices of
 * FIXED_STEP_MS, so a machine that draws slowly plays the same game as one that
 * draws quickly, and the ball never crosses a paddle between two frames.
 *
 * The board is the arcade machine's own: black, with the field in white and
 * nothing else on it. That is a decision about the class rather than about
 * taste. The kids rebuild this game in Scratch after playing it here, and every
 * effect that is not a rectangle is an afternoon they cannot reproduce -- a
 * glow, a trail, a shadow and a perspective all end in a project that does not
 * look like the game they played. So the engine's field goes onto the canvas
 * 1:1, with one scale for both axes, and the only things drawn on it are the
 * two paddles, the ball and the dashed line down the middle.
 */

/** What the screen is doing. The engine only ever runs in `playing`. */
type Phase = "countdown" | "playing" | "paused" | "over";

/** Everything the loop owns. Kept in one object so a restart is a reset, not a remount. */
interface Game {
	state: PongState;
	phase: Phase;
	countdownMs: number;
	shownCount: number;
	goMs: number;
	accumulator: number;
	/** Whether this game has already told the page how it ended. */
	reported: boolean;
}

/**
 * The hearts in the HUD, one per life.
 *
 * Each has a name of its own so React can tell them apart by something other
 * than where they sit in the row: the hearts are three particular things -- the
 * last one is the life the game ends on.
 */
const LIFE_HEARTS: readonly string[] = Array.from(
	{ length: START_LIVES },
	(_, life) => `vida-${life + 1}`,
);

const COUNTDOWN_SECONDS = 3;
const COUNTDOWN_MS = COUNTDOWN_SECONDS * 1000;
/** How long "Já!" stays on the screen after the countdown. */
const GO_MS = 700;
/** Where the mute choice is remembered between visits. */
const MUTED_KEY = "sala.pong.muted";
/**
 * How many device pixels per CSS pixel the board is drawn at, at most.
 *
 * The board is a handful of rectangles, so the backing store could follow a
 * three-times-density screen all the way; this is the cheap insurance against
 * a phone that claims a ratio no screen has. Two is what the rest of the page
 * is happy with.
 */
const MAX_PIXEL_RATIO = 2;

export interface PongGameProps {
	/** Called once, when the game is over, with the hits the player made. */
	onGameOver: (score: number) => void;
	/** Called on every paddle hit, with the score as it stands. */
	onScore?: (score: number) => void;
	/**
	 * Called when a game's countdown begins: the first game of a visit and every
	 * "Jogar de novo". The page uses it to put away what it showed about the
	 * game that ended.
	 */
	onStart?: () => void;
}

/**
 * PongGame is the game itself: board, paddles, ball, HUD and sounds.
 *
 * It posts nothing and knows nothing about scores: it says when a point was
 * scored and when the game ended, and the page around it decides what to do
 * about that.
 */
export function PongGame({ onGameOver, onScore, onStart }: PongGameProps) {
	const host = useRef<HTMLDivElement | null>(null);
	const [phase, setPhase] = useState<Phase>("countdown");
	const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
	const [showGo, setShowGo] = useState(false);
	const [score, setScore] = useState(0);
	const [lives, setLives] = useState(START_LIVES);
	const [muted, setMuted] = useState(readMuted);

	// The loop is built once and lives in a closure; these are how the buttons
	// and the callbacks the page passed reach into it.
	const controls = useRef<{
		pause: () => void;
		resume: () => void;
		restart: () => void;
	} | null>(null);

	// The page may hand over a new function on every render, which must not
	// restart the game: the loop reads them through a ref instead.
	const onGameOverRef = useRef(onGameOver);
	const onScoreRef = useRef(onScore);
	const onStartRef = useRef(onStart);
	const mutedRef = useRef(muted);
	onGameOverRef.current = onGameOver;
	onScoreRef.current = onScore;
	onStartRef.current = onStart;

	// The speaker lives in the effect's closure and is built on the first
	// gesture, which may be a click on the mute button -- outside that closure.
	const beeperRef = useRef<Beeper | null>(null);
	const ensureAudioRef = useRef<() => void>(() => undefined);

	useEffect(() => {
		const hostElement = host.current;
		if (!hostElement) return;
		// A plain const of the narrowed type: the closures below are declared
		// after the check, and this is what carries the narrowing into them.
		const element: HTMLDivElement = hostElement;

		const canvas = document.createElement("canvas");
		canvas.className = "block h-full w-full";
		const maybeContext = canvas.getContext("2d");
		// Canvas 2D is the one drawing API every browser has; a document that
		// refuses it has no canvas at all, and there is nothing here to draw a
		// board on. There is no message for it, either: it is not a case a kid
		// can be told anything useful about.
		if (!maybeContext) return;
		// The narrowed type in a name of its own: the functions below are
		// declared after this check, and this is what carries it into them.
		const context: CanvasRenderingContext2D = maybeContext;
		element.appendChild(canvas);

		const input: PongInput = { up: false, down: false };
		let beeper: Beeper | null = null;

		const game: Game = {
			state: createState(nextSeed()),
			phase: "countdown",
			countdownMs: COUNTDOWN_MS,
			shownCount: COUNTDOWN_SECONDS,
			goMs: 0,
			accumulator: 0,
			reported: false,
		};

		function setPhaseAndShow(next: Phase): void {
			game.phase = next;
			setPhase(next);
		}

		/** ensureAudio builds the speaker on the first gesture, when a browser allows one. */
		function ensureAudio(): void {
			if (beeper) return;
			beeper = createBeeper();
			beeperRef.current = beeper;
			beeper?.setMuted(mutedRef.current);
		}
		ensureAudioRef.current = ensureAudio;

		function pause(): void {
			if (game.phase !== "playing") return;
			input.up = false;
			input.down = false;
			setPhaseAndShow("paused");
		}

		function resume(): void {
			if (game.phase !== "paused") return;
			setPhaseAndShow("playing");
		}

		function restart(): void {
			game.state = createState(nextSeed());
			game.countdownMs = COUNTDOWN_MS;
			game.shownCount = COUNTDOWN_SECONDS;
			game.goMs = 0;
			game.accumulator = 0;
			game.reported = false;
			input.up = false;
			input.down = false;
			setScore(0);
			setLives(START_LIVES);
			setCountdown(COUNTDOWN_SECONDS);
			setShowGo(false);
			setPhaseAndShow("countdown");
			onStartRef.current?.();
		}

		/** handle turns what the engine reported into a sound and a HUD change. */
		function handle(events: readonly PongEvent[]): void {
			for (const event of events) {
				switch (event.type) {
					case "hit":
						if (event.paddle === "player") {
							setScore(event.score);
							onScoreRef.current?.(event.score);
						}
						beeper?.play(event.paddle);
						break;
					case "wall":
						beeper?.play("wall");
						break;
					case "miss":
						setLives(event.lives);
						beeper?.play("miss");
						break;
					case "cpu-miss":
						beeper?.play("past");
						break;
					case "over":
						setPhaseAndShow("over");
						if (!game.reported) {
							game.reported = true;
							onGameOverRef.current(event.score);
						}
						beeper?.play("over");
						break;
				}
			}
		}

		function update(dtMs: number): void {
			if (game.phase === "countdown") {
				game.countdownMs -= dtMs;
				if (game.countdownMs <= 0) {
					game.goMs = GO_MS;
					setCountdown(0);
					setShowGo(true);
					setPhaseAndShow("playing");
					beeper?.play("go");
				} else {
					const number = Math.ceil(game.countdownMs / 1000);
					if (number !== game.shownCount) {
						game.shownCount = number;
						setCountdown(number);
						beeper?.play("count");
					}
				}
			}

			if (game.goMs > 0) {
				game.goMs -= dtMs;
				if (game.goMs <= 0) setShowGo(false);
			}

			if (game.phase !== "playing") return;

			game.accumulator += dtMs;
			while (game.accumulator >= FIXED_STEP_MS) {
				game.accumulator -= FIXED_STEP_MS;
				const events = step(game.state, FIXED_STEP_MS, input);
				if (events.length > 0) handle(events);
				if (game.state.over) return;
			}
		}

		/**
		 * draw paints the board the engine is in.
		 *
		 * Every frame is drawn from the state as it is, and the canvas is not
		 * cleared between frames by anybody but the board itself: the first thing
		 * drawBoard does is paint the whole thing black, which is both the
		 * background and the only clear there needs to be.
		 */
		function draw(): void {
			drawBoard(context, game.state, canvas.width, canvas.height);
		}

		let previous = performance.now();
		let animation = 0;
		function frame(now: number): void {
			const dtMs = Math.min(now - previous, 200);
			previous = now;
			update(dtMs);
			draw();
			animation = requestAnimationFrame(frame);
		}

		function onKeyDown(event: KeyboardEvent): void {
			// A key pressed in a field belongs to that field: the game must not
			// move a paddle with it or eat the arrows a caret needs.
			if (isTypingTarget(event.target)) return;
			const direction = KEY_DIRECTION[event.code];
			if (direction) {
				input[direction] = true;
				event.preventDefault();
				ensureAudio();
				return;
			}
			if (event.code === "KeyP") {
				event.preventDefault();
				ensureAudio();
				if (game.phase === "paused") resume();
				else pause();
			}
		}

		function onKeyUp(event: KeyboardEvent): void {
			const direction = KEY_DIRECTION[event.code];
			if (!direction) return;
			// The key is up wherever it came up, and a paddle must not keep
			// sliding because it came up over a field; the field keeps the event,
			// though, since nothing about it is the game's to prevent.
			input[direction] = false;
			if (isTypingTarget(event.target)) return;
			event.preventDefault();
		}

		/** A key held while the tab goes away stays up: the paddle must not keep moving. */
		function onBlur(): void {
			input.up = false;
			input.down = false;
			pause();
		}

		function onVisibility(): void {
			if (document.hidden) onBlur();
		}

		function onPointerDown(): void {
			ensureAudio();
		}

		/**
		 * resize gives the canvas a backing store the size of the box it is in.
		 *
		 * Only the backing store is written, never a style: the canvas is sized
		 * by its own classes ("block h-full w-full" over a host that owns the
		 * 16:9 shape). An inline height here would freeze the box at the height
		 * of whichever width last crossed a breakpoint, and the next resize would
		 * read that stale height straight back.
		 *
		 * The observer watches the host and not the canvas, so nothing written
		 * here can feed back into the measurement that asked for it.
		 */
		function resize(): void {
			const width = element.clientWidth;
			const height = element.clientHeight;
			if (width === 0 || height === 0) return;
			const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
			canvas.width = Math.max(1, Math.round(width * ratio));
			canvas.height = Math.max(1, Math.round(height * ratio));
		}

		const observer = new ResizeObserver(resize);
		observer.observe(element);
		resize();

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		window.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("visibilitychange", onVisibility);
		animation = requestAnimationFrame(frame);

		controls.current = { pause, resume, restart };
		// The first countdown starts here, in the same breath as the loop: the
		// page hears about a new game the moment one begins, whichever game it is.
		onStartRef.current?.();

		return () => {
			cancelAnimationFrame(animation);
			observer.disconnect();
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
			window.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("visibilitychange", onVisibility);
			beeper?.dispose();
			canvas.remove();
			controls.current = null;
			beeperRef.current = null;
			ensureAudioRef.current = () => undefined;
		};
	}, []);

	const toggleMute = useCallback(() => {
		mutedRef.current = !mutedRef.current;
		setMuted(mutedRef.current);
		storeMuted(mutedRef.current);
		// The click is a gesture, and a gesture is when a browser lets a page
		// build its speaker -- a mute toggle nobody can hear is nothing.
		ensureAudioRef.current();
		beeperRef.current?.setMuted(mutedRef.current);
	}, []);

	return (
		<div className="w-full overflow-hidden rounded-3xl border-2 border-border bg-scratch-ink shadow-sm">
			{/* The HUD is a bar ABOVE the field and not a caption over it: the
			    paddles live at the field's left and right edges, which is exactly
			    where a corner box would sit, and a score that covers the paddle a
			    kid is watching is a score in the way. */}
			<div className="flex items-center justify-between gap-3 px-3 py-2 text-white sm:px-5">
				<div className="flex items-baseline gap-2">
					<span className="font-bold text-sm uppercase tracking-widest text-white/80">
						Pontos
					</span>
					<span className="font-extrabold text-3xl leading-none text-scratch-events">
						{score}
					</span>
				</div>
				<div className="flex items-center gap-2 sm:gap-3">
					<div
						role="img"
						className="flex items-center gap-1"
						aria-label={`${lives} de ${LIFE_HEARTS.length} vidas`}
					>
						{LIFE_HEARTS.map((heart, position) => (
							<Heart
								key={heart}
								aria-hidden
								className={
									position < lives
										? "size-6 text-destructive"
										: "size-6 text-white/25"
								}
								fill={position < lives ? "currentColor" : "none"}
							/>
						))}
					</div>
					<Button
						type="button"
						size="icon"
						variant="secondary"
						className="size-10 rounded-2xl bg-white/10 text-white hover:bg-white/25"
						onClick={toggleMute}
						aria-label={muted ? "Ligar o som" : "Desligar o som"}
					>
						{muted ? (
							<VolumeX className="size-5" />
						) : (
							<Volume2 className="size-5" />
						)}
					</Button>
					{phase === "playing" && (
						<Button
							type="button"
							size="icon"
							variant="secondary"
							className="size-10 rounded-2xl bg-white/10 text-white hover:bg-white/25"
							onClick={() => controls.current?.pause()}
							aria-label="Pausar o jogo"
						>
							<Pause className="size-5" />
						</Button>
					)}
				</div>
			</div>

			<div className="relative">
				<div ref={host} className="aspect-[16/9] w-full" />

				{/* What the game says over the field: the countdown, the pause card
				    and the end of the game. None of them is up while the ball is in
				    play, which is why they may cover it. */}
				<div className="pointer-events-none absolute inset-0 select-none">
					{phase === "countdown" && (
						<div className="absolute inset-0 grid place-items-center">
							<p
								key={countdown}
								className="font-extrabold text-8xl text-scratch-events drop-shadow-[0_0_30px_rgba(255,191,0,0.75)]"
							>
								{countdown}
							</p>
						</div>
					)}

					{showGo && phase === "playing" && (
						<div className="absolute inset-0 grid place-items-center">
							<p className="font-extrabold text-7xl text-scratch-operators drop-shadow-[0_0_30px_rgba(89,192,89,0.75)]">
								Já!
							</p>
						</div>
					)}

					{phase === "paused" && (
						<div className="absolute inset-0 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
							<div className="pointer-events-auto w-full max-w-sm rounded-3xl bg-card p-6 text-center text-card-foreground shadow-xl">
								<p className="font-extrabold text-3xl">Pausado</p>
								<Button
									size="lg"
									className="mt-4 h-14 rounded-2xl px-6 font-bold text-lg"
									onClick={() => controls.current?.resume()}
								>
									<Play className="size-6" />
									Continuar
								</Button>
								<p className="mt-3 text-muted-foreground">
									Ou aperte a tecla P.
								</p>
							</div>
						</div>
					)}

					{phase === "over" && (
						<div className="absolute inset-0 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
							<div className="pointer-events-auto w-full max-w-md rounded-3xl bg-card p-6 text-center text-card-foreground shadow-xl">
								<p className="font-extrabold text-4xl">Fim de jogo!</p>
								<p className="mt-2 text-xl text-muted-foreground">
									Você fez{" "}
									<span className="font-extrabold text-3xl text-scratch-variables">
										{pontos(score)}
									</span>
								</p>
								<Button
									size="lg"
									className="mt-5 h-14 rounded-2xl px-6 font-bold text-lg"
									onClick={() => controls.current?.restart()}
								>
									<RotateCcw className="size-6" />
									Jogar de novo
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>

			<p className="px-3 pt-1 pb-3 text-center font-bold text-base text-white/80 sm:px-5">
				↑ ↓ ou W S para mover a raquete · P para pausar
			</p>
		</div>
	);
}

export default PongGame;

/**
 * isTypingTarget says whether a key event is a kid typing rather than playing.
 *
 * The game listens on the window, so it hears the keys of every field on the
 * page -- a name box today, whatever a later screen adds tomorrow. Moving the
 * paddle with a key that was meant for a field, or eating the arrow keys so a
 * caret cannot move, would be the game breaking the page around it.
 *
 * A target that is not an element at all (the document, the window) is not a
 * field: the game is the only thing on this page listening for those.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	// isContentEditable is true for anything inside an editable region, which is
	// why it is asked before closest() rather than instead of it.
	return (
		target.isContentEditable || target.closest("input,textarea,select") !== null
	);
}

/** Which keys move the paddle, by the physical key that was pressed. */
const KEY_DIRECTION: Record<string, "up" | "down"> = {
	ArrowUp: "up",
	ArrowDown: "down",
	KeyW: "up",
	KeyS: "down",
};

/** nextSeed is a fresh game: the rules are seeded so a game can be replayed, not so every game is the same. */
function nextSeed(): number {
	return Math.floor(Math.random() * 0xffffffff);
}

function readMuted(): boolean {
	try {
		return window.localStorage.getItem(MUTED_KEY) === "1";
	} catch {
		// Storage can be refused (private mode, a locked-down profile). The
		// choice is then only for this visit, which is better than not starting.
		return false;
	}
}

function storeMuted(muted: boolean): void {
	try {
		window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
	} catch {
		// See readMuted.
	}
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/** The monitor's black: what a screen shows when it shows nothing. */
const BOARD_COLOR = "#000000";
/** The one ink the machine had. Everything on the board is drawn in it. */
const INK_COLOR = "#ffffff";

/** How wide the line down the middle is, in field units. */
const NET_WIDTH = 1;
/** How long one dash of it is, and how much field there is between two dashes. */
const NET_DASH = 4;
const NET_GAP = 4;
/** The distance from the start of a dash to the start of the next one. */
const NET_PERIOD = NET_DASH + NET_GAP;
/** How many dashes run down the field, and where the first of them starts. */
const NET_COUNT = Math.floor((FIELD_HEIGHT + NET_GAP) / NET_PERIOD);
const NET_START = (FIELD_HEIGHT - (NET_COUNT * NET_PERIOD - NET_GAP)) / 2;

/**
 * drawBoard paints the field `state` is in onto a canvas of this many DEVICE
 * pixels.
 *
 * The engine's field is mapped onto the canvas with one scale for both axes and
 * centred on it: the canvas is 16:9 like the field and the two coincide, and a
 * canvas of any other shape gets the board with the field's own proportions and
 * black bars where the field does not reach, rather than a stretched one. Every
 * edge is rounded to a whole device pixel, which is why the width of a
 * rectangle is the distance between its two rounded edges rather than a
 * rounded width of its own: that is what keeps a paddle exactly on the plane
 * the rules bounce the ball at, and what keeps the board as crisp as the
 * machine's picture instead of as soft as a scaled one.
 *
 * The order is the order of the machine's own picture: the screen is black, the
 * net is drawn on it, and the actors are drawn over both.
 */
export function drawBoard(
	context: CanvasRenderingContext2D,
	state: PongState,
	width: number,
	height: number,
): void {
	// A backing store that is resized loses every setting it had, and this is
	// the one that matters: nothing here is ever scaled, so a smoothed edge
	// would only be a blurry one on a board whose whole look is its hard edges.
	context.imageSmoothingEnabled = false;
	context.fillStyle = BOARD_COLOR;
	context.fillRect(0, 0, width, height);

	const scale = Math.min(width / FIELD_WIDTH, height / FIELD_HEIGHT);
	const left = (width - FIELD_WIDTH * scale) / 2;
	const top = (height - FIELD_HEIGHT * scale) / 2;

	/** fill draws a rectangle given in field units, on whole device pixels. */
	function fill(
		x: number,
		y: number,
		areaWidth: number,
		areaHeight: number,
	): void {
		const x0 = Math.round(left + x * scale);
		const y0 = Math.round(top + y * scale);
		context.fillRect(
			x0,
			y0,
			Math.round(left + (x + areaWidth) * scale) - x0,
			Math.round(top + (y + areaHeight) * scale) - y0,
		);
	}

	context.fillStyle = INK_COLOR;

	// The net: the same dashes from one end of the field to the other, with as
	// much air above the first of them as below the last.
	for (let dash = 0; dash < NET_COUNT; dash += 1) {
		fill(
			FIELD_WIDTH / 2 - NET_WIDTH / 2,
			NET_START + dash * NET_PERIOD,
			NET_WIDTH,
			NET_DASH,
		);
	}

	// The paddles, each placed by the face the rules measure a hit against --
	// the inner one -- so the block a kid aims with IS the plane the ball turns
	// on, and not a drawing that sits somewhere near it.
	fill(
		PLAYER_FACE - PADDLE_WIDTH,
		state.player.y - PADDLE_HEIGHT / 2,
		PADDLE_WIDTH,
		PADDLE_HEIGHT,
	);
	fill(CPU_FACE, state.cpu.y - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);

	// The ball, a square whose side is the diameter the rules bounce with. Both
	// the field and the machine's own picture are made of rectangles, and a
	// round ball would be the one shape in the game that Scratch's pen could
	// not draw in one stamp.
	fill(
		state.ball.x - BALL_RADIUS,
		state.ball.y - BALL_RADIUS,
		BALL_RADIUS * 2,
		BALL_RADIUS * 2,
	);
}

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

/** What a beep is made of: a wave, a sweep, a length and a volume. */
interface Beep {
	wave: OscillatorType;
	from: number;
	to: number;
	ms: number;
	gain: number;
}

type BeepKind =
	| "player"
	| "cpu"
	| "wall"
	| "miss"
	| "past"
	| "count"
	| "go"
	| "over";

/**
 * The eight sounds the game makes, written as numbers rather than shipped as
 * files: a square wave that sweeps is the whole vocabulary of an arcade machine,
 * and a couple of kilobytes of code cannot fail to load.
 */
const BEEPS: Record<BeepKind, Beep> = {
	player: { wave: "square", from: 660, to: 990, ms: 90, gain: 0.16 },
	cpu: { wave: "square", from: 330, to: 260, ms: 80, gain: 0.13 },
	wall: { wave: "triangle", from: 240, to: 180, ms: 60, gain: 0.12 },
	miss: { wave: "sawtooth", from: 320, to: 90, ms: 380, gain: 0.18 },
	past: { wave: "triangle", from: 700, to: 1200, ms: 170, gain: 0.13 },
	count: { wave: "square", from: 440, to: 440, ms: 110, gain: 0.14 },
	go: { wave: "square", from: 880, to: 880, ms: 260, gain: 0.16 },
	over: { wave: "square", from: 520, to: 130, ms: 700, gain: 0.18 },
};

/** The speaker, as the game uses it: play one of the sounds, or be quiet. */
interface Beeper {
	play: (kind: BeepKind) => void;
	setMuted: (muted: boolean) => void;
	dispose: () => void;
}

/**
 * createBeeper builds the speaker on demand.
 *
 * On demand because a browser refuses to start one before the visitor has done
 * something -- and the first thing the kid does is press a key, which is where
 * this is called from. Answers null when there is no WebAudio at all, and the
 * game is then silent rather than broken.
 */
function createBeeper(): Beeper | null {
	let context: AudioContext;
	try {
		context = new AudioContext();
	} catch {
		return null;
	}
	if (context.state === "suspended") {
		void context.resume().catch(() => undefined);
	}

	const master = context.createGain();
	master.gain.value = 0.5;
	master.connect(context.destination);

	let muted = false;

	return {
		play(kind) {
			if (muted) return;
			const beep = BEEPS[kind];
			const now = context.currentTime;
			const seconds = beep.ms / 1000;
			const oscillator = context.createOscillator();
			const envelope = context.createGain();
			oscillator.type = beep.wave;
			oscillator.frequency.setValueAtTime(beep.from, now);
			oscillator.frequency.exponentialRampToValueAtTime(
				Math.max(1, beep.to),
				now + seconds,
			);
			// Ramps rather than steps: a gain that jumps to a value and back
			// clicks, and a click is the one sound a game must not make.
			envelope.gain.setValueAtTime(0.0001, now);
			envelope.gain.exponentialRampToValueAtTime(beep.gain, now + 0.008);
			envelope.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
			oscillator.connect(envelope);
			envelope.connect(master);
			oscillator.start(now);
			oscillator.stop(now + seconds + 0.02);
			oscillator.addEventListener("ended", () => {
				oscillator.disconnect();
				envelope.disconnect();
			});
		},
		setMuted(value) {
			muted = value;
		},
		dispose() {
			master.disconnect();
			void context.close().catch(() => undefined);
		},
	};
}
