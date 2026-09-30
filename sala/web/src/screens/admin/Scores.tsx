import { Check, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AdminShell";
import { Empty, ErrorNotice, NameAvatar } from "@/components/Bits";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	deleteScore,
	getAdminGames,
	listAdminScores,
	listLessons,
	setScoreApproval,
} from "@/lib/api";
import { formatDateTime, formatLongDate, pontos } from "@/lib/format";
import type { AdminScore, Lesson } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/** The sentinels the two filters use; a lesson number is a number and a game has an id. */
const ALL_LESSONS = "all";
const ALL_GAMES = "all";

/**
 * Scores is the teacher's placar screen, and it has two jobs.
 *
 * The first is the pile of pontuações a kid typed in themselves: nothing a kid
 * writes is on the placar until it is confirmed here, and both answers are on
 * the row -- Aprovar puts it on the board, Recusar throws it away.
 *
 * The second is the board itself. A pontuação that was confirmed by mistake, or
 * a number nobody believes, comes off here, which is why the approved list is
 * filterable by aula and by jogo: the record is all-time, so "quem está no
 * placar do Pong nesta aula" is a question that has to be answerable.
 */
export function Scores({ currentNumber }: { currentNumber: number | null }) {
	const lessons = useAsync<Lesson[]>(
		(signal) => listLessons(signal),
		"lessons",
	);
	const games = useAsync((signal) => getAdminGames(signal), "admin-games");
	const action = useAction();
	const [lesson, setLesson] = useState<number | null>(null);
	const [game, setGame] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<AdminScore | null>(null);
	const [removing, setRemoving] = useState<AdminScore | null>(null);

	// The list opens on the aula the lab is in -- the one the kids are scoring in
	// -- the same way the entregas do.
	useEffect(() => {
		if (lesson !== null || !lessons.data || lessons.data.length === 0) return;
		const registered =
			currentNumber !== null &&
			lessons.data.some((item) => item.number === currentNumber);
		setLesson(
			registered ? currentNumber : (lessons.data.at(-1)?.number ?? null),
		);
	}, [lessons.data, lesson, currentNumber]);

	const pending = useAsync<AdminScore[]>(
		(signal) => listAdminScores({ status: "pending" }, signal),
		"scores-pending",
	);
	const approved = useAsync<AdminScore[]>(
		(signal) =>
			listAdminScores(
				{
					status: "approved",
					...(lesson !== null ? { lesson } : {}),
					...(game !== null ? { game } : {}),
				},
				signal,
			),
		`approved-${lesson ?? "-"}-${game ?? "-"}`,
	);

	/** reload reads both lists again: an answer here changes what the other shows. */
	function reload(): void {
		pending.reload();
		approved.reload();
	}

	async function approve(score: AdminScore): Promise<void> {
		await action.run(async () => {
			await setScoreApproval(score.id, true);
			toast.success(
				`${pontos(score.score)} de ${score.student.name} no placar.`,
			);
			reload();
		});
	}

	async function confirmReject(): Promise<void> {
		const score = rejecting;
		setRejecting(null);
		if (score === null) return;
		await action.run(async () => {
			await deleteScore(score.id);
			toast.success("Pontuação recusada.");
			reload();
		});
	}

	async function confirmRemove(): Promise<void> {
		const score = removing;
		setRemoving(null);
		if (score === null) return;
		await action.run(async () => {
			await deleteScore(score.id);
			toast.success("Pontuação removida do placar.");
			reload();
		});
	}

	return (
		<div>
			<PageTitle
				title="Placar"
				description="As pontuações da turma, e o que espera a sua confirmação."
			/>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Esperando confirmação</CardTitle>
					<CardDescription>
						Pontuações que os alunos anotaram. Nada aqui está no placar ainda.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{pending.loading && (
						<div className="space-y-2">
							{[0, 1].map((n) => (
								<Skeleton key={n} className="h-12 rounded-lg" />
							))}
						</div>
					)}
					{pending.error && (
						<ErrorNotice error={pending.error} onRetry={pending.reload} />
					)}
					{pending.data && pending.data.length === 0 && (
						<Empty>Nenhuma pontuação esperando confirmação.</Empty>
					)}
					{pending.data && pending.data.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Aluno</TableHead>
									<TableHead>Jogo</TableHead>
									<TableHead>Pontos</TableHead>
									<TableHead>Horário</TableHead>
									<TableHead className="text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{pending.data.map((score) => (
									<TableRow key={score.id}>
										<TableCell>
											<span className="flex items-center gap-3">
												<NameAvatar
													id={score.student.id}
													name={score.student.name}
													className="size-8 text-base"
												/>
												<span className="font-medium">
													{score.student.name}
												</span>
											</span>
										</TableCell>
										<TableCell>
											{score.game.title}
											<span className="ml-2 text-muted-foreground">
												(Aula {score.lessonNumber})
											</span>
										</TableCell>
										<TableCell className="font-semibold tabular-nums">
											{score.score}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDateTime(score.createdAt)}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap justify-end gap-2">
												<Button
													size="sm"
													disabled={action.busy}
													onClick={() => void approve(score)}
												>
													<Check />
													Aprovar
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={action.busy}
													onClick={() => setRejecting(score)}
												>
													<X />
													Recusar
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Filtrar o placar</CardTitle>
					<CardDescription>
						Escolha a aula e, se quiser, um jogo.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-end gap-4">
					<div className="space-y-2">
						<Label htmlFor="placar-aula">Aula</Label>
						<Select
							value={lesson === null ? ALL_LESSONS : String(lesson)}
							onValueChange={(next) =>
								setLesson(next === ALL_LESSONS ? null : Number(next))
							}
						>
							<SelectTrigger
								id="placar-aula"
								className="w-64"
								aria-label="Filtrar por aula"
							>
								<SelectValue placeholder="Todas as aulas" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_LESSONS}>Todas as aulas</SelectItem>
								{(lessons.data ?? []).map((item) => (
									<SelectItem key={item.number} value={String(item.number)}>
										Aula {item.number} — {formatLongDate(item.date)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="placar-jogo">Jogo</Label>
						<Select
							value={game ?? ALL_GAMES}
							onValueChange={(next) =>
								setGame(next === ALL_GAMES ? null : next)
							}
						>
							<SelectTrigger
								id="placar-jogo"
								className="w-64"
								aria-label="Filtrar por jogo"
							>
								<SelectValue placeholder="Todos os jogos" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_GAMES}>Todos os jogos</SelectItem>
								{(games.data?.games ?? []).map((item) => (
									<SelectItem key={item.id} value={item.id}>
										{item.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>

			{lessons.error && (
				<ErrorNotice error={lessons.error} onRetry={lessons.reload} />
			)}
			{games.error && (
				<ErrorNotice error={games.error} onRetry={games.reload} />
			)}

			{approved.loading && (
				<div className="space-y-2">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-12 rounded-lg" />
					))}
				</div>
			)}
			{approved.error && (
				<ErrorNotice error={approved.error} onRetry={approved.reload} />
			)}
			{approved.data && approved.data.length === 0 && (
				<Empty>Nenhuma pontuação no placar com esse filtro.</Empty>
			)}
			{approved.data && approved.data.length > 0 && (
				<Card>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Aluno</TableHead>
									<TableHead>Jogo</TableHead>
									<TableHead>Pontos</TableHead>
									<TableHead>Como</TableHead>
									<TableHead>Horário</TableHead>
									<TableHead className="text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{approved.data.map((score) => (
									<TableRow key={score.id}>
										<TableCell>
											<span className="flex items-center gap-3">
												<NameAvatar
													id={score.student.id}
													name={score.student.name}
													className="size-8 text-base"
												/>
												<span className="font-medium">
													{score.student.name}
												</span>
											</span>
										</TableCell>
										<TableCell>
											{score.game.title}
											<span className="ml-2 text-muted-foreground">
												(Aula {score.lessonNumber})
											</span>
										</TableCell>
										<TableCell className="font-semibold tabular-nums">
											{score.score}
										</TableCell>
										<TableCell>
											{/* The method is worth a column of its own: a
											    pontuação the game counted and one a kid typed
											    in are the same number and not the same
											    evidence, and the teacher is the one who
											    decides whether the difference matters. */}
											<Badge variant="secondary">
												{score.method === "auto"
													? "Do jogo"
													: "Anotada pelo aluno"}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDateTime(score.createdAt)}
										</TableCell>
										<TableCell>
											<div className="flex justify-end">
												<Button
													variant="outline"
													size="sm"
													disabled={action.busy}
													onClick={() => setRemoving(score)}
												>
													<Trash2 />
													Remover
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			<AlertDialog
				open={rejecting !== null}
				onOpenChange={(open) => {
					if (!open) setRejecting(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Recusar esta pontuação?</AlertDialogTitle>
						<AlertDialogDescription>
							{rejecting?.student.name} anotou{" "}
							{rejecting ? pontos(rejecting.score) : null} em{" "}
							{rejecting?.game.title}. A pontuação é apagada e não vai para o
							placar.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={() => void confirmReject()}>
							Recusar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remover do placar?</AlertDialogTitle>
						<AlertDialogDescription>
							{removing?.student.name} sai do placar de {removing?.game.title}{" "}
							com {removing ? pontos(removing.score) : null}. Não dá para
							desfazer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={() => void confirmRemove()}>
							Remover
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
