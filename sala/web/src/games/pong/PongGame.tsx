import { Heart, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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
 * screen: a three.js stage, a keyboard, a speaker and the big letters over the
 * field. It owns exactly one game at a time and drives it from a fixed-timestep
 * loop -- the elapsed time of a frame is fed to the engine in slices of
 * FIXED_STEP_MS, so a machine that draws slowly plays the same game as one that
 * draws quickly, and the ball never crosses a paddle between two frames.
 *
 * The field itself is the engine's flat rectangle, laid down as the table it is:
 * the camera stands above the kid's own edge of it and looks down its length, so
 * the near-bottom edge of the picture is the kid's side of the table and the far
 * one is the machine's. Left is still the player and right is still the machine
 * -- the engine's x and y ARE the table's, and the only thing the renderer adds
 * is height off the surface. The table is not stood up to face the viewer for
 * the same reason the flat version did not: a kid reads this as a table seen
 * from the edge of it, and a board standing upright is a wall with a floor under
 * it, which is a different game.
 *
 * The glow is bought with geometry rather than with a full-screen bloom pass:
 * every bright thing stands in a feathered pool of its own colour, painted on
 * the table under it, which is one extra draw call and reads as neon at this
 * size. A post-processing pass would cost every pixel on the laptop's
 * integrated graphics for a halo these pools already give.
 */

/** The table's colours: a deep blue-black surface with the actors as blocks on it. */
const TABLE_COLOR = 0x081120;
/** The ink the table floats in: the clear colour, so the table's edge is the only edge. */
const VOID_COLOR = 0x050b14;
/** The two blues of the field itself: the faint grid, and the line around the field. */
const GRID_COLOR = 0x2f6f8f;
const FRAME_COLOR = 0x5cb1d6;
const PLAYER_COLOR = 0x4c97ff;
const CPU_COLOR = 0xcf63cf;
const BALL_COLOR = 0xffbf00;

// The table, in field units. The engine's x and y are already the table's: x
// runs along the near edge, from the player's side to the machine's, and y runs
// away from the viewer, from the far edge the machine defends to the near one
// the kid sits at. Nothing is scaled or turned on the way to the screen; the
// only thing between the two is the camera.
/** How thick the table's slab is: enough for its near edge to show a rim. */
const TABLE_DEPTH = 3;
/**
 * How wide a paddle is drawn, against the 2.5 the rules give it.
 *
 * Both blocks are placed by their INNER face -- the plane at PLAYER_FACE and
 * CPU_FACE that the rules measure a hit against -- so a wider block covers that
 * plane instead of moving it, and the ball still meets the paddle exactly where
 * the rules say it does. The bar is drawn wider because 2.5 units of a 160-unit
 * field is a hairline at this size, and the block is the thing a kid aims with.
 */
const PADDLE_DRAW_WIDTH = PADDLE_WIDTH * 1.4;
/**
 * How tall a paddle stands off the table.
 *
 * A block has a side as well as a top, and from this angle the side a block
 * turns to the camera is part of the length a kid sees: ten units of height are
 * worth about a tenth again on top of the block's own footprint, which is what
 * makes the paddle visibly bigger on screen than the flat picture's bar rather
 * than merely as big. Taller than this and the block starts to read as a slab
 * leaning away from the viewer instead of a bar lying on the table.
 */
const PADDLE_THICKNESS = 10;
/**
 * The ball's radius as drawn: a third larger than the rules make it.
 *
 * The rules bounce it at BALL_RADIUS from a wall, so the drawn ball reaches half
 * a unit past the line it turned on -- two pixels at this size, and the price of
 * a ball a kid can see. It is also the height the ball rolls at, since it rolls
 * ON the table.
 */
const BALL_DRAW_RADIUS = BALL_RADIUS * 1.35;
/** How far above the surface the painted lines and the blob shadows sit. */
const PAINT_Y = 0.04;
const SHADOW_Y = 0.02;
/** How far a blob shadow falls from the piece over it: away from the key light. */
const SHADOW_OFFSET_X = 2;
const SHADOW_OFFSET_Z = -2;
/** Where the faint grid on the table crosses it. */
const GRID_LINES_X = [20, 40, 60, 80, 100, 120, 140];
const GRID_LINES_Z = [10, 20, 30, 40, 50, 60, 70, 80];

/**
 * Where the camera stands and what it aims at.
 *
 * Above the table, on the kid's side of it, tilted just enough that the table
 * recedes: no yaw and no roll, so the field's two long edges stay level across
 * the frame and the only slant in the picture is the table going away from the
 * viewer. The pitch is the angle between straight down and where it looks -- 14
 * degrees, which is the lean that gives the blocks a thickness to stand in
 * without turning the table back into a wall.
 *
 * The aim is not the middle of the field. A table looked at from its near edge
 * projects as a keystone whose wide half is the near one, and aiming a little
 * past the middle is what leaves the same air above the far edge as below the
 * near one. The field of view is not a taste either: with the pitch and the
 * keystone set, it is the number that puts the table's far edge at about
 * seven-eighths of the frame's width and its near edge at nearly all of it --
 * see the comment on fit.
 */
const CAMERA_FOV_DEG = 29;
const CAMERA_PITCH_DEG = 14;
const CAMERA_AIM_Z = 48;
/** How much air the field keeps around itself inside the frame. */
const CAMERA_MARGIN = 1.02;

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
/** How many frames of the ball's path are drawn behind it. */
const TRAIL_LENGTH = 16;
/** How long the field keeps shaking after a hit, and how far it moves. */
const SHAKE_DECAY_MS = 260;
const SHAKE_AMPLITUDE = 0.7;
/** Where the mute choice is remembered between visits. */
const MUTED_KEY = "sala.pong.muted";

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
	shake: number;
	flashPlayer: number;
	flashCpu: number;
	/** The ball's recent positions, oldest first. */
	trail: { x: number; y: number }[];
	/** Whether this game has already told the page how it ended. */
	reported: boolean;
}

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
 * PongGame is the game itself: field, paddles, ball, HUD and sounds.
 *
 * It posts nothing and knows nothing about scores: it says when a point was
 * scored and when the game ended, and the page around it decides what to do
 * about that.
 */
