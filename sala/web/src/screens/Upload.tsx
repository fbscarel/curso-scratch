import {
	CheckCircle2,
	FileUp,
	Loader2,
	TriangleAlert,
	UploadCloud,
} from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { Link } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { type UploadProgress, uploadFile } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";

/** What the file picker offers, and what the chips below the drop zone say. */
const ACCEPT = ".sb3,.sprite3,.png,.jpg,.jpeg,.wav,.mp3";

/**
 * The accepted types, grouped the way a kid thinks about them.
 *
 * The chips spell out every extension the API takes rather than naming the
 * groups alone: a kid who saved a picture as `.jpeg` has to be able to find
 * `.jpeg` written somewhere on this screen, and the server's refusal lists them
 * only after the fact.
 */
const ALLOWED_CHIPS = [
	"Projeto (.sb3)",
	"Sprite (.sprite3)",
	"Imagem (.png, .jpg, .jpeg)",
	"Som (.wav, .mp3)",
];

interface UploadItem {
	key: number;
	file: File;
	status: "waiting" | "uploading" | "done" | "error";
	/** 0 to 1, or 0 while the browser cannot say how big the request is. */
	progress: number;
	lessonNumber: number | null;
	message: string | null;
}

/**
 * Upload is the screen a kid hands work in on.
 *
 * One file per request and the files go one after another, never together: the
 * classroom Wi-Fi is one shared pipe, and eight simultaneous 15 MB uploads from
 * one PC would make every other PC's screen look broken. The queue is pumped by
 * an effect that starts the first waiting item whenever nothing is in flight, so
 * a file that fails does not stop the ones behind it -- the kid sees which one
 * failed and keeps the rest.
 *
 * Every upload is filed under the AULA ATUAL by the server; nothing on this
 * screen picks a lesson, and the success card says which one it landed in.
 */
export function Upload() {
	const [items, setItems] = useState<UploadItem[]>([]);
	const [dragging, setDragging] = useState(false);
	const inFlight = useRef(false);
	const nextKey = useRef(0);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// The ref, not the state, is what stops a second upload from starting:
		// StrictMode runs a mount effect twice, and the second run would see the
		// same `waiting` snapshot the first one did.
		if (inFlight.current) return;
		const next = items.find((item) => item.status === "waiting");
		if (!next) return;
		inFlight.current = true;
		setItems((prev) =>
			prev.map((item) =>
				item.key === next.key ? { ...item, status: "uploading" } : item,
			),
		);

		uploadFile(next.file, (progress: UploadProgress) => {
			setItems((prev) =>
				prev.map((item) =>
					item.key === next.key
						? {
								...item,
								progress:
									progress.total > 0 ? progress.loaded / progress.total : 0,
							}
						: item,
				),
			);
		})
			.then((upload) => {
				inFlight.current = false;
				setItems((prev) =>
					prev.map((item) =>
						item.key === next.key
							? {
									...item,
									status: "done",
									progress: 1,
									lessonNumber: upload.lessonNumber,
								}
							: item,
					),
				);
				celebrate();
			})
			.catch((error: unknown) => {
				inFlight.current = false;
				setItems((prev) =>
					prev.map((item) =>
						item.key === next.key
							? { ...item, status: "error", message: messageOf(error) }
							: item,
					),
				);
			});
	}, [items]);

	function addFiles(files: FileList | File[]): void {
		const chosen = Array.from(files);
		if (chosen.length === 0) return;
		const added = chosen.map(
			(file): UploadItem => ({
				key: nextKey.current++,
				file,
				status: "waiting",
				progress: 0,
				lessonNumber: null,
				message: null,
			}),
		);
		setItems((prev) => [...prev, ...added]);
	}

	function onDrop(event: DragEvent<HTMLFieldSetElement>): void {
		event.preventDefault();
		setDragging(false);
		addFiles(event.dataTransfer.files);
	}

	return (
		<div className="space-y-8">
			<div className="animate-in duration-300 fade-in">
				<h1 className="font-extrabold text-5xl tracking-tight">
					Entregar trabalho
				</h1>
				<p className="mt-2 text-2xl text-muted-foreground">
					Mande o seu arquivo para o professor.
				</p>
			</div>

			<fieldset
				// A fieldset and not a bare div: the drop zone is a group of
				// controls -- the picker, the button, the list of what may be
				// sent -- and a group that takes a drag has to be one the DOM
				// already knows about for the keyboard to reach what is inside.
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
				className={cn(
					"flex flex-col items-center gap-5 rounded-3xl border-4 border-dashed bg-card p-8 text-center transition-colors",
					dragging ? "border-primary bg-accent" : "border-border",
				)}
			>
				<legend className="sr-only">Enviar arquivos</legend>
				<UploadCloud
					aria-hidden="true"
					className="size-20 text-primary"
					strokeWidth={1.5}
				/>
				<p className="font-extrabold text-3xl">Arraste os arquivos para cá</p>

				<Button
					type="button"
					size="lg"
					className="h-16 rounded-2xl px-8 font-extrabold text-2xl"
					onClick={() => input.current?.click()}
				>
					<FileUp className="size-8" />
					Escolher arquivo
				</Button>
				<input
					ref={input}
					type="file"
					multiple
					accept={ACCEPT}
					aria-label="Escolher arquivo"
					className="sr-only"
					onChange={(event) => {
						addFiles(event.target.files ?? []);
						// Cleared so that picking the SAME file twice in a row is
						// two uploads: an input whose value did not change fires
						// no change event.
						event.target.value = "";
					}}
				/>

				<div className="flex flex-wrap items-center justify-center gap-2">
					<span className="text-lg text-muted-foreground">Pode enviar:</span>
					{ALLOWED_CHIPS.map((chip) => (
						<span
							key={chip}
							className="rounded-full border-2 border-border bg-muted px-4 py-1 font-bold text-lg"
						>
							{chip}
						</span>
					))}
				</div>

				<p className="text-lg text-muted-foreground">
					No TurboWarp: <strong className="font-extrabold">Arquivo</strong> →{" "}
					<strong className="font-extrabold">Salvar como...</strong>
				</p>
			</fieldset>

			{items.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-extrabold text-3xl">Seus arquivos</h2>
					{items.map((item) => (
						<ItemCard key={item.key} item={item} />
					))}
					<Button
						asChild
						variant="outline"
						className="h-14 rounded-2xl px-6 text-lg"
					>
						<Link to="/meus-arquivos">Ver meus arquivos</Link>
					</Button>
				</section>
			)}
		</div>
	);
}

