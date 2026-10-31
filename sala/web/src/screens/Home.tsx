import {
	CalendarDays,
	Cat,
	Drum,
	FileText,
	FolderOpen,
	Gamepad2,
	UploadCloud,
	UserRound,
} from "lucide-react";
import { FeatureTile, FileTile } from "@/components/Tiles";
import { getStarter, listGames } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import type { GamesView, PublicSession, PublicStarter } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

/**
 * Home is the screen the lab PCs sit on between classes.
 *
 * Which lesson is running today, and the things a kid can do right now. The
 * tiles are the features that exist and open something.
 *
 * The Projeto da aula tile comes FIRST when the teacher has picked one: it is
 * what the class is working on, and the grid is two columns on the lab's
 * 1366x768 monitors, so anywhere else it would be below the fold. It is a plain
 * link and not a screen of ours (see `FileTile`): the click is a download, and
 * the kid opens the file from Firefox's list -- or the system opens it, when
 * the server says so. With no project picked the tile is simply absent.
 *
 * The Jogo tile is only there when there is a game to open, and it names what
 * is behind it: in single mode the game itself, in free mode the whole
 * catalogue. With no game visible -- the teacher turned the games off, or
 * nothing is playable right now -- the tile is simply absent, and nothing
 * stands in its place: a card for a game that does not exist would teach a kid
 * that the screen lies. While the answer is still coming the tile is not shown
 * either, because one that guessed would be wrong half the time.
 *
 * The Batidas tile is the music class's tool, and it answers to the aula and
 * not to the games: a music aula can have a game of the day as well. It is a
 * plain link to a page outside this application (`/batidas/`), so the click is
 * a navigation the SPA does not route -- like the projeto's download.
 */
export function Home({ session }: { session: PublicSession }) {
	const lesson = session.currentLesson;
	const games = useAsync<GamesView>(
		(signal) => listGames(signal),
		"home-games",
	);
	const starter = useAsync<PublicStarter | null>(
		(signal) => getStarter(signal),
		"home-starter",
	);
	const view = games.data;
	const project = starter.data;

	return (
		<div className="space-y-8">
			<section className="animate-in rounded-3xl border-2 border-border bg-card p-8 shadow-sm duration-300 fade-in slide-in-from-bottom-4">
				<p className="font-bold text-lg text-muted-foreground uppercase tracking-wide">
					Aula de hoje
				</p>
				{lesson ? (
					<>
						<h1 className="font-extrabold text-6xl tracking-tight">
							Aula {lesson.number}
						</h1>
						<p className="mt-3 flex items-center gap-2 font-bold text-2xl text-muted-foreground">
							<CalendarDays aria-hidden="true" className="size-8" />
							{formatLongDate(lesson.date)}
						</p>
					</>
				) : (
					<>
						<h1 className="font-extrabold text-6xl tracking-tight">
							Nenhuma aula hoje
						</h1>
						<p className="mt-3 font-bold text-2xl text-muted-foreground">
							Divirta-se no Scratch!
						</p>
					</>
				)}
			</section>

			<section className="space-y-4">
				<h2 className="font-extrabold text-3xl">O que dá para fazer</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					{/* The projeto da aula goes FIRST when there is one, and the jogo
					    right after it: the two things a kid opens the screen for,
					    and the grid is two columns on the lab's 1366x768 monitors
					    -- further down, the tile they want most would be the one
					    below the fold. */}
					{project && (
						<FileTile
							href={project.url}
							title="Projeto da aula"
							// The kid reads the project's name, not its extension.
							description={
								project.name.replace(/\.sb3$/i, "").trim() ||
								"Abra no TurboWarp"
							}
							icon={<Cat className="size-9" />}
							color="sensing"
						/>
					)}
					{view !== null && view.games.length > 0 && (
						<FeatureTile
							to="/jogo"
							title={
								view.mode === "single"
									? (view.games[0]?.title ?? "Jogo")
									: "Jogos"
							}
							description="Vá jogar!"
							icon={<Gamepad2 className="size-9" />}
							color="control"
						/>
					)}
					{/* The music class has its own tool, and it is not a mode of the
					    games: in Aula 6 Super Mario Bros. is the game of the day and
					    the drum machine is still there, which is why this tile reads
					    the aula and not the game. */}
					{lesson?.music && (
						<FileTile
							href="/batidas/"
							title="Batidas"
							description="Monte uma batida"
							icon={<Drum className="size-9" />}
							color="sound"
						/>
					)}
					<FeatureTile
						to="/entregar"
						title="Entregar trabalho"
						description="Mande o seu arquivo"
						icon={<UploadCloud className="size-9" />}
						color="motion"
					/>
					<FeatureTile
						to="/meus-arquivos"
						title="Meus arquivos"
						description="O que você já entregou"
						icon={<FolderOpen className="size-9" />}
						color="variables"
					/>
					<FeatureTile
						to="/folhas"
						title="Folhas"
						description="As folhas das aulas"
						icon={<FileText className="size-9" />}
						color="looks"
					/>
					<FeatureTile
						to="/quem-sou-eu"
						title="Quem sou eu?"
						description="Escolha o seu nome"
						icon={<UserRound className="size-9" />}
						color="events"
					/>
				</div>
			</section>
		</div>
	);
}