export function PongGame({ onGameOver, onScore, onStart }: PongGameProps) {
	const host = useRef<HTMLDivElement | null>(null);
	const [unsupported, setUnsupported] = useState(false);
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
		if (!webglAvailable()) {
			setUnsupported(true);
			return;
		}

		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({
				antialias: true,
				powerPreference: "high-performance",
			});
		} catch {
			// The browser has WebGL and still refused a context: nothing to draw
			// on, and the same sentence covers both.
			setUnsupported(true);
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(VOID_COLOR, 1);
		renderer.domElement.className = "block h-full w-full";
		element.appendChild(renderer.domElement);

		const stage = buildStage();
		const input: PongInput = { up: false, down: false };
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let beeper: Beeper | null = null;

		const game: Game = {
			state: createState(nextSeed()),
			phase: "countdown",
			countdownMs: COUNTDOWN_MS,
			shownCount: COUNTDOWN_SECONDS,
			goMs: 0,
			accumulator: 0,
			shake: 0,
			flashPlayer: 0,
			flashCpu: 0,
			trail: [],
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
			game.shake = 0;
			game.flashPlayer = 0;
			game.flashCpu = 0;
			game.trail.length = 0;
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

		/** handle turns what the engine reported into a sound, a flash and a HUD change. */
		function handle(events: readonly PongEvent[]): void {
			for (const event of events) {
				switch (event.type) {
					case "hit":
						if (event.paddle === "player") {
							setScore(event.score);
							onScoreRef.current?.(event.score);
							game.flashPlayer = 1;
							beeper?.play("player");
						} else {
							game.flashCpu = 1;
							beeper?.play("cpu");
						}
						game.shake = Math.max(game.shake, 0.7);
						break;
					case "wall":
						beeper?.play("wall");
						break;
					case "miss":
						setLives(event.lives);
						game.shake = 1.1;
						// The ball was put back in the middle: the path it took to
						// get here is not a path it can be drawn along.
						game.trail.length = 0;
						beeper?.play("miss");
						break;
					case "cpu-miss":
						game.trail.length = 0;
						beeper?.play("past");
						break;
					case "over":
						game.trail.length = 0;
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

		function draw(dtMs: number, nowMs: number): void {
			const state = game.state;
			// The engine's own x and y are the table's: x across it and y away
			// from the viewer, so only the height off the surface is added here.
			// Where a piece stands across the table was decided when it was built.
			stage.player.position.z = state.player.y;
			stage.cpu.position.z = state.cpu.y;
			stage.ball.position.set(state.ball.x, BALL_DRAW_RADIUS, state.ball.y);
			stage.playerGlow.position.z = stage.player.position.z;
			stage.cpuGlow.position.z = stage.cpu.position.z;
			stage.ballGlow.position.set(
				stage.ball.position.x,
				PAINT_Y,
				stage.ball.position.z,
			);
			stage.playerShadow.position.set(
				stage.player.position.x + SHADOW_OFFSET_X,
				SHADOW_Y,
				stage.player.position.z + SHADOW_OFFSET_Z,
			);
			stage.cpuShadow.position.set(
				stage.cpu.position.x + SHADOW_OFFSET_X,
				SHADOW_Y,
				stage.cpu.position.z + SHADOW_OFFSET_Z,
			);
			stage.ballShadow.position.set(
				stage.ball.position.x + SHADOW_OFFSET_X,
				SHADOW_Y,
				stage.ball.position.z + SHADOW_OFFSET_Z,
			);

			game.flashPlayer = Math.max(0, game.flashPlayer - dtMs / 200);
			game.flashCpu = Math.max(0, game.flashCpu - dtMs / 200);
			stage.playerGlow.material.opacity = 0.55 + game.flashPlayer * 0.45;
			stage.playerGlow.scale.set(
				1 + game.flashPlayer * 0.25,
				1 + game.flashPlayer * 0.12,
				1,
			);
			stage.cpuGlow.material.opacity = 0.55 + game.flashCpu * 0.45;
			stage.cpuGlow.scale.set(
				1 + game.flashCpu * 0.25,
				1 + game.flashCpu * 0.12,
				1,
			);

			game.trail.push({ x: state.ball.x, y: state.ball.y });
			if (game.trail.length > TRAIL_LENGTH) game.trail.shift();
			for (let i = 0; i < stage.trail.length; i += 1) {
				const point = game.trail[game.trail.length - 1 - i];
				const mesh = stage.trail[i];
				if (!point || !mesh) {
					if (mesh) mesh.visible = false;
					continue;
				}
				mesh.visible = true;
				mesh.position.set(point.x, BALL_DRAW_RADIUS, point.y);
				const age = i / stage.trail.length;
				mesh.material.opacity = 0.4 * (1 - age);
				mesh.scale.setScalar(1 - age * 0.6);
			}

			if (game.shake > 0.002 && !reducedMotion.matches) {
				const seconds = nowMs / 1000;
				// Along the camera's own axes: the field shakes across the picture
				// a kid is looking at, not across the world it is built in.
				stage.camera.position
					.copy(stage.cameraHome)
					.addScaledVector(
						stage.cameraRight,
						Math.sin(seconds * 53) * game.shake * SHAKE_AMPLITUDE,
					)
					.addScaledVector(
						stage.cameraUp,
						Math.sin(seconds * 71) * game.shake * SHAKE_AMPLITUDE,
					);
				game.shake = Math.max(0, game.shake - dtMs / SHAKE_DECAY_MS);
			} else {
				game.shake = 0;
				stage.camera.position.copy(stage.cameraHome);
			}

			renderer.render(stage.scene, stage.camera);
		}

		let previous = performance.now();
		function frame(now: number): void {
			const dtMs = Math.min(now - previous, 200);
			previous = now;
			update(dtMs);
			draw(dtMs, now);
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

		function resize(): void {
			const width = element.clientWidth;
			const height = element.clientHeight;
			if (width === 0 || height === 0) return;
			// The canvas is sized by its own classes ("block h-full w-full" over a
			// host that owns the 16:9 shape), so three is told to leave the style
			// alone: writing an inline height here would freeze the box at the
			// height of whichever width last crossed a breakpoint, and the next
			// resize would read that stale height straight back.
			renderer.setSize(width, height, false);
			stage.fit(width / height);
		}

		const observer = new ResizeObserver(resize);
		observer.observe(element);
		resize();

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		window.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("visibilitychange", onVisibility);
		renderer.setAnimationLoop(frame);

		controls.current = { pause, resume, restart };
		// The first countdown starts here, in the same breath as the loop: the
		// page hears about a new game the moment one begins, whichever game it is.
		onStartRef.current?.();

		return () => {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
			window.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("visibilitychange", onVisibility);
			beeper?.dispose();
			stage.dispose();
			// dispose() lets go of three's own objects; it does not give the WebGL
			// context back. A document keeps only a handful of contexts alive, so a
			// game that is opened and left a dozen times has to hand this one over.
			renderer.forceContextLoss();
			renderer.dispose();
			renderer.domElement.remove();
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

	if (unsupported) {
		return (
			<div className="grid aspect-[16/9] w-full place-items-center rounded-3xl border-2 border-border bg-scratch-ink p-6 text-center">
				<div className="max-w-md space-y-2">
					<p className="font-extrabold text-3xl text-white">
						O jogo não conseguiu ligar aqui
					</p>
					<p className="text-lg text-white/70">
						Este navegador está sem WebGL, que é o que desenha o jogo. Tente
						outro navegador ou chame o professor.
					</p>
				</div>
			</div>
		);
	}

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

/**
 * What this document answered when it was asked whether it can draw with WebGL.
 *
 * Asked once and remembered, because the answer cannot change within a document
 * and because the asking costs a WebGL context: a browser keeps only a handful
 * of them alive, and a probe per visit to the game would spend one per visit on
 * a question that was already answered. The probe's own context is handed back
 * before its answer is, for the same reason.
 */
let webglProbe: boolean | null = null;

/** webglAvailable asks for a context once, before three is built on top of one. */
function webglAvailable(): boolean {
	if (webglProbe !== null) return webglProbe;
	// A document with no WebGL constructors at all has nothing to ask: probing
	// anyway is one refused call per context type, which a DOM implementation
	// without canvas support logs as a complaint per call.
	if (
		typeof WebGLRenderingContext === "undefined" &&
		typeof WebGL2RenderingContext === "undefined"
	) {
		webglProbe = false;
		return webglProbe;
	}
	try {
		const canvas = document.createElement("canvas");
		// The two kinds of context are asked for one at a time rather than in one
		// expression: they are different types, and only one of them ever answers.
		const modern = canvas.getContext("webgl2");
		if (modern !== null) {
			modern.getExtension("WEBGL_lose_context")?.loseContext();
			webglProbe = true;
		} else {
			const legacy = canvas.getContext("webgl");
			legacy?.getExtension("WEBGL_lose_context")?.loseContext();
			webglProbe = legacy !== null;
		}
	} catch {
		webglProbe = false;
	}
	return webglProbe;
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
// The stage
// ---------------------------------------------------------------------------

/** A lit piece: a paddle, the ball or the table. */
type SolidMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
/** A halo: the additive copy of a piece, drawn where a bloom pass would have put one. */
type HaloMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
/** A blob shadow: the dark smudge a piece stands in, on the table, under it. */
type ShadowMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

/**
 * The three.js objects, and the way to let go of them.
 *
 * Built and thrown away with the component: a WebGL context is a scarce thing
 * and a screen that keeps one per visit runs out of them.
 */
interface Stage {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	/** Where the camera sits when the field is not shaking. */
	cameraHome: THREE.Vector3;
	/** The camera's own axes, which is what the shake moves it along. */
	cameraRight: THREE.Vector3;
	cameraUp: THREE.Vector3;
	player: SolidMesh;
	cpu: SolidMesh;
	ball: SolidMesh;
	playerGlow: HaloMesh;
	cpuGlow: HaloMesh;
	ballGlow: HaloMesh;
	playerShadow: ShadowMesh;
	cpuShadow: ShadowMesh;
	ballShadow: ShadowMesh;
	trail: HaloMesh[];
	/** fit puts the whole field inside a frame of this aspect ratio. */
	fit: (aspect: number) => void;
	dispose: () => void;
}

/**
 * featheredDisc is the soft round smudge a blob shadow is drawn with.
 *
 * A plane painted a flat black would be a black rectangle around the piece: what
 * makes a shadow a shadow is that its edge fades. That fade is a radial gradient
 * in a small canvas -- one texture for the whole stage, shared by every blob.
 */
function featheredDisc(): THREE.CanvasTexture {
	const size = 128;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d");
	if (context) {
		const gradient = context.createRadialGradient(
			size / 2,
			size / 2,
			0,
			size / 2,
			size / 2,
			size / 2,
		);
		gradient.addColorStop(0, "rgba(0,0,0,0.85)");
		gradient.addColorStop(0.5, "rgba(0,0,0,0.5)");
		gradient.addColorStop(1, "rgba(0,0,0,0)");
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);
	}
	return new THREE.CanvasTexture(canvas);
}

/**
 * buildStage puts the field together.
 *
 * The table lies flat: the engine's rectangle is the world's x and z, with the
 * far edge at z = 0 and the kid's own edge at z = 90, and y is the height off
 * the surface. That is the whole of the mapping -- there is no scale and no
 * flip anywhere between a rule and a block, and a position that is (20, 70) in
 * the engine is (20, 0, 70) on the table.
 *
 * The camera stands above the kid's edge of it and looks down its length, with
 * no yaw and no roll, so the two long edges of the table stay level across the
 * frame. `fit` then slides it back along its own axis until the whole table is
 * inside the frame, whatever shape the frame is.
 */
function buildStage(): Stage {
	const geometries: THREE.BufferGeometry[] = [];
	const materials: THREE.Material[] = [];
	const textures: THREE.Texture[] = [];

	/** keep registers a geometry to be let go of with the stage. */
	function keep<T extends THREE.BufferGeometry>(geometry: T): T {
		geometries.push(geometry);
		return geometry;
	}

	/** keepTexture is keep for the one texture the stage makes. */
	function keepTexture(texture: THREE.Texture): THREE.Texture {
		textures.push(texture);
		return texture;
	}

	/**
	 * solid is the material of a piece with a shape to catch the light with: the
	 * block colour as its albedo, a little of the same colour as light of its
	 * own, and a diffuse-only answer to the lamps -- there is nothing in this
	 * scene that a highlight or a metalness would say.
	 *
	 * `emissive` is how much light of its own the piece carries. The blocks use
	 * the default and still read bright; the ball, which is the one thing on the
	 * table a kid has to be able to follow with their eyes, is given more.
	 */
	function solid(color: number, emissive = 0.35): THREE.MeshLambertMaterial {
		const material = new THREE.MeshLambertMaterial({
			color: new THREE.Color(color).multiplyScalar(0.45),
			emissive: color,
			emissiveIntensity: emissive,
		});
		materials.push(material);
		return material;
	}

	/** surface is the material of the thing a kid is not meant to look at: the table itself. */
	function surface(color: number): THREE.MeshLambertMaterial {
		const material = new THREE.MeshLambertMaterial({ color });
		materials.push(material);
		return material;
	}

	/** halo is the additive material a bloom pass would have drawn with: a copy of a piece, spread over what is behind it. */
	function halo(color: number, opacity: number): THREE.MeshBasicMaterial {
		const material = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
		materials.push(material);
		return material;
	}

	/**
	 * shadow is the dark smudge a piece stands in, lying on the table.
	 *
	 * It is the piece's contact with the surface rather than a cast shadow: a
	 * shadow map would be a second pass over every pixel of the frame to draw a
	 * shape that, from this close to overhead, is a soft patch under the piece
	 * and a little to the side of it. One feathered disc of the right size says
	 * the same thing for one draw call.
	 */
	function shadow(sizeX: number, sizeZ: number, opacity: number): ShadowMesh {
		const material = new THREE.MeshBasicMaterial({
			map: disc,
			transparent: true,
			opacity,
			depthWrite: false,
		});
		materials.push(material);
		const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), material);
		// The plane is stood up by default; laid down, its own x and y become the
		// table's x and z, and the scale below is the size of the smudge.
		mesh.rotation.x = -Math.PI / 2;
		mesh.scale.set(sizeX, sizeZ, 1);
		mesh.position.y = SHADOW_Y;
		mesh.renderOrder = 1;
		scene.add(mesh);
		return mesh;
	}

	/**
	 * glowPool is the patch of light a bright piece throws on the table under it.
	 *
	 * The same feathered disc as a shadow, additive and in the piece's own
	 * colour: what a kid reads as a glowing paddle or ball is mostly this pool
	 * with the block standing in the middle of it, and it is the thing the hit
	 * flash brightens.
	 */
	function glowPool(
		color: number,
		sizeX: number,
		sizeZ: number,
		opacity: number,
	): HaloMesh {
		const material = new THREE.MeshBasicMaterial({
			map: disc,
			color,
			transparent: true,
			opacity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
		materials.push(material);
		const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), material);
		mesh.rotation.x = -Math.PI / 2;
		mesh.scale.set(sizeX, sizeZ, 1);
		mesh.position.y = PAINT_Y;
		scene.add(mesh);
		return mesh;
	}

	const scene = new THREE.Scene();
	/** The one texture the stage makes: shared by every blob shadow and glow pool. */
	const disc = keepTexture(featheredDisc());

	// A soft fill, so the shadowed side of a block is still its own colour, and
	// one key light from above and to the left -- the kid's side -- so every
	// block has a bright face and a dark one and reads as a block. No shadow
	// maps: they cost a second pass over the whole frame for a cue the blobs
	// under the pieces already give, and this has to hold sixty frames a second
	// on a laptop.
	scene.add(new THREE.AmbientLight(0xffffff, 0.8));
	const key = new THREE.DirectionalLight(0xffffff, 1.6);
	key.position.set(-60, 200, 60);
	scene.add(key);

	// The table: the field as a slab whose top face is the playing surface. Its
	// near edge is the one thick edge a kid sees, which is what makes it a table
	// rather than a painted rectangle.
	const table = new THREE.Mesh(
		keep(new THREE.BoxGeometry(FIELD_WIDTH, TABLE_DEPTH, FIELD_HEIGHT)),
		surface(TABLE_COLOR),
	);
	table.position.set(FIELD_WIDTH / 2, -TABLE_DEPTH / 2, FIELD_HEIGHT / 2);
	scene.add(table);

	// A faint grid on the table's own surface, aligned with the field, so the
	// flat surface reads as a surface with distance on it. Painted a hair above
	// it, so it is a line on the table rather than a fight over the same pixels.
	const gridMaterial = halo(GRID_COLOR, 0.14);
	const gridAcrossZ = keep(new THREE.PlaneGeometry(0.4, FIELD_HEIGHT));
	const gridAcrossX = keep(new THREE.PlaneGeometry(FIELD_WIDTH, 0.4));
	for (const x of GRID_LINES_X) {
		const line = new THREE.Mesh(gridAcrossZ, gridMaterial);
		line.rotation.x = -Math.PI / 2;
		line.position.set(x, PAINT_Y, FIELD_HEIGHT / 2);
		scene.add(line);
	}
	for (const z of GRID_LINES_Z) {
		const line = new THREE.Mesh(gridAcrossX, gridMaterial);
		line.rotation.x = -Math.PI / 2;
		line.position.set(FIELD_WIDTH / 2, PAINT_Y, z);
		scene.add(line);
	}

	// The frame and the half-court line: the field a ball is played on, drawn on
	// the table. Each edge is the line itself plus a wider, dimmer copy of it,
	// which is the glow a bloom pass would have put there.
	const frameMaterial = halo(FRAME_COLOR, 0.55);
	const frameGlowMaterial = halo(FRAME_COLOR, 0.12);
	const border = 0.5;
	const borderGlow = 2.4;
	const horizontal = new THREE.PlaneGeometry(FIELD_WIDTH, border);
	const vertical = new THREE.PlaneGeometry(border, FIELD_HEIGHT);
	const horizontalGlow = new THREE.PlaneGeometry(FIELD_WIDTH, borderGlow);
	const verticalGlow = new THREE.PlaneGeometry(borderGlow, FIELD_HEIGHT);
	for (const [x, z, useVertical] of [
		[FIELD_WIDTH / 2, border / 2, false],
		[FIELD_WIDTH / 2, FIELD_HEIGHT - border / 2, false],
		[border / 2, FIELD_HEIGHT / 2, true],
		[FIELD_WIDTH - border / 2, FIELD_HEIGHT / 2, true],
	] as const) {
		const edge = new THREE.Mesh(
			keep(useVertical ? vertical.clone() : horizontal.clone()),
			frameMaterial,
		);
		edge.rotation.x = -Math.PI / 2;
		edge.position.set(x, PAINT_Y, z);
		scene.add(edge);

		const glow = new THREE.Mesh(
			keep(useVertical ? verticalGlow.clone() : horizontalGlow.clone()),
			frameGlowMaterial,
		);
		glow.rotation.x = -Math.PI / 2;
		glow.position.set(x, PAINT_Y / 2, z);
		scene.add(glow);
	}

	// The half-court line, dashed the way the flat picture had it, running from
	// one end of the table to the other.
	const dashGeometry = new THREE.PlaneGeometry(0.6, 4);
	for (let z = FIELD_HEIGHT - 6; z > 4; z -= 11) {
		const dash = new THREE.Mesh(keep(dashGeometry.clone()), frameMaterial);
		dash.rotation.x = -Math.PI / 2;
		dash.position.set(FIELD_WIDTH / 2, PAINT_Y, z);
		scene.add(dash);
	}

	// The paddles: blocks standing on the table, thick enough to have a top and
	// a side. Each is placed by its inner face -- the plane the engine measures
	// a hit against -- rather than by its middle, so the ball meets the block
	// exactly where the rules say it does.
	const paddleGeometry = keep(
		new RoundedBoxGeometry(
			PADDLE_DRAW_WIDTH,
			PADDLE_THICKNESS,
			PADDLE_HEIGHT,
			3,
			0.8,
		),
	);
	const player = new THREE.Mesh(paddleGeometry, solid(PLAYER_COLOR));
	player.position.set(
		PLAYER_FACE - PADDLE_DRAW_WIDTH / 2,
		PADDLE_THICKNESS / 2,
		FIELD_HEIGHT / 2,
	);
	scene.add(player);

	const cpu = new THREE.Mesh(paddleGeometry, solid(CPU_COLOR));
	cpu.position.set(
		CPU_FACE + PADDLE_DRAW_WIDTH / 2,
		PADDLE_THICKNESS / 2,
		FIELD_HEIGHT / 2,
	);
	scene.add(cpu);

	// The glow around a paddle is a pool of light on the table under it: the
	// copy of the block a bloom pass would have spread over the surface, and
	// the thing the hit flash brightens. Both pools are already in the scene;
	// all they need is to be put where their paddle starts.
	const playerGlow = glowPool(
		PLAYER_COLOR,
		PADDLE_DRAW_WIDTH * 3.4,
		PADDLE_HEIGHT * 1.5,
		0.55,
	);
	playerGlow.position.set(player.position.x, PAINT_Y, FIELD_HEIGHT / 2);

	const cpuGlow = glowPool(
		CPU_COLOR,
		PADDLE_DRAW_WIDTH * 3.4,
		PADDLE_HEIGHT * 1.5,
		0.55,
	);
	cpuGlow.position.set(cpu.position.x, PAINT_Y, FIELD_HEIGHT / 2);

	const playerShadow = shadow(
		PADDLE_DRAW_WIDTH * 1.9,
		PADDLE_HEIGHT * 1.15,
		0.5,
	);
	playerShadow.position.set(
		player.position.x + SHADOW_OFFSET_X,
		SHADOW_Y,
		FIELD_HEIGHT / 2 + SHADOW_OFFSET_Z,
	);
	const cpuShadow = shadow(PADDLE_DRAW_WIDTH * 1.9, PADDLE_HEIGHT * 1.15, 0.5);
	cpuShadow.position.set(
		cpu.position.x + SHADOW_OFFSET_X,
		SHADOW_Y,
		FIELD_HEIGHT / 2 + SHADOW_OFFSET_Z,
	);

	const ball = new THREE.Mesh(
		keep(new THREE.SphereGeometry(BALL_DRAW_RADIUS, 24, 16)),
		solid(BALL_COLOR, 0.75),
	);
	ball.position.set(FIELD_WIDTH / 2, BALL_DRAW_RADIUS, FIELD_HEIGHT / 2);
	scene.add(ball);

	// The ball's glow is a pool of light on the table under it, like the
	// paddles': a ball with a halo of its own colour around it, rather than a
	// ring of light at arm's length from it, which is what a halo sphere larger
	// than the ball draws from this close to overhead.
	const ballGlow = glowPool(
		BALL_COLOR,
		BALL_DRAW_RADIUS * 5,
		BALL_DRAW_RADIUS * 5,
		0.5,
	);
	ballGlow.position.set(ball.position.x, PAINT_Y, ball.position.z);

	const ballShadow = shadow(
		BALL_DRAW_RADIUS * 2.8,
		BALL_DRAW_RADIUS * 2.8,
		0.55,
	);
	ballShadow.position.set(
		ball.position.x + SHADOW_OFFSET_X,
		SHADOW_Y,
		ball.position.z + SHADOW_OFFSET_Z,
	);

	const trailGeometry = new THREE.SphereGeometry(1.3, 10, 8);
	const trail: HaloMesh[] = [];
	for (let i = 0; i < TRAIL_LENGTH; i += 1) {
		const mesh = new THREE.Mesh(
			keep(trailGeometry.clone()),
			halo(BALL_COLOR, 0.1),
		);
		mesh.visible = false;
		scene.add(mesh);
		trail.push(mesh);
	}

	// The camera: above the table on the kid's side of it, looking down its
	// length. Its axes are built from the one angle rather than from lookAt,
	// because the shake moves it along those axes every frame and the fit
	// measures the field along them once. There is no yaw and no roll: the frame
	// stays square with the table, so the two long edges of it are level.
	const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 16 / 9, 1, 1200);
	const cameraHome = new THREE.Vector3();
	const target = new THREE.Vector3(FIELD_WIDTH / 2, 0, CAMERA_AIM_Z);
	const pitch = THREE.MathUtils.degToRad(CAMERA_PITCH_DEG);
	const forward = new THREE.Vector3(0, -Math.cos(pitch), -Math.sin(pitch));
	const cameraRight = new THREE.Vector3(1, 0, 0);
	const cameraUp = new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch));
	camera.quaternion.setFromRotationMatrix(
		new THREE.Matrix4().makeBasis(
			cameraRight,
			cameraUp,
			forward.clone().negate(),
		),
	);

	// What has to be inside the frame: the table's own four corners, and the rim
	// under its near edge. Nothing else is asked for, because everything that
	// stands on the table stands inside its outline: a block seen from this far
	// above only ever leans away from the viewer, so a paddle at the foot of the
	// table still projects inside the table's own rectangle.
	const corners = [
		new THREE.Vector3(0, 0, 0),
		new THREE.Vector3(FIELD_WIDTH, 0, 0),
		new THREE.Vector3(0, 0, FIELD_HEIGHT),
		new THREE.Vector3(FIELD_WIDTH, 0, FIELD_HEIGHT),
		new THREE.Vector3(0, -TABLE_DEPTH, FIELD_HEIGHT),
		new THREE.Vector3(FIELD_WIDTH, -TABLE_DEPTH, FIELD_HEIGHT),
	];
	const offset = new THREE.Vector3();

	/**
	 * fit stands the camera back along its own axis until the table is inside a
	 * frame of this aspect ratio.
	 *
	 * A corner is inside the frame when it is within half the frame's angle on
	 * both axes, measured in the camera's own axes -- and since the camera only
	 * ever moves along its forward axis, the distance each corner asks for can be
	 * read off in one line. No search, no trigonometry per frame.
	 *
	 * The two long edges of the table are what this is really about. At the
	 * angle the camera stands, the near one is the wider of the two: it is the
	 * corner that asks for the most distance, and it is why the table's own
	 * middle has air around it while its near edge nearly touches the sides of
	 * the frame -- with its far edge about seven eighths as wide, which is the
	 * keystone a kid reads as a table lying down rather than a board stood up.
	 */
	function fit(aspect: number): void {
		camera.aspect = aspect;
		const halfV = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG) / 2);
		const halfH = halfV * aspect;
		let distance = 0;
		for (const corner of corners) {
			offset.copy(corner).sub(target);
			const along = offset.dot(forward);
			distance = Math.max(
				distance,
				Math.abs(offset.dot(cameraRight)) / halfH - along,
				Math.abs(offset.dot(cameraUp)) / halfV - along,
			);
		}
		camera.position
			.copy(target)
			.addScaledVector(forward, -distance * CAMERA_MARGIN);
		camera.updateProjectionMatrix();
		cameraHome.copy(camera.position);
	}

	return {
		scene,
		camera,
		cameraHome,
		cameraRight,
		cameraUp,
		player,
		cpu,
		ball,
		playerGlow,
		cpuGlow,
		ballGlow,
		playerShadow,
		cpuShadow,
		ballShadow,
		trail,
		fit,
		dispose() {
			for (const geometry of geometries) geometry.dispose();
			for (const material of materials) material.dispose();
			for (const texture of textures) texture.dispose();
		},
	};
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
