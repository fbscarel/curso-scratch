import { FileText, Puzzle } from "lucide-react";
import { Empty, ErrorNotice } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listSheets } from "@/lib/api";
import type { LessonSheets } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

/**
 * Sheets is the folhas of the aulas that have already happened.
 *
 * The list is the server's: an aula whose PDFs are not in the repo is simply not
 * here, and no aula after the current one is either. The buttons are links that
 * open in a new tab, so a kid can read the ficha while the Scratch editor stays
 * open behind it -- which is what the two are for.
 */
export function Sheets() {
	const sheets = useAsync<LessonSheets[]>(
		(signal) => listSheets(signal),
		"sheets",
	);

	return (
		<div className="space-y-8">
			<div className="animate-in duration-300 fade-in">
				<h1 className="font-extrabold text-5xl tracking-tight">Folhas</h1>
				<p className="mt-2 text-2xl text-muted-foreground">
					As folhas das aulas.
				</p>
			</div>

			{sheets.loading && (
				<div className="grid gap-4 sm:grid-cols-2">
					{[0, 1].map((n) => (
						<Skeleton key={n} className="h-40 rounded-3xl" />
					))}
				</div>
			)}

			{sheets.error && (
				<ErrorNotice error={sheets.error} onRetry={sheets.reload} />
			)}

			{sheets.data && sheets.data.length === 0 && (
				<Empty>
					Nenhuma folha disponível ainda. As folhas aparecem aqui quando a aula
					começa.
				</Empty>
			)}

			{sheets.data && sheets.data.length > 0 && (
				<div className="grid gap-4 sm:grid-cols-2">
					{sheets.data.map((lesson) => (
						<Card
							key={lesson.lessonNumber}
							className="animate-in rounded-3xl border-2 border-border duration-300 fade-in slide-in-from-bottom-2"
						>
							<CardHeader>
								<CardTitle className="font-extrabold text-3xl">
									Aula {lesson.lessonNumber}
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-wrap gap-3">
								{lesson.sheets.map((sheet) => (
									<Button
										key={sheet.kind}
										asChild
										size="lg"
										className="h-16 min-w-40 flex-1 rounded-2xl font-extrabold text-2xl"
									>
										<a
											href={sheet.url}
											target="_blank"
											rel="noopener noreferrer"
										>
											{sheet.kind === "ficha" ? (
												<FileText className="size-7" />
											) : (
												<Puzzle className="size-7" />
											)}
											{sheet.title}
										</a>
									</Button>
								))}
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
