import { Download, FileUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
	deleteStarter,
	getAdminStarter,
	starterFileUrl,
	uploadStarter,
} from "@/lib/api";
import { formatDateTime, formatSize } from "@/lib/format";
import type { AdminStarter } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/**
 * StarterCard is "Projeto da aula": the one .sb3 the whole class opens.
 *
 * A single slot and not one per aula: the teacher picks a project and every lab
 * PC's home screen offers it until it is replaced or removed.
 *
 * The file input is the browser's own, hidden behind the buttons -- the teacher
 * picks a file and the upload starts, with no form to submit and no second
 * click. It is a plain `accept=".sb3"` filter and not a validation: the server
 * reads the file itself and refuses what is not a project.
 */
export function StarterCard() {
	const starter = useAsync<AdminStarter | null>(
		(signal) => getAdminStarter(signal),
		"admin-starter",
	);
	const action = useAction();
	const [removing, setRemoving] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	async function choose(file: File | undefined) {
		if (file === undefined) return;
		await action.run(async () => {
			await uploadStarter(file);
			toast.success(`${file.name} é o projeto da aula.`);
			starter.reload();
		});
	}

	async function confirmRemove() {
		setRemoving(false);
		await action.run(async () => {
			await deleteStarter();
			toast.success("O projeto da aula saiu do ar.");
			starter.reload();
		});
	}

	const current = starter.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Projeto da aula</CardTitle>
				<CardDescription>
					Um projeto do Scratch (.sb3) que a turma abre na tela inicial.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{action.error && (
					<ErrorNotice error={action.error} onRetry={action.reset} />
				)}

				{starter.loading && <Skeleton className="h-12 rounded-lg" />}
				{starter.error && (
					<ErrorNotice error={starter.error} onRetry={starter.reload} />
				)}

				{!starter.loading && !starter.error && current === null && (
					<Empty>
						Nenhum projeto ainda. Enquanto não houver um, a turma não vê o bloco
						"Projeto da aula".
					</Empty>
				)}

				{current && (
					<p className="text-muted-foreground">
						<span className="font-medium text-foreground">{current.name}</span>
						{" — "}
						{formatSize(current.size)}, enviado em{" "}
						{formatDateTime(current.uploadedAt)}
					</p>
				)}

				<div className="flex flex-wrap gap-2">
					<input
						ref={input}
						type="file"
						accept=".sb3"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0];
							// The same file picked twice has to fire again.
							event.target.value = "";
							void choose(file);
						}}
					/>
					<Button
						variant={current ? "outline" : "default"}
						disabled={action.busy || starter.loading}
						onClick={() => input.current?.click()}
					>
						<FileUp />
						{current ? "Trocar" : "Enviar projeto"}
					</Button>
					{current && (
						<>
							{/* A real link with `download`: the browser saves the file
							    even when the server's disposition is `inline`. */}
							<Button asChild variant="outline">
								<a href={starterFileUrl()} download={current.name}>
									<Download />
									Baixar
								</a>
							</Button>
							<Button
								variant="destructive"
								disabled={action.busy}
								onClick={() => setRemoving(true)}
							>
								<Trash2 />
								Remover
							</Button>
						</>
					)}
				</div>
			</CardContent>

			<AlertDialog
				open={removing}
				onOpenChange={(open) => {
					if (!open) setRemoving(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remover o projeto da aula?</AlertDialogTitle>
						<AlertDialogDescription>
							{current?.name} sai da tela da turma e do servidor. Os trabalhos
							que os alunos entregaram não mudam.
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
		</Card>
	);
}
