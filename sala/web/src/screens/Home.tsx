import {
	CalendarDays,
	FileText,
	FolderOpen,
	Gamepad2,
	UploadCloud,
	UserRound,
} from "lucide-react";
import { ComingSoon, FeatureTile } from "@/components/Tiles";
import { listGames } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import type { GamesView, PublicSession } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

/**
 * Home is the screen the lab PCs sit on between classes.
 *
 * Which lesson is running today, and the things a kid can do right now. The
 * tiles are the features that exist and open something.
 *
 * The Jogo tile is only there when there is a game to open, and it names what
 * is behind it: in single mode the game itself, in free mode the whole
 * catalogue. With no game visible the tile would open an empty screen, so the
 * "em breve" card stands in its place -- and while the answer is still coming,
 * neither is shown, because a card that guessed would be wrong half the time.
 */
export function Home({ session }: { session: PublicSession }) {
	const lesson = session.currentLesson;
	const games = useAsync<GamesView>(
		(signal) => listGames(signal),
		"home-games",
	);
	const view = games.data;

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
					{/* The jogo goes FIRST when there is one. It is what a kid opens
					    the screen for, and the grid is two columns on the lab's
					    1366x768 monitors -- further down, the tile they want most
					    would be the one below the fold. */}
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
					{view !== null && view.games.length === 0 && (
						<ComingSoon>Em breve: jogos!</ComingSoon>
					)}
				</div>
			</section>
		</div>
	);
}
