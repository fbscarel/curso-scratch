import { ClipboardCheck, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AdminShell";
import { Empty, ErrorNotice } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttendance, listLessons, putAttendance } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import type { Attendance as AttendanceSheet, Lesson } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/**
 * Attendance is the roll call.
 *
 * The lesson picker opens on the aula the lab is in, because that is the one
 * being taught; picking another is how a teacher fills in a class they forgot to
 * record. The sheet is a component keyed by lesson number, so switching lessons
 * remounts it and the checkboxes can never show one lesson's marks over
 * another's names.
 */
export function Attendance({
	currentNumber,
}: {
	currentNumber: number | null;
}) {
	const lessons = useAsync<Lesson[]>(
		(signal) => listLessons(signal),
		"lessons",
	);
	const [selected, setSelected] = useState<number | null>(null);

	useEffect(() => {
		if (selected !== null || !lessons.data || lessons.data.length === 0) return;
		const registered =
			currentNumber !== null &&
			lessons.data.some((lesson) => lesson.number === currentNumber);
		setSelected(
			registered ? currentNumber : (lessons.data.at(-1)?.number ?? null),
		);
	}, [lessons.data, selected, currentNumber]);

	return (
		<div>
			<PageTitle
				title="Presença"
				description="Marque quem veio à aula. Só o professor marca."
			/>

			{lessons.loading && <Skeleton className="h-24 rounded-xl" />}
			{lessons.error && (
				<ErrorNotice error={lessons.error} onRetry={lessons.reload} />
			)}
			{lessons.data && lessons.data.length === 0 && (
				<Empty>
					Nenhuma aula cadastrada ainda. Cadastre as aulas para poder marcar a
					presença.
				</Empty>
			)}

			{lessons.data && lessons.data.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ClipboardCheck className="size-5" />
							Lista de presença
						</CardTitle>
						<CardDescription>
							Escolha a aula e marque os presentes.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<Select
							value={selected === null ? "" : String(selected)}
							onValueChange={(next) => setSelected(Number(next))}
						>
							<SelectTrigger
								className="w-full max-w-sm"
								aria-label="Escolha a aula"
							>
								<SelectValue placeholder="Escolha a aula" />
							</SelectTrigger>
							<SelectContent>
								{lessons.data.map((lesson) => (
									<SelectItem key={lesson.number} value={String(lesson.number)}>
										Aula {lesson.number} — {formatLongDate(lesson.date)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{selected !== null && (
							<Sheet key={selected} lessonNumber={selected} />
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

/**
 * Sheet is one lesson's roll, with its own request and its own unsaved marks.
 *
 * `key`ed by lesson number by the caller: mounting it is what loads a lesson,
 * and unmounting it is what throws away marks that were never saved -- which is
 * the only sane thing to do with a checkbox somebody ticked for the wrong class.
 */
function Sheet({ lessonNumber }: { lessonNumber: number }) {
	const sheet = useAsync<AttendanceSheet>(
		(signal) => getAttendance(lessonNumber, signal),
		`attendance-${lessonNumber}`,
	);
	const action = useAction();
	const [present, setPresent] = useState<number[]>([]);

	useEffect(() => {
		setPresent(
			sheet.data
				? sheet.data.students.filter((s) => s.present).map((s) => s.id)
				: [],
		);
	}, [sheet.data]);

	async function save() {
		await action.run(async () => {
			await putAttendance(lessonNumber, present);
			toast.success("Presença salva.");
			sheet.reload();
		});
	}

	if (sheet.loading) {
		return (
			<div className="space-y-2">
				{[0, 1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-12 rounded-lg" />
				))}
			</div>
		);
	}

	if (sheet.error) {
		return <ErrorNotice error={sheet.error} onRetry={sheet.reload} />;
	}

	if (!sheet.data) return null;

	return (
		<div className="space-y-4">
			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			{sheet.data.students.length === 0 ? (
				<Empty>
					Nenhum aluno cadastrado ainda. Cadastre a turma em Alunos.
				</Empty>
			) : (
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{sheet.data.students.map((student) => {
						const checked = present.includes(student.id);
						const id = `presenca-${lessonNumber}-${student.id}`;
						return (
							<Label
								key={student.id}
								htmlFor={id}
								className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border px-4 py-3 font-normal text-base has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary"
							>
								<Checkbox
									id={id}
									checked={checked}
									onCheckedChange={(next) => {
										action.reset();
										setPresent((current) =>
											next === true
												? [...current, student.id]
												: current.filter((value) => value !== student.id),
										);
									}}
								/>
								{student.name}
							</Label>
						);
					})}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-4">
				<Button
					disabled={action.busy || sheet.data.students.length === 0}
					onClick={() => void save()}
				>
					<Save />
					Salvar
				</Button>
				<span className="text-muted-foreground text-sm">
					{present.length} de {sheet.data.students.length} presentes
				</span>
			</div>
		</div>
	);
}
