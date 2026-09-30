import { CalendarCheck, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AdminShell";
import { Empty, ErrorNotice } from "@/components/Bits";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getOverride, listLessons, putOverride } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import type { AdminSession, Lesson } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/** The sentinel the select uses for "no override"; a lesson number is a number. */
const AUTOMATIC = "auto";

/**
 * Current is the "Aula atual" section: which aula the lab is in, and the switch
 * that overrides the date.
 *
 * The date rule (latest lesson whose date has arrived) is right almost always,
 * and the exception is the reason this screen exists: the class slips a day, and
 * without the override every upload for the rest of the afternoon files itself
 * under the wrong aula.
 */
export function Current({
	session,
	onChanged,
}: {
	session: AdminSession;
	onChanged: () => void;
}) {
	const lessons = useAsync<Lesson[]>(
		(signal) => listLessons(signal),
		"lessons",
	);
	const override = useAsync((signal) => getOverride(signal), "override");
	const action = useAction();

	const lesson = session.currentLesson;

	async function choose(next: string) {
		const target = next === AUTOMATIC ? null : Number(next);
		await action.run(async () => {
			await putOverride(target);
			toast.success(
				target === null
					? "Aula atual escolhida pela data."
					: `Aula atual fixada na aula ${target}.`,
			);
			override.reload();
			// The badge lives in the shell, so the shell's session is what has to
			// be read again for the header to agree with what was just written.
			onChanged();
		});
	}

	return (
		<div>
			<PageTitle
				title="Aula atual"
				description="A aula que a turma está fazendo agora."
			/>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			{lessons.loading && <Skeleton className="h-40 rounded-xl" />}
			{lessons.error && (
				<ErrorNotice error={lessons.error} onRetry={lessons.reload} />
			)}

			{lessons.data && (
				<div className="grid gap-6 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								{lesson ? (
									<CalendarCheck className="size-5" />
								) : (
									<CalendarClock className="size-5" />
								)}
								{lesson
									? `Aula ${lesson.number}`
									: "Nenhuma aula começou ainda"}
							</CardTitle>
							<CardDescription>
								{lesson
									? formatLongDate(lesson.date)
									: "Cadastre as aulas em Aulas para o curso começar."}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							{lesson?.override ? (
								<Badge variant="outline">escolhida manualmente</Badge>
							) : (
								<Badge variant="secondary">escolhida pela data</Badge>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Escolher a aula</CardTitle>
							<CardDescription>
								Use isto quando a turma adiantar ou atrasar uma aula.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{lessons.data.length === 0 ? (
								<Empty>Nenhuma aula cadastrada ainda.</Empty>
							) : (
								<>
									<Select
										value={
											override.data === null || override.data.lesson === null
												? AUTOMATIC
												: String(override.data.lesson)
										}
										disabled={action.busy || override.loading}
										onValueChange={(next) => void choose(next)}
									>
										<SelectTrigger
											className="w-full"
											aria-label="Escolha a aula"
										>
											<SelectValue placeholder="Automático (pela data)" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={AUTOMATIC}>
												Automático (pela data)
											</SelectItem>
											{lessons.data.map((item) => (
												<SelectItem
													key={item.number}
													value={String(item.number)}
												>
													Aula {item.number} — {formatLongDate(item.date)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{override.error && (
										<ErrorNotice
											error={override.error}
											onRetry={override.reload}
										/>
									)}
								</>
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
