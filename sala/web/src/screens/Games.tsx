import { Gamepad2 } from "lucide-react";
import { Empty, ErrorNotice, Link } from "@/components/Bits";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listGames } from "@/lib/api";
import { coverSrc, systemLabel } from "@/lib/games";
import { SCRATCH, type ScratchColor } from "@/lib/palette";
import { hrefFor } from "@/lib/router";
import type { Game, GameSystem, GamesView, Student } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { useRevalidateOnFocus } from "@/lib/useRevalidateOnFocus";
import { cn } from "@/lib/utils";
import { GamePlay } from "@/screens/GamePlay";

/**
 * The block colour of each console.
 *
 * A grid of games is the same shape as the home screen's tiles, and a kid reads
 * the colours before the words -- so each console gets one, always the same
 * one. It is a display choice and lives here rather than with the catalogue:
 * the server names consoles, it does not paint them.
 *
 * A game of our own has no console to take a colour from, and it wears the
 * Scratch control block -- the orange a kid already reads as "control".
 */
const SYSTEM_COLORS: Record<GameSystem, ScratchColor> = {
	atari2600: "motion",
	arcade: "events",
	nes: "sensing",
	snes: "looks",
	genesis: "sound",
};

/** colorOf is the block colour of a game's card. */
function colorOf(game: Game): ScratchColor {
	return game.system === null ? "control" : SYSTEM_COLORS[game.system];
}

/**
 * sameView says whether an answer to `GET /api/games` is the screen already on.
 *
 * The mode and the games' ids are what decide which screen this is -- one game's
 * page, a grid of them, or the empty state -- and the rest of a game's payload
 * is the tracked catalogue, which does not change while the server runs.
 * Comparing less would reload the screen for nothing, and reloading this one
 * throws away the emulator the kid is playing in.
 */
function sameView(current: GamesView | null, next: GamesView): boolean {
	if (current === null || current.mode !== next.mode) return false;
	if (current.games.length !== next.games.length) return false;
	return current.games.every(
		(game, index) => game.id === next.games[index]?.id,
	);
}

/**
 * Games is the `/jogo` screen, and it is two screens.
 *
 * In single mode the server has already narrowed the list to the one game the
 * teacher turned on, so this renders that game's page and nothing else -- the
 * kid asked to play and should land in the game, not on a list of one.
 *
 * In free mode the list is the whole playable catalogue and the screen is the
 * grid a kid chooses from. A mode with nothing visible at all -- free mode on a
 * laptop whose ROMs are missing, or single mode with the game unplugged -- is
 * the empty state, and it says so instead of showing an empty grid.
 */
export function Games({
	student,
	onStudentChanged,
}: {
	student: Student | null;
	onStudentChanged: () => void;
}) {
	const games = useAsync<GamesView>((signal) => listGames(signal), "games");

	// The teacher can change the mode while the kid is on this screen: turn the
	// class's game off, or open the whole catalogue. Coming back to the tab is
	// when that matters, and it is also where the answer has to change the
	// screen -- the same game means nothing to do (reloading it would restart
	// the emulator the kid is playing), anything else means showing the new one.
	useRevalidateOnFocus(async (signal) => {
		const now = await listGames(signal);
		if (sameView(games.data, now)) return true;
		games.reload();
		return false;
	});

	if (games.loading) {
		return (
			<div className="space-y-8">
				<Skeleton className="h-16 w-64 rounded-2xl" />
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-56 rounded-3xl" />
					))}
				</div>
			</div>
		);
	}

	if (games.error) {
		return <ErrorNotice error={games.error} onRetry={games.reload} />;
	}

	const view = games.data;
	if (!view) return null;

	const only = view.games[0];
	if (view.mode === "single" && only) {
		return (
			<GamePlay
				id={only.id}
				student={student}
				onStudentChanged={onStudentChanged}
			/>
		);
	}

	return (
		<div className="space-y-8">
			<div className="animate-in duration-300 fade-in">
				<h1 className="font-extrabold text-5xl tracking-tight">Jogos</h1>
				<p className="mt-2 text-2xl text-muted-foreground">
					Escolha um jogo para jogar.
				</p>
			</div>

			{view.games.length === 0 ? (
				<Empty>
					Nenhum jogo liberado agora. Peça para o professor liberar um jogo.
				</Empty>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{view.games.map((game) => (
						<GameCard key={game.id} game={game} />
					))}
				</div>
			)}
		</div>
	);
}

/**
 * GameCard is one game in the grid.
 *
 * The whole card is the link and the target is oversized, like the home
 * screen's tiles: the picture, the title and the console badge are all part of
 * it. The console badge is the pt-BR name a kid recognises ("Fliperama"), and
 * the year is there because a 1983 game is a thing they ask about.
 *
 * The picture is the game's cover when the laptop has one, and the console's
 * icon on the block colour of that console when it does not: box art has many
 * aspect ratios, so it is contained rather than stretched, on the dark card the
 * covers are drawn for.
 */
function GameCard({ game }: { game: Game }) {
	const cover = coverSrc(game);
	return (
		<Link
			to={hrefFor({ name: "game", id: game.id })}
			className="group flex animate-in flex-col gap-3 rounded-3xl border-2 border-border bg-card p-4 shadow-sm transition-all duration-300 fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
		>
			{cover === null ? (
				<span
					className={cn(
						"grid aspect-[4/3] place-items-center rounded-2xl text-foreground shadow-inner",
						SCRATCH[colorOf(game)],
					)}
				>
					<Gamepad2 aria-hidden="true" className="size-14" />
				</span>
			) : (
				<span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-scratch-ink shadow-inner">
					<img src={cover} alt="" className="h-full w-full object-contain" />
				</span>
			)}
			<span className="font-extrabold text-2xl">{game.title}</span>
			<span className="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">{systemLabel(game.system)}</Badge>
				<span className="text-lg text-muted-foreground">{game.year}</span>
			</span>
		</Link>
	);
}
