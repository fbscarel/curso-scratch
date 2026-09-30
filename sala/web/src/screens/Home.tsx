import { CalendarDays, UserRound } from "lucide-react";
import { ComingSoon, FeatureTile } from "@/components/Tiles";
import { formatLongDate } from "@/lib/format";
import type { PublicSession } from "@/lib/types";

/**
 * Home is the screen the lab PCs sit on between classes.
 *
 * Two things and no more: which lesson is running today, and the one thing a kid
 * can do right now. Everything else this course will grow (entregas, folhas,
 * jogos) is named in the "em breve" card rather than shown as a tile that opens
 * nothing -- a control that does nothing teaches a kid that the screen lies.
 */
export function Home({ session }: { session: PublicSession }) {
	const lesson = session.currentLesson;
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
					<FeatureTile
						to="/quem-sou-eu"
						title="Quem sou eu?"
						description="Escolha o seu nome"
						icon={<UserRound className="size-9" />}
						color="motion"
					/>
					<ComingSoon>Em breve: entregar trabalhos, folhas e jogos!</ComingSoon>
				</div>
			</section>
		</div>
	);
}
