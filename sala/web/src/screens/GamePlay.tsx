import { CheckCircle2, Expand, Loader2, Trophy } from "lucide-react";
import type * as React from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Empty, ErrorNotice, Link, NameAvatar } from "@/components/Bits";
import { Placar } from "@/components/Placar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	ApiError,
	getGame,
	listStudents,
	postScore,
	putIdentity,
} from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { pontos } from "@/lib/format";
import { coverSrc, readEmulatorMessage, systemLabel } from "@/lib/games";
import type { Game, Student } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";
import { useRevalidateOnFocus } from "@/lib/useRevalidateOnFocus";

/**
 * The game of our own, loaded only when one is opened.
 *
 * A separate chunk and not part of this one: the screens that only hand work in
 * -- and every emulated game -- have no reason to load a game of their own, and
 * `import()` is what makes it a request that only a builtin game makes.
 */
const LazyPong = lazy(() => import("@/games/pong/PongGame"));

/**
 * The page the development mock puts where the emulator would be.
 *
 * In mock mode there is no lab server, so nothing serves `/emulador/play` and
 * no ROM is loaded. This stand-in plays the page's part instead: it announces
 * itself, says the game started, and then sends the score samples a real game
 * would send -- an attract sample, a match that scores, and the sample that ends
 * it -- so the live score and the end-of-match card can be looked at without a
 * ROM. Development only: the mock branch that renders it is folded out of a
 * production build, and this string with it.
 *
 * It is served as a blob URL rather than through `srcdoc`: a `srcdoc` document
 * has an opaque origin, so the samples it sent would arrive as "null" and be
 * refused by the same check that keeps other pages out.
 */
