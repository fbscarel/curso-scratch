import { Pencil, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { type FormEvent, useState } from "react";
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
	createStudent,
	deleteStudent,
	listAdminStudents,
	updateStudent,
} from "@/lib/api";
import type { AdminStudent } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/**
 * Students is the class list: the teacher writes the names, and the kids pick
 * theirs on the public screen.
 *
 * A student is never really deleted -- attendance and entregas reference them --
 * so the ordinary way to remove somebody from the list is to deactivate them,
 * which takes their name off the public screen and keeps the record. Deleting is
 * offered for the mistake (a name typed twice), and the server refuses it with
 * 409 once anything references the row; that refusal is turned into the same
 * advice rather than into an error the teacher cannot act on.
 */
export function Students() {
	const students = useAsync<AdminStudent[]>(
		(signal) => listAdminStudents(signal),
		"admin-students",
	);
	const action = useAction();
	const [name, setName] = useState("");
	const [editing, setEditing] = useState<AdminStudent | null>(null);
	const [renamed, setRenamed] = useState("");
	const [removing, setRemoving] = useState<AdminStudent | null>(null);

	async function add(e: FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (trimmed === "") return;
		await action.run(async () => {
			await createStudent(trimmed);
			setName("");
			toast.success(`${trimmed} entrou na turma.`);
			students.reload();
		});
	}

	async function saveRename() {
		const target = editing;
		const trimmed = renamed.trim();
		if (target === null || trimmed === "") return;
		await action.run(async () => {
			await updateStudent(target.id, { name: trimmed });
			setEditing(null);
			toast.success("Nome atualizado.");
			students.reload();
		});
	}

	async function setActive(student: AdminStudent, active: boolean) {
		await action.run(async () => {
			await updateStudent(student.id, { active });
			toast.success(active ? "Aluno reativado." : "Aluno desativado.");
			students.reload();
		});
	}

	async function confirmRemove() {
		const target = removing;
		setRemoving(null);
		if (target === null) return;
		await action.run(async () => {
			try {
				await deleteStudent(target.id);
			} catch (e) {
				if (e instanceof ApiError && e.status === 409) {
					toast.error(e.message, {
						description:
							"Use Desativar: o aluno sai da lista sem perder a presença e os trabalhos.",
					});
					return;
				}
				throw e;
			}
			toast.success("Aluno excluído.");
			students.reload();
		});
	}

	return (
		<div>
			<PageTitle
				title="Alunos"
				description="Os nomes que aparecem em “Quem é você?”."
			/>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Adicionar aluno</CardTitle>
					<CardDescription>
						O nome aparece para a turma assim que for salvo.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-wrap items-end gap-3" onSubmit={add}>
						<div className="min-w-64 flex-1 space-y-2">
							<Label htmlFor="novo-aluno">Nome</Label>
							<Input
								id="novo-aluno"
								value={name}
								placeholder="Ana Teste"
								onChange={(e) => {
									setName(e.target.value);
									action.reset();
								}}
							/>
						</div>
						<Button type="submit" disabled={action.busy || name.trim() === ""}>
							<Plus />
							Adicionar
						</Button>
					</form>
				</CardContent>
			</Card>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			{students.loading && (
				<div className="space-y-2">
					{[0, 1, 2, 3].map((n) => (
						<Skeleton key={n} className="h-12 rounded-lg" />
					))}
				</div>
			)}

			{students.error && (
				<ErrorNotice error={students.error} onRetry={students.reload} />
			)}

			{students.data && students.data.length === 0 && (
				<Empty>Nenhum aluno cadastrado ainda. Adicione o primeiro acima.</Empty>
			)}

			{students.data && students.data.length > 0 && (
				<Card>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Nome</TableHead>
									<TableHead>Situação</TableHead>
									<TableHead className="text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{students.data.map((student) => (
									<TableRow key={student.id}>
										<TableCell>
											<span className="flex items-center gap-3">
												<NameAvatar
													id={student.id}
													name={student.name}
													className="size-8 text-base"
												/>
												<span className="font-medium">{student.name}</span>
											</span>
										</TableCell>
										<TableCell>
											{student.active ? (
												<Badge variant="secondary">Ativo</Badge>
											) : (
												<Badge variant="outline">Inativo</Badge>
											)}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													disabled={action.busy}
													onClick={() => {
														setEditing(student);
														setRenamed(student.name);
													}}
												>
													<Pencil />
													Renomear
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={action.busy}
													onClick={() =>
														void setActive(student, !student.active)
													}
												>
													{student.active ? <UserX /> : <UserCheck />}
													{student.active ? "Desativar" : "Reativar"}
												</Button>
												<Button
													variant="destructive"
													size="sm"
													disabled={action.busy}
													onClick={() => setRemoving(student)}
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
						<DialogTitle>Renomear aluno</DialogTitle>
						<DialogDescription>
							O novo nome aparece na hora para a turma.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="renomear">Nome</Label>
						<Input
							id="renomear"
							value={renamed}
							onChange={(e) => {
								setRenamed(e.target.value);
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
							disabled={action.busy || renamed.trim() === ""}
							onClick={() => void saveRename()}
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
							Excluir {removing?.name ?? "este aluno"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Isto apaga o aluno de vez. Se ele só saiu da turma, use Desativar:
							o nome sai da lista e o histórico fica.
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
