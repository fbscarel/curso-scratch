import { Download, FileArchive, FolderInput } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AdminShell";
import { Empty, ErrorNotice, NameAvatar } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
	adminLessonZipUrl,
	adminUploadDownloadUrl,
	listAdminStudents,
	listAdminUploads,
	listLessons,
	moveUpload,
} from "@/lib/api";
import { formatDateTime, formatLongDate, formatSize } from "@/lib/format";
import type { AdminStudent, AdminUpload, Lesson } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/** The sentinels the two filters use; a lesson number and a student id are numbers. */
const ALL_STUDENTS = "all";

/**
 * Uploads is the teacher's pile of entregas.
 *
 * It opens on the aula the lab is in -- the one the teacher is collecting for --
 * and every filter is a server query rather than a filter of a loaded list, so
 * "quem entregou" for aula 7 in a course of thirty aulas is one request and not
 * the whole archive.
 *
 * "Mover para aula…" exists because the common mistake is a file handed in a day
 * late: it is filed under today's aula, and the teacher moves it back where it
 * belongs. The server moves the file on disk with the row, so this is the one
 * action that changes where the work actually lives.
 */
export function Uploads({ currentNumber }: { currentNumber: number | null }) {
	const lessons = useAsync<Lesson[]>(
		(signal) => listLessons(signal),
		"lessons",
	);
	const students = useAsync<AdminStudent[]>(
		(signal) => listAdminStudents(signal),
		"admin-students",
	);
	const action = useAction();
	const [lesson, setLesson] = useState<number | null>(null);
	const [student, setStudent] = useState<number | null>(null);
	const [moving, setMoving] = useState<AdminUpload | null>(null);
	const [target, setTarget] = useState<number | null>(null);

	useEffect(() => {
		if (lesson !== null || !lessons.data || lessons.data.length === 0) return;
		const registered =
			currentNumber !== null &&
			lessons.data.some((item) => item.number === currentNumber);
		setLesson(
			registered ? currentNumber : (lessons.data.at(-1)?.number ?? null),
		);
	}, [lessons.data, lesson, currentNumber]);

	const uploads = useAsync<AdminUpload[]>(
		(signal) =>
			listAdminUploads(
				{
					...(lesson !== null ? { lesson } : {}),
					...(student !== null ? { student } : {}),
				},
				signal,
			),
		`uploads-${lesson ?? "-"}-${student ?? "-"}`,
	);

	async function confirmMove() {
		const item = moving;
		const to = target;
		setMoving(null);
		if (item === null || to === null) return;
		await action.run(async () => {
			await moveUpload(item.id, to);
			toast.success(`${item.name} foi para a Aula ${to}.`);
			uploads.reload();
		});
	}

	return (
		<div>
			<PageTitle
				title="Entregas"
				description="Os trabalhos que a turma mandou."
				actions={
					lesson !== null && (
						<Button asChild variant="outline">
							{/* A real link: the zip is streamed by the server and the
							    browser's own download machinery writes it to disk. */}
							<a href={adminLessonZipUrl(lesson)} download>
								<FileArchive />
								Baixar tudo (.zip)
							</a>
						</Button>
					)
				}
			/>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Filtrar</CardTitle>
					<CardDescription>
						Escolha a aula e, se quiser, um aluno.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-end gap-4">
					<div className="space-y-2">
						<Label htmlFor="filtro-aula">Aula</Label>
						{lessons.data && lessons.data.length > 0 ? (
							<Select
								value={lesson === null ? "" : String(lesson)}
								onValueChange={(next) => setLesson(Number(next))}
							>
								<SelectTrigger
									id="filtro-aula"
									className="w-64"
									aria-label="Filtrar por aula"
								>
									<SelectValue placeholder="Escolha a aula" />
								</SelectTrigger>
								<SelectContent>
									{lessons.data.map((item) => (
										<SelectItem key={item.number} value={String(item.number)}>
											Aula {item.number} — {formatLongDate(item.date)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<p className="text-muted-foreground text-sm">
								Nenhuma aula cadastrada ainda.
							</p>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="filtro-aluno">Aluno</Label>
						<Select
							value={student === null ? ALL_STUDENTS : String(student)}
							onValueChange={(next) =>
								setStudent(next === ALL_STUDENTS ? null : Number(next))
							}
						>
							<SelectTrigger
								id="filtro-aluno"
								className="w-64"
								aria-label="Filtrar por aluno"
							>
								<SelectValue placeholder="Todos os alunos" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_STUDENTS}>Todos os alunos</SelectItem>
								{(students.data ?? []).map((item) => (
									<SelectItem key={item.id} value={String(item.id)}>
										{item.name}
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
			{students.error && (
				<ErrorNotice error={students.error} onRetry={students.reload} />
			)}

			{uploads.loading && (
				<div className="space-y-2">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-12 rounded-lg" />
					))}
				</div>
			)}

			{uploads.error && (
				<ErrorNotice error={uploads.error} onRetry={uploads.reload} />
			)}

			{uploads.data && uploads.data.length === 0 && (
				<Empty>
					Nenhuma entrega aqui ainda. Quando a turma mandar os trabalhos, eles
					aparecem nesta lista.
				</Empty>
			)}

			{uploads.data && uploads.data.length > 0 && (
				<Card>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Aluno</TableHead>
									<TableHead>Arquivo</TableHead>
									<TableHead>Tamanho</TableHead>
									<TableHead>Horário</TableHead>
									<TableHead className="text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{uploads.data.map((item) => (
									<TableRow key={item.id}>
										<TableCell>
											<span className="flex items-center gap-3">
												<NameAvatar
													id={item.student.id}
													name={item.student.name}
													className="size-8 text-base"
												/>
												<span className="font-medium">{item.student.name}</span>
											</span>
										</TableCell>
										<TableCell className="max-w-80 truncate">
											{item.name}
											<span className="ml-2 text-muted-foreground">
												(Aula {item.lessonNumber})
											</span>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatSize(item.size)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDateTime(item.createdAt)}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap justify-end gap-2">
												<Button asChild variant="outline" size="sm">
													<a href={adminUploadDownloadUrl(item.id)} download>
														<Download />
														Baixar
													</a>
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														setMoving(item);
														setTarget(null);
													}}
												>
													<FolderInput />
													Mover para aula…
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

			<Dialog
				open={moving !== null}
				onOpenChange={(open) => {
					if (!open) setMoving(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Mover para aula…</DialogTitle>
						<DialogDescription>
							{moving?.name} está na Aula {moving?.lessonNumber}. Escolha a aula
							certa: o arquivo vai junto com o registro.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="mover-aula">Aula</Label>
						<Select
							value={target === null ? "" : String(target)}
							onValueChange={(next) => setTarget(Number(next))}
						>
							<SelectTrigger
								id="mover-aula"
								className="w-full"
								aria-label="Aula de destino"
							>
								<SelectValue placeholder="Escolha a aula" />
							</SelectTrigger>
							<SelectContent>
								{(lessons.data ?? [])
									.filter((item) => item.number !== moving?.lessonNumber)
									.map((item) => (
										<SelectItem key={item.number} value={String(item.number)}>
											Aula {item.number} — {formatLongDate(item.date)}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
						{action.error && (
							<p role="alert" className="text-destructive text-sm">
								{action.error.message}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setMoving(null)}>
							Cancelar
						</Button>
						<Button
							disabled={action.busy || target === null}
							onClick={() => void confirmMove()}
						>
							Mover
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
