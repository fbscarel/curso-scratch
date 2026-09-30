import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AdminShell";
import { Empty, ErrorNotice } from "@/components/Bits";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	ApiError,
	createLesson,
	deleteLesson,
	listLessons,
	updateLesson,
} from "@/lib/api";
import { formatFullDate, formatLongDate, todayISO } from "@/lib/format";
import type { Lesson } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/**
 * Lessons is the course calendar.
 *
 * A lesson's date is the only thing that decides which aula the lab is in, so
 * this screen is where the course is actually scheduled: register the next few
 * weeks once, and the "Aula atual" badge answers itself from then on.
 *
 * The number defaults to one past the highest registered -- the common case is
 * adding the next class -- and the date defaults to today.
 */
export function Lessons() {
	const lessons = useAsync<Lesson[]>(
		(signal) => listLessons(signal),
		"lessons",
	);
	const action = useAction();
	const [number, setNumber] = useState("");
	const [date, setDate] = useState(() => todayISO());
	// Until the teacher types in the number field it follows the data, so the
	// suggested "next lesson" is right after a reload as well as on first paint.
	const [numberTouched, setNumberTouched] = useState(false);
	const [editing, setEditing] = useState<Lesson | null>(null);
	const [editedDate, setEditedDate] = useState("");
	const [removing, setRemoving] = useState<Lesson | null>(null);

	useEffect(() => {
		if (numberTouched || !lessons.data) return;
		const highest = lessons.data.reduce(
			(max, lesson) => Math.max(max, lesson.number),
			0,
		);
		setNumber(String(highest + 1));
	}, [lessons.data, numberTouched]);

	async function add(e: FormEvent) {
		e.preventDefault();
		const parsed = Number(number);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			toast.error(
				"O número da aula precisa ser um número inteiro maior que zero.",
			);
			return;
		}
		await action.run(async () => {
			await createLesson({ number: parsed, date });
			setNumberTouched(false);
			toast.success(`Aula ${parsed} criada.`);
			lessons.reload();
		});
	}

	async function saveDate() {
		const target = editing;
		if (target === null) return;
		await action.run(async () => {
			await updateLesson(target.number, editedDate);
			setEditing(null);
			toast.success("Data atualizada.");
			lessons.reload();
		});
	}

	async function confirmRemove() {
		const target = removing;
		setRemoving(null);
		if (target === null) return;
		await action.run(async () => {
			try {
				await deleteLesson(target.number);
			} catch (e) {
				if (e instanceof ApiError && e.status === 409) {
					toast.error(e.message, {
						description:
							"Esta aula já tem presença ou trabalhos. Mude a data em vez de excluir.",
					});
					return;
				}
				throw e;
			}
			toast.success(`Aula ${target.number} excluída.`);
			lessons.reload();
		});
	}

	return (
		<div>
			<PageTitle
				title="Aulas"
				description="O calendário do curso. A aula atual sai daqui."
			/>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Adicionar aula</CardTitle>
					<CardDescription>
						O número já vem com a próxima aula; a data, com hoje.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-wrap items-end gap-3" onSubmit={add}>
						<div className="w-32 space-y-2">
							<Label htmlFor="aula-numero">Número</Label>
							<Input
								id="aula-numero"
								type="number"
								min={1}
								value={number}
								onChange={(e) => {
									setNumber(e.target.value);
									setNumberTouched(true);
									action.reset();
								}}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="aula-data">Data</Label>
							<Input
								id="aula-data"
								type="date"
								value={date}
								onChange={(e) => {
									setDate(e.target.value);
									action.reset();
								}}
							/>
						</div>
						<Button
							type="submit"
							disabled={action.busy || number.trim() === "" || date === ""}
						>
							<CalendarPlus />
							Adicionar
						</Button>
					</form>
				</CardContent>
			</Card>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			{lessons.loading && (
				<div className="space-y-2">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-12 rounded-lg" />
					))}
				</div>
			)}

			{lessons.error && (
				<ErrorNotice error={lessons.error} onRetry={lessons.reload} />
			)}

			{lessons.data && lessons.data.length === 0 && (
				<Empty>
					Nenhuma aula cadastrada ainda. Enquanto não houver aula, o painel diz
					“Nenhuma aula começou ainda”.
				</Empty>
			)}

			{lessons.data && lessons.data.length > 0 && (
				<Card>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Aula</TableHead>
									<TableHead>Data</TableHead>
									<TableHead className="text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{lessons.data.map((lesson) => (
									<TableRow key={lesson.number}>
										<TableCell className="font-medium">
											Aula {lesson.number}
										</TableCell>
										<TableCell>
											{formatFullDate(lesson.date)}
											<span className="ml-2 text-muted-foreground">
												({formatLongDate(lesson.date)})
											</span>
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													disabled={action.busy}
													onClick={() => {
														setEditing(lesson);
														setEditedDate(lesson.date);
													}}
												>
													<Pencil />
													Editar data
												</Button>
												<Button
													variant="destructive"
													size="sm"
													disabled={action.busy}
													onClick={() => setRemoving(lesson)}
												>
													<Trash2 />
													Excluir
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
				open={editing !== null}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Editar a data da aula {editing?.number}</DialogTitle>
						<DialogDescription>
							Mudar a data muda qual aula está valendo hoje.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="editar-data">Data</Label>
						<Input
							id="editar-data"
							type="date"
							value={editedDate}
							onChange={(e) => {
								setEditedDate(e.target.value);
								action.reset();
							}}
						/>
						{action.error && (
							<p role="alert" className="text-destructive text-sm">
								{action.error.message}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditing(null)}>
							Cancelar
						</Button>
						<Button
							disabled={action.busy || editedDate === ""}
							onClick={() => void saveDate()}
						>
							Salvar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={removing !== null}
				onOpenChange={(open) => {
					if (!open) setRemoving(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Excluir a aula {removing?.number}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							A aula só pode ser excluída se ainda não tiver presença nem
							trabalhos.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={() => void confirmRemove()}>
							Excluir
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
