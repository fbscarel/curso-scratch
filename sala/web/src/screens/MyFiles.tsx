import {
	Boxes,
	Download,
	File as FileIcon,
	Image as ImageIcon,
	Music,
	Shapes,
} from "lucide-react";
import { Empty, ErrorNotice, Link } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyUploads, uploadDownloadUrl } from "@/lib/api";
import { formatDateTime, formatSize } from "@/lib/format";
import type { Upload } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

/**
 * MyFiles is everything a kid has handed in, under the aula it belongs to.
 *
 * Grouped by aula rather than listed flat, and the newest aula first: a kid
 * looking for last week's maze scrolls down to it, and the aula they are in now
 * is the first thing on the screen. A file the teacher moved to another aula
 * moves here with it, because this list is the server's answer and not a
 * history of what was uploaded when.
 */
export function MyFiles() {
	const uploads = useAsync<Upload[]>(
		(signal) => listMyUploads(signal),
		"my-uploads",
	);

	const groups = groupByLesson(uploads.data ?? []);

	return (
		<div className="space-y-8">
			<div className="animate-in duration-300 fade-in">
				<h1 className="font-extrabold text-5xl tracking-tight">
					Meus arquivos
				</h1>
				<p className="mt-2 text-2xl text-muted-foreground">
					Tudo o que você já entregou.
				</p>
			</div>

			{uploads.loading && (
				<div className="space-y-3">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-24 rounded-3xl" />
					))}
				</div>
			)}

			{uploads.error && (
				<ErrorNotice error={uploads.error} onRetry={uploads.reload} />
			)}

			{uploads.data && uploads.data.length === 0 && (
				<Empty>
					Você ainda não guardou nenhum arquivo. Use{" "}
					<Link to="/entregar" className="font-bold underline">
						Entregar trabalho
					</Link>{" "}
					para mandar o primeiro.
				</Empty>
			)}

			{groups.map((group) => (
				<section key={group.lessonNumber} className="space-y-3">
					<h2 className="font-extrabold text-3xl">Aula {group.lessonNumber}</h2>
					<ul className="space-y-3">
						{group.uploads.map((upload) => (
							<li
								key={upload.id}
								className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-border bg-card p-4 shadow-sm"
							>
								<FileBadge name={upload.name} />
								<div className="min-w-0 flex-1">
									<p className="truncate font-bold text-xl">{upload.name}</p>
									<p className="text-lg text-muted-foreground">
										{formatSize(upload.size)} ·{" "}
										{formatDateTime(upload.createdAt)}
									</p>
								</div>
								<Button
									asChild
									variant="outline"
									className="h-14 rounded-2xl px-5 font-bold text-lg"
								>
									{/* A real link and not a fetch: the browser's own download
									    machinery keeps the progress bar and the file name the
									    server put in Content-Disposition. */}
									<a href={uploadDownloadUrl(upload.id)} download>
										<Download className="size-6" />
										Baixar
									</a>
								</Button>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

/**
 * groupByLesson turns the flat newest-first list into one group per aula,
 * newest aula first.
 *
 * The lesson's number orders the groups and not the upload date: a file moved
 * into an older aula belongs under that aula even though it was uploaded after
 * everything else.
 */
function groupByLesson(
	uploads: Upload[],
): { lessonNumber: number; uploads: Upload[] }[] {
	const groups = new Map<number, Upload[]>();
	for (const upload of uploads) {
		const group = groups.get(upload.lessonNumber);
		if (group) group.push(upload);
		else groups.set(upload.lessonNumber, [upload]);
	}
	return [...groups]
		.map(([lessonNumber, group]) => ({ lessonNumber, uploads: group }))
		.sort((a, b) => b.lessonNumber - a.lessonNumber);
}

/**
 * FileBadge is the icon that says what kind of file this is.
 *
 * A kid recognises a picture or a song by its icon before reading the name, and
 * the colours are the Scratch block colours the rest of the kid screens use.
 */
function FileBadge({ name }: { name: string }) {
	const dot = name.lastIndexOf(".");
	const extension = (dot < 0 ? "" : name.slice(dot + 1)).toLowerCase();
	const chip = "grid size-14 shrink-0 place-items-center rounded-2xl";

	if (extension === "sb3") {
		return (
			<span className={`${chip} bg-scratch-motion`}>
				<Boxes aria-hidden="true" className="size-8" />
			</span>
		);
	}
	if (extension === "sprite3") {
		return (
			<span className={`${chip} bg-scratch-looks`}>
				<Shapes aria-hidden="true" className="size-8" />
			</span>
		);
	}
	if (["png", "jpg", "jpeg"].includes(extension)) {
		return (
			<span className={`${chip} bg-scratch-operators`}>
				<ImageIcon aria-hidden="true" className="size-8" />
			</span>
		);
	}
	if (["wav", "mp3"].includes(extension)) {
		return (
			<span className={`${chip} bg-scratch-sound`}>
				<Music aria-hidden="true" className="size-8" />
			</span>
		);
	}
	return (
		<span className={`${chip} bg-muted`}>
			<FileIcon aria-hidden="true" className="size-8" />
		</span>
	);
}