const MOCK_EMULATOR_PAGE = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;height:100%;background:#111;color:#fff;display:grid;place-items:center;font:18px system-ui">
<p>Emulador de mentira (modo mock)</p>
<script>
(function () {
  var send = function (message) {
    parent.postMessage(message, window.location.origin);
  };
  send({ type: 'sala:ready' });
  send({ type: 'sala:started' });
  var samples = [
    { inGame: false, score: 0 },
    { inGame: true, score: 10 },
    { inGame: true, score: 30 },
    { inGame: true, score: 50 },
    { inGame: false, score: 50 }
  ];
  var next = 0;
  var timer = setInterval(function () {
    if (next >= samples.length) {
      clearInterval(timer);
      return;
    }
    var sample = samples[next];
    next += 1;
    send({ type: 'sala:score', inGame: sample.inGame, score: sample.score });
  }, 1000);
})();
</script>
</body>
</html>`;

/**
 * How far along the embedded emulator is.
 *
 * `booting` is the runtime loading, `ready` is the runtime up and the game not
 * yet started, and `started` is the game running -- which is the only state in
 * which the overlay comes off. `error` is the page having given up, with the
 * pt-BR sentence it sent.
 */
type Phase = "booting" | "ready" | "started" | "error";

/** Where a finished game's pontuação got to. */
type Save =
	| { state: "waiting" }
	| { state: "saving" }
	| { state: "saved"; approved: boolean }
	| { state: "failed"; message: string };

/**
 * A finished round: the pontuação it scored and where filing it got to.
 *
 * `round` is which round it is. A write is slow enough to outlive the round
 * that started it -- the kid has started another one by the time the answer
 * arrives -- so the answer has to name the card it belongs to: it lands on that
 * round's card and never on a newer round's.
 */
type Result = { round: number; score: number; save: Save };

/**
 * One score sample from the emulator page: whether a match is running, and the
 * points it read (null when that sample could not be read).
 */
type ScoreSample = { inGame: boolean; score: number | null };

/**
 * GamePlay is one game, running.
 *
 * Two kinds of game, one screen. An EMULATED game is not a component of this
 * application and never becomes one: it is a separate document in an iframe
 * (`/emulador/play?game=…`), because EmulatorJS installs globals, takes the
 * keyboard and has to be torn down by leaving. That page reports back with
 * `postMessage`, and lib/games.ts is where those messages are checked -- both
 * the origin and the frame that sent them, since a message event is a broadcast.
 *
 * A BUILTIN game (Pong) is ours, so it renders right here in the main area
 * instead of an iframe, and it reports its own end through a callback rather
 * than through a message from another document. Everything around it is the
 * same: the panel that says what the game is and which keys do what, and the
 * placar.
 *
 * A finished builtin game files its pontuação as an automatic one, which the
 * server puts on the placar at once -- and it needs a name to file it under, so
 * a kid who has not picked one yet is asked here, with the pontuação held in
 * memory until they answer.
 *
 * An EMULATED game whose catalogue entry says where its score lives does the
 * same from the other side of the iframe: the page reads the score out of the
 * core's memory once a second and sends it, and the screen latches the last
 * score it could read while a match runs. When the page says the match ended,
 * that latched number is the result -- filed exactly as a builtin game's is,
 * under the same card, and skipped when it is zero or missing. An emulated game
 * with no score block reports nothing, and its pontuação is only what the kid
 * types into the placar.
 */
export function GamePlay({
	id,
	student,
	onStudentChanged,
}: {
	id: string;
	student: Student | null;
	onStudentChanged: () => void;
}) {
	const game = useAsync<Game>((signal) => getGame(id, signal), `game-${id}`);
	const frame = useRef<HTMLIFrameElement | null>(null);
	// The score handler reads the session student and the latch, and the message
	// listener is installed once -- so the listener calls through this ref,
	// which always holds the last render's handler.
	const onScoreRef = useRef<(sample: ScoreSample) => void>(() => {});
	const [phase, setPhase] = useState<Phase>("booting");
	const [failure, setFailure] = useState<Error | null>(null);
	// What the finished game scored and where filing it got to, and the counter
	// that asks the placar to read the server again once it is on the board.
	const [result, setResult] = useState<Result | null>(null);
	// The round the last result belonged to. A write is filed under the round
	// that started it, so a late answer can only touch that round's card.
	const roundRef = useRef(0);
	const [placarKey, setPlacarKey] = useState(0);
	// The live score of a match in progress: `inGame` is the page's latest
	// sample flag, and `liveScore` is the last score it could read. The refs are
	// the same two values for the handler, which runs outside React's render and
	// cannot read the state it has not seen yet.
	const [inGame, setInGame] = useState(false);
	const [liveScore, setLiveScore] = useState<number | null>(null);
	const inGameRef = useRef(false);
	const latchRef = useRef<number | null>(null);
	const action = useAction();
	// The development mock has no server to serve the emulator page, so it
	// renders a stand-in that plays the page's part. Development only: a
	// production build folds this to `false`, and nothing else in the bundle
	// mentions it.
	const mockMode = import.meta.env.DEV && import.meta.env.VITE_MOCK === "1";
	// The blob the mock page is served from, made when the mock is on and
	// revoked when the screen goes away. It is a blob and not a `srcdoc` so the
	// document keeps this origin and its messages pass the check below.
	const [mockSrc, setMockSrc] = useState<string | null>(null);
	useEffect(() => {
		if (!mockMode) return;
		const url = URL.createObjectURL(
			new Blob([MOCK_EMULATOR_PAGE], { type: "text/html" }),
		);
		setMockSrc(url);
		return () => URL.revokeObjectURL(url);
	}, []);
	// Whether the game reports its own pontuação. Unknown until the catalogue
	// answer arrives, and a sample that arrives before it has no game to belong
	// to.
	const autoScore = game.data?.autoScore ?? false;
	// The panel's picture and the source that failed to load. Read from the
	// answer here rather than beside the render below, because a hook cannot sit
	// after the early returns that an absent answer produces. Keeping the failed
	// SOURCE and not a flag makes a new picture a new chance: the failure
	// belongs to the image that failed.
	const cover = game.data ? coverSrc(game.data) : null;
	const [failedCover, setFailedCover] = useState<string | null>(null);
	const coverFailed = cover !== null && failedCover === cover;

	// Installed once. The listener is about the page's messages, not about which
	// game is on: a new game is a new document in the same frame, and the
	// frame's own load event (below) is what puts the screen back to "booting".
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = readEmulatorMessage(
				event,
				frame.current?.contentWindow ?? null,
				window.location.origin,
			);
			if (!message) return;
			if (message.type === "sala:error") {
				setFailure(new Error(message.message));
				setPhase("error");
				return;
			}
			if (message.type === "sala:started") {
				// A game that started IS running: whatever an earlier message
				// said went wrong -- the page also reports a failed fetch that
				// nothing depended on -- did not stop it, and a red card over a
				// game the kid is playing is a lie.
				setFailure(null);
				setPhase("started");
				return;
			}
			if (message.type === "sala:score") {
				onScoreRef.current(message);
				return;
			}
			setPhase("ready");
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	/**
	 * A frame load is the start of a game.
	 *
	 * It clears whatever the last document said and puts the screen back to
	 * "booting", which is what makes following a link from one game to another
	 * start clean. The latch goes with it: a score from the document that just
	 * went away is not this game's.
	 */
	function onFrameLoad(): void {
		setFailure(null);
		setPhase("booting");
		inGameRef.current = false;
		latchRef.current = null;
		setInGame(false);
		setLiveScore(null);
	}

	/** Fullscreen is asked of the IFRAME, so the game fills the screen and not the page. */
	async function enterFullscreen(): Promise<void> {
		try {
			await frame.current?.requestFullscreen();
		} catch {
			// The browser refused (or there is no frame at all in mock mode).
			// Nothing to do: the game stays where it is.
		}
	}

	/**
	 * file writes a finished game's pontuação, as an automatic one.
	 *
	 * Automatic because OUR game is the one that counted it: the kid cannot have
	 * typed it, so there is nothing for the teacher to confirm and the server
	 * puts it straight on the placar. The answer says whether that happened
	 * rather than this screen assuming it from the method it sent.
	 *
	 * `round` is the round the pontuação belongs to, and every answer lands on
	 * that round's card alone: by the time a slow write is answered the kid may
	 * be in another round, whose card says something else and is not this
	 * answer's to overwrite.
	 */
	async function file(score: number, round: number): Promise<void> {
		setResult((prev) =>
			prev && prev.round === round
				? { ...prev, save: { state: "saving" } }
				: prev,
		);
		try {
			const created = await postScore({ gameId: id, score, method: "auto" });
			setResult((prev) =>
				prev && prev.round === round
					? { ...prev, save: { state: "saved", approved: created.approved } }
					: prev,
			);
			setPlacarKey((n) => n + 1);
		} catch (error: unknown) {
			setResult((prev) =>
				prev && prev.round === round
					? { ...prev, save: { state: "failed", message: messageOf(error) } }
					: prev,
			);
		}
	}

	/**
	 * onGameOver is a match that has ended: celebrate it, and file its
	 * pontuação if there is a name to file it under.
	 *
	 * Both kinds of game arrive here -- our own through its callback, an
	 * emulated one through the score sample that says the match stopped -- and
	 * everything after this point is the same for both: the card, the confetti,
	 * and the automatic pontuação the server approves as it arrives.
	 */
	function onGameOver(score: number): void {
		celebrate();
		roundRef.current += 1;
		const round = roundRef.current;
		setResult({
			round,
			score,
			save: student ? { state: "saving" } : { state: "waiting" },
		});
		if (student) void file(score, round);
	}

	/**
	 * onGameStart clears the card a new round would otherwise be sitting under.
	 *
	 * The card is about a game that is OVER, and the one that just began has no
	 * pontuação yet: the previous number left on the screen while the kid plays
	 * reads as this game's. The exception is a pontuação that still has
	 * something waiting on it -- one looking for a name, one whose write is
	 * still in flight, or one that failed to be filed -- because clearing that
	 * card would take away the only place that number exists. A write still in
	 * flight is the one that has to stay the most: its answer is coming either
	 * way, and a refusal has nowhere else to leave the retry.
	 */
	function onGameStart(): void {
		setResult((prev) =>
			prev &&
			(prev.save.state === "waiting" ||
				prev.save.state === "saving" ||
				prev.save.state === "failed")
				? prev
				: null,
		);
	}

	/**
	 * onScore is what one score sample from the page means for the screen.
	 *
	 * A sample says two things: whether a match is running, and the score it
	 * could read (null when this one could not be read). While a match runs the
	 * screen LATCHES the last score it could read and shows it live -- a sample
	 * without a number is not a score of zero, it is a reading to skip, and the
	 * number on the board when the match ends is the one that matters.
	 *
	 * The moment the page says the match stopped -- `inGame` true, then false --
	 * the latched score is the game's result, and it is filed once. A match that
	 * ends with a latch of zero or none files nothing: that is the attract demo
	 * or a round that never scored. The latch is cleared after filing and when a
	 * new match starts, so one game's number is never filed for the next.
	 *
	 * The game only counts its own pontuação when the catalogue says it can; for
	 * any other emulated game the samples are ignored.
	 */
	function onScore(sample: ScoreSample): void {
		if (!autoScore) return;

		if (sample.inGame) {
			if (!inGameRef.current) {
				// A new match: the last game's latch is not this one's.
				latchRef.current = null;
				setLiveScore(null);
				onGameStart();
			}
			if (sample.score !== null) {
				latchRef.current = sample.score;
				setLiveScore(sample.score);
			}
			inGameRef.current = true;
			setInGame(true);
			return;
		}

		const latched = latchRef.current;
		// Redundant today -- the latch is written only inside the in-game
		// branch, so a positive latch already means a match was running -- and
		// kept so a latch written anywhere else can never file an attract score.
		if (inGameRef.current && latched !== null && latched > 0) {
			latchRef.current = null;
			setLiveScore(null);
			onGameOver(latched);
		}
		inGameRef.current = false;
		setInGame(false);
	}
	onScoreRef.current = onScore;

	/**
	 * pick names the kid the pontuação belongs to.
	 *
	 * The score is already in memory, so this is the one thing standing between
	 * a game that just ended and the placar: the name goes in the session, the
	 * header and the placar are told to read it again, and the pontuação is
	 * filed -- all without the kid losing what they scored.
	 */
	async function pick(chosen: Student): Promise<void> {
		const score = result?.score;
		const round = result?.round;
		await action.run(async () => {
			await putIdentity(chosen.id);
			onStudentChanged();
			if (score !== undefined && round !== undefined) await file(score, round);
		});
	}

	// The teacher can turn this game off while the kid is looking at it, and
	// nothing tells this screen. Coming back to the tab asks the server once: a
	// game that is no longer visible answers 404, and reloading is what puts the
	// screen on the empty state it already knows how to show. A game that is
	// still there is left alone -- reloading it would throw away the running
	// emulator and start the game over from the title screen.
	useRevalidateOnFocus(async (signal) => {
		try {
			await getGame(id, signal);
			return true;
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) {
				game.reload();
				return false;
			}
			return true;
		}
	});

	if (game.loading) {
		return <Skeleton className="aspect-[4/3] w-full rounded-3xl" />;
	}

	if (game.error) {
		// A 404 is the server saying this game is not visible -- not a failure
		// the kid can retry -- so it reads as an empty state, not as an error.
		if (game.error instanceof ApiError && game.error.status === 404) {
			return (
				<Empty>
					Este jogo não está liberado agora.{" "}
					<Link to="/jogo" className="font-bold underline">
						Ver os jogos
					</Link>
				</Empty>
			);
		}
		return <ErrorNotice error={game.error} onRetry={game.reload} />;
	}

	const data = game.data;
	if (!data) return null;

	const builtin = data.type === "builtin";

	return (
		<div className="space-y-6">
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="space-y-4">
					{builtin ? (
						<Suspense
							fallback={
								<Skeleton className="aspect-video w-full rounded-3xl" />
							}
						>
							<LazyPong onGameOver={onGameOver} onStart={onGameStart} />
						</Suspense>
					) : (
						<>
							<div className="relative overflow-hidden rounded-3xl border-2 border-border bg-black shadow-sm">
								{mockMode ? (
									mockSrc && (
										<iframe
											ref={frame}
											src={mockSrc}
											title={data.title}
											onLoad={onFrameLoad}
											className="aspect-[4/3] w-full border-0"
										/>
									)
								) : (
									<iframe
										ref={frame}
										src={`/emulador/play?game=${encodeURIComponent(data.id)}`}
										title={data.title}
										allow="fullscreen; gamepad; autoplay"
										onLoad={onFrameLoad}
										className="aspect-[4/3] w-full border-0"
									/>
								)}

								{!failure && phase !== "started" && (
									<div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
										<span className="flex items-center gap-3 font-bold text-xl">
											<Loader2 className="size-7 animate-spin" />
											{phase === "ready"
												? "Preparando o jogo…"
												: "Ligando o emulador…"}
										</span>
									</div>
								)}
							</div>

							{failure && <ErrorNotice error={failure} />}

							<div className="flex flex-wrap items-center gap-3">
								<Button
									size="lg"
									variant="outline"
									disabled={mockMode}
									onClick={() => void enterFullscreen()}
									className="h-14 rounded-2xl px-5 font-bold text-lg"
								>
									<Expand className="size-6" />
									Tela cheia
								</Button>
								{phase === "started" && (
									<p className="text-lg text-muted-foreground">
										Use o teclado para jogar. Se as teclas não responderem,
										clique no jogo.
									</p>
								)}
							</div>
						</>
					)}

					{/* The card under the game is the same one for both kinds of
					    game; only what it says about the number differs. A builtin
					    game reads its own score out, an emulated one gets it from
					    the page's samples. */}
					{result && (
						<ResultCard
							title={builtin ? "Sua pontuação" : "Fim de jogo!"}
							scoreLine={
								builtin ? (
									pontos(result.score)
								) : (
									<>Você fez {pontos(result.score)} 🎉</>
								)
							}
							save={result.save}
							picking={action.busy}
							pickError={action.error}
							onPick={(chosen) => void pick(chosen)}
							onRetry={() => void file(result.score, result.round)}
						/>
					)}
				</div>

				<aside className="space-y-4">
					<div className="flex items-start gap-4">
						{cover !== null && !coverFailed && (
							<img
								src={cover}
								alt=""
								className="h-28 w-24 shrink-0 rounded-2xl border-2 border-border bg-scratch-ink object-contain"
								onError={() => setFailedCover(cover)}
							/>
						)}
						<div>
							<h1 className="font-extrabold text-4xl tracking-tight">
								{data.title}
							</h1>
							<p className="mt-1 text-xl text-muted-foreground">
								{data.year} · {data.maker}
							</p>
							<Badge variant="secondary" className="mt-2">
								{systemLabel(data.system)}
							</Badge>
						</div>
					</div>

					{/* The live score sits above the placar: while a match runs it is
					    the number the kid is watching, and it belongs to this round
					    rather than to the board. */}
					{!builtin && autoScore && inGame && liveScore !== null && (
						<LiveScore score={liveScore} />
					)}

					{/* The placar comes before what the game IS. At the lab's
					    1366x768 the sidebar is taller than the screen, and the board
					    is what a kid looks for right after a round; the description
					    and the keys can wait for a scroll. */}
					<Placar game={data} student={student} refreshKey={placarKey} />

					<Card className="border-2">
						<CardHeader>
							<CardTitle className="text-xl">Sobre o jogo</CardTitle>
						</CardHeader>
						<CardContent className="text-lg">{data.about}</CardContent>
					</Card>

					<Card className="border-2">
						<CardHeader>
							<CardTitle className="text-xl">Controles</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="space-y-3">
								{data.controls.map((control) => (
									<li
										key={`${control.keys.join("+")}:${control.action}`}
										className="flex flex-wrap items-center gap-2"
									>
										<span className="flex gap-1">
											{control.keys.map((key) => (
												<Key key={key}>{key}</Key>
											))}
										</span>
										<span className="text-lg">{control.action}</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				</aside>
			</div>
		</div>
	);
}

/**
 * ResultCard is what a finished game leaves on the screen.
 *
 * It is about the PONTUAÇÃO, not about the game having ended -- a builtin game
 * says that itself, on its own game-over screen with its own "Jogar de novo",
 * so its heading names the pontuação rather than the end -- and an emulated
 * game's heading is what tells the kid the match stopped, since nothing else on
 * the screen does.
 *
 * The pontuação is the headline, because it is what the kid just earned. Under
 * it is the part they cannot see for themselves -- whether it reached the
 * placar -- and the one thing that can still be missing: a name to file it
 * under. Without a name the card asks for one instead of throwing the pontuação
 * away, and the score stays here while they answer.
 */
function ResultCard({
	title,
	scoreLine,
	save,
	picking,
	pickError,
	onPick,
	onRetry,
}: {
	title: string;
	scoreLine: React.ReactNode;
	save: Save;
	picking: boolean;
	pickError: Error | null;
	onPick: (student: Student) => void;
	onRetry: () => void;
}) {
	return (
		<Card className="animate-in border-2 border-scratch-operators duration-300 fade-in slide-in-from-bottom-2">
			<CardHeader>
				<CardTitle className="flex items-center gap-3 text-2xl">
					<Trophy aria-hidden="true" className="size-8" />
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="font-extrabold text-5xl tracking-tight">{scoreLine}</p>

				{save.state === "saving" && (
					<p className="flex items-center gap-3 text-lg">
						<Loader2 className="size-6 animate-spin" />
						Salvando a sua pontuação…
					</p>
				)}

				{save.state === "saved" && (
					<p className="flex items-center gap-3 font-bold text-lg text-scratch-operators">
						<CheckCircle2 className="size-6 shrink-0" />
						{save.approved
							? "Sua pontuação já está no placar!"
							: "O professor vai confirmar a sua pontuação."}
					</p>
				)}

				{save.state === "failed" && (
					<div className="space-y-3">
						<p role="alert" className="text-destructive">
							{save.message}
						</p>
						<Button
							size="lg"
							variant="outline"
							onClick={onRetry}
							className="h-12 rounded-2xl font-bold"
						>
							Tentar de novo
						</Button>
					</div>
				)}

				{save.state === "waiting" && (
					<div className="space-y-3">
						<p className="font-bold text-xl">
							Quem é você? Escolha o seu nome para guardar a pontuação.
						</p>
						{pickError && <ErrorNotice error={pickError} />}
						<NamePicker onPick={onPick} disabled={picking} />
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * LiveScore is the running pontuação of a match, big and in the side panel.
 *
 * The number is keyed by its own value so that a change remounts it and the
 * entrance animation replays -- a count that only changes its text would sit
 * still while the game moves. `pontos` writes the word that goes with it, so a
 * kid reads "1 ponto" and "30 pontos".
 */
function LiveScore({ score }: { score: number }) {
	return (
		<Card className="border-2 border-scratch-motion">
			<CardContent className="space-y-1 py-4">
				<p className="font-bold text-lg text-muted-foreground">Pontos agora</p>
				<p
					key={score}
					className="animate-in font-extrabold text-5xl tabular-nums duration-300 zoom-in-50"
				>
					{pontos(score)}
				</p>
			</CardContent>
		</Card>
	);
}

/**
 * NamePicker is the class list, as the cards the identity screen shows.
 *
 * Loaded when a pontuação is waiting for a name and not before: a kid who
 * already said who they are never sees it, and a screen that fetched the class
 * list on every visit would ask the server a question nobody was waiting on.
 */
function NamePicker({
	onPick,
	disabled,
}: {
	onPick: (student: Student) => void;
	disabled: boolean;
}) {
	const students = useAsync<Student[]>(
		(signal) => listStudents(signal),
		"score-name-picker",
	);

	if (students.error) {
		return <ErrorNotice error={students.error} onRetry={students.reload} />;
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{(students.data ?? []).map((student) => (
				<Button
					key={student.id}
					type="button"
					variant="outline"
					disabled={disabled || students.loading}
					onClick={() => onPick(student)}
					className="h-auto min-h-16 justify-start gap-3 rounded-2xl border-2 px-3 py-2 text-left"
				>
					<NameAvatar id={student.id} name={student.name} className="size-10" />
					<span className="font-extrabold text-xl">{student.name}</span>
				</Button>
			))}
		</div>
	);
}

/**
 * messageOf is the sentence a pontuação that could not be filed shows.
 *
 * The API writes its refusals in pt-BR for exactly this purpose, so the message
 * is shown as it came. Anything that is not an Error at all has no message to
 * show and gets the sentence this screen would have written itself.
 */
function messageOf(error: unknown): string {
	if (error instanceof Error && error.message !== "") return error.message;
	return "Não foi possível guardar a sua pontuação. Tente de novo.";
}

/**
 * Key is one keyboard key drawn as the physical key it is.
 *
 * The extra bottom border is the whole trick: a keycap has a side and a front,
 * and a flat chip reads as a label rather than as something to press. The keys
 * come from the catalogue, which states the ones the emulator really listens
 * for, so a kid can look down at the keyboard and find them.
 */
function Key({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="min-w-9 rounded-lg border-2 border-b-4 border-border bg-muted px-2.5 py-1 text-center font-bold text-base">
			{children}
		</kbd>
	);
}