/** ItemCard is one chosen file and where it got to. */
function ItemCard({ item }: { item: UploadItem }) {
	if (item.status === "done") {
		return (
			<div className="animate-in flex items-center gap-4 rounded-3xl border-2 border-scratch-operators bg-card p-5 shadow-sm duration-300 fade-in slide-in-from-bottom-2">
				<CheckCircle2
					aria-hidden="true"
					className="size-12 shrink-0 text-scratch-operators"
				/>
				<div className="min-w-0 flex-1">
					<p className="font-extrabold text-2xl">
						Guardado na Aula {item.lessonNumber}!
					</p>
					<p className="truncate text-lg text-muted-foreground">
						{item.file.name}
					</p>
				</div>
			</div>
		);
	}

	if (item.status === "error") {
		return (
			<div className="flex items-center gap-4 rounded-3xl border-2 border-destructive/40 bg-destructive/5 p-5">
				<TriangleAlert
					aria-hidden="true"
					className="size-12 shrink-0 text-destructive"
				/>
				<div className="min-w-0 flex-1">
					<p className="truncate font-extrabold text-xl">{item.file.name}</p>
					<p role="alert" className="text-lg text-destructive">
						{item.message}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-4 rounded-3xl border-2 border-border bg-card p-5">
			{item.status === "uploading" ? (
				<Loader2
					aria-hidden="true"
					className="size-12 shrink-0 animate-spin text-primary"
				/>
			) : (
				<UploadCloud
					aria-hidden="true"
					className="size-12 shrink-0 text-muted-foreground"
				/>
			)}
			<div className="min-w-0 flex-1 space-y-2">
				<p className="truncate font-bold text-xl">{item.file.name}</p>
				{item.status === "uploading" ? (
					<div
						role="progressbar"
						aria-label={`Enviando ${item.file.name}`}
						aria-valuenow={Math.round(item.progress * 100)}
						aria-valuemin={0}
						aria-valuemax={100}
						className="h-4 overflow-hidden rounded-full bg-muted"
					>
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{ width: `${Math.round(item.progress * 100)}%` }}
						/>
					</div>
				) : (
					<p className="text-lg text-muted-foreground">Na fila...</p>
				)}
			</div>
		</div>
	);
}

/**
 * messageOf is the sentence a failed file shows.
 *
 * The API writes its refusals in pt-BR for exactly this purpose, so the message
 * is shown as it came. Anything that is not an Error at all -- a thrown string,
 * a promise rejected by a browser API -- has no message to show and gets the
 * sentence the client would have written itself.
 */
function messageOf(error: unknown): string {
	if (error instanceof Error && error.message !== "") return error.message;
	return "Não foi possível enviar este arquivo. Tente de novo.";
}
