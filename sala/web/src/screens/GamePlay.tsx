import { Expand, Loader2 } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Empty, ErrorNotice, Link } from "@/components/Bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getGame } from "@/lib/api";
import { readEmulatorMessage, SYSTEM_LABELS } from "@/lib/games";
import type { Game } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { useRevalidateOnFocus } from "@/lib/useRevalidateOnFocus";

/**
 * How far along the embedded emulator is.
 *
 * `booting` is the runtime loading, `ready` is the runtime up and the game not
 * yet started, and `started` is the game running -- which is the only state in
 * which the overlay comes off. `error` is the page having given up, with the
 * pt-BR sentence it sent.
 */
type Phase = "booting" | "ready" | "started" | "error";

/**
 * GamePlay is one game, running.
 *
 * The emulator is not a component of this application and never becomes one: it
 * is a separate document in an iframe (`/emulador/play?game=…`), because
 * EmulatorJS installs globals, takes the keyboard and has to be torn down by
 * leaving. That page reports back with `postMessage`, and lib/games.ts is where
 * those messages are checked -- both the origin and the frame that sent them,
 * since a message event is a broadcast.
 *
 * The screen's own job is the frame around it: the panel that says what the
 * game is and which keys do what, the placar placeholder that is filled in
 * later, and the overlay that says what is happening while the emulator boots.
 */
export function GamePlay({ id }: { id: string }) {
	const game = useAsync<Game>((signal) => getGame(id, signal), `game-${id}`);
	const frame = useRef<HTMLIFrameElement | null>(null);
	const [phase, setPhase] = useState<Phase>("booting");
	const [failure, setFailure] = useState<Error | null>(null);
	// The development mock has no server to serve the emulator page, so it
	// renders a stand-in and skips the messages. Development only: a production
	// build folds this to `false`, and nothing else in the bundle mentions it.
	const mockMode = import.meta.env.DEV && import.meta.env.VITE_MOCK === "1";

	// Installed once. The listener is about the page's messages, not about which
	// game is on: a new game is a new document in the same frame, and the
	// frame's own load event (below) is what puts the screen back to "booting".
	useEffect(() => {
		if (mockMode) {
			setPhase("started");
			return;
		}
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
	 * start clean.
	 */
	function onFrameLoad(): void {
		setFailure(null);
		setPhase("booting");
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

	return (
		<div className="space-y-6">
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="space-y-4">
					<div className="relative overflow-hidden rounded-3xl border-2 border-border bg-black shadow-sm">
						{mockMode ? (
							<div className="grid aspect-[4/3] w-full place-items-center bg-scratch-control">
								<span className="rounded-2xl bg-background/80 px-4 py-2 font-bold text-lg">
									{data.title} (emulador de mentira, modo mock)
								</span>
							</div>
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
								Use o teclado para jogar. Se as teclas não responderem, clique
								no jogo.
							</p>
						)}
					</div>
				</div>

				<aside className="space-y-4">
					<div>
						<h1 className="font-extrabold text-4xl tracking-tight">
							{data.title}
						</h1>
						<p className="mt-1 text-xl text-muted-foreground">
							{data.year} · {data.maker}
						</p>
						<Badge variant="secondary" className="mt-2">
							{SYSTEM_LABELS[data.system]}
						</Badge>
					</div>

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

					{/* The placar goes here. The space is marked now so the panel
					    does not jump when it arrives. */}
					<Card className="border-2 border-dashed">
						<CardHeader>
							<CardTitle className="text-xl">Placar</CardTitle>
						</CardHeader>
						<CardContent className="text-muted-foreground">
							O placar da turma aparece aqui.
						</CardContent>
					</Card>
				</aside>
			</div>
		</div>
	);
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
