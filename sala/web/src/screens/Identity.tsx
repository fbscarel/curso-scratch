import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Empty, ErrorNotice, NameAvatar } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listStudents, putIdentity } from "@/lib/api";
import { navigate, safeNext } from "@/lib/router";
import type { Student } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/**
 * Identity is how a kid says who they are.
 *
 * There is no password and no account: a kid picks their own name from a list
 * the teacher wrote, and the session remembers it. That is the whole mechanism,
 * which is why the cards are the largest thing on the page and the list is
 * fetched fresh every time -- a name added mid-class appears without a reload.
 */
export function Identity() {
	const students = useAsync<Student[]>(
		(signal) => listStudents(signal),
		"students",
	);
	const action = useAction();
	const [chosen, setChosen] = useState<number | null>(null);

	async function choose(student: Student) {
		setChosen(student.id);
		await action.run(async () => {
			await putIdentity(student.id);
			// `next` is read from the URL and therefore written by anybody: it
			// only survives sanitising as a same-origin relative path.
			const query = new URLSearchParams(window.location.search);
			navigate(safeNext(query.get("next")));
		});
		setChosen(null);
	}

	return (
		<div className="space-y-6">
			<div className="animate-in duration-300 fade-in">
				<h1 className="font-extrabold text-5xl tracking-tight">Quem é você?</h1>
				<p className="mt-2 text-2xl text-muted-foreground">
					Toque no seu nome para começar.
				</p>
			</div>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			{students.loading && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2, 3, 4, 5].map((n) => (
						<Skeleton key={n} className="h-24 rounded-3xl" />
					))}
				</div>
			)}

			{students.error && (
				<ErrorNotice error={students.error} onRetry={students.reload} />
			)}

			{students.data && students.data.length === 0 && (
				<Empty>
					Nenhum aluno cadastrado ainda. Peça para o professor cadastrar a
					turma.
				</Empty>
			)}

			{students.data && students.data.length > 0 && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{students.data.map((student, index) => (
						<Button
							key={student.id}
							type="button"
							variant="outline"
							disabled={chosen !== null}
							onClick={() => void choose(student)}
							style={{ animationDelay: `${index * 40}ms` }}
							className="h-auto min-h-24 animate-in justify-start gap-4 rounded-3xl border-2 px-4 py-3 text-left duration-300 fade-in slide-in-from-bottom-2 hover:border-primary"
						>
							<NameAvatar
								id={student.id}
								name={student.name}
								className="size-16 text-3xl"
							/>
							<span className="font-extrabold text-2xl">{student.name}</span>
							{chosen === student.id && (
								<Loader2 className="ml-auto size-7 animate-spin" />
							)}
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
