import { CheckCircle2, Loader2, Medal, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ErrorNotice, Link } from "@/components/Bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getScoreboard, postScore } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { formatDateTime, pontos } from "@/lib/format";
import type { Game, Scoreboard, ScoreRank, Student } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";

/**
 * How often the placar asks again, in milliseconds.
 *
 * Ten seconds is the pace of the room: a kid scores, another kid looks up and
 * sees it before they have finished their turn. Faster would be a request every
 * few seconds from every laptop in the class for a table that changes a handful
 * of times a minute; slower and the board reads as broken.
 */
const REFRESH_MS = 10_000;

/** The highest pontuação the API accepts, so the form refuses it before it is sent. */
const MAX_SCORE = 9_999_999;

/**
 * The medal each of the three first places wears.
 *
 * By RANK and not by row: two kids tied on the same pontuação are both in first
 * place and both wear the gold, and the row under them is third and wears the
 * bronze. Colouring the first three ROWS instead would hand a silver to a kid
 * who is in second place only because of where the sort landed them.
 */
const MEDALS: Record<number, { icon: typeof Trophy; className: string }> = {
	1: { icon: Trophy, className: "text-scratch-variables" },
	2: { icon: Medal, className: "text-muted-foreground" },
	3: { icon: Medal, className: "text-scratch-control" },
};

/**
 * Placar is one game's high-score table.
 *
 * Three answers on one card: who is winning the aula (top ten, one row per
 * aluno), what the best pontuação ever is (the record line), and -- for a game
 * the kid has to score themselves -- the form that files a pontuação and the
 * list of what is still waiting for the teacher.
 *
 * It refreshes on a timer and whenever the kid comes back to the tab, and it
 * refreshes by re-running the SAME query rather than by changing it: a reload
 * keeps the table on screen while the answer is in flight, where a new query
 * would blank the panel for a moment every ten seconds.
 *
 * `refreshKey` is how a screen that knows something changed -- the game just
 * ended, and a pontuação was posted -- asks for that reload without the panel
 * having to know what happened.
 */
export function Placar({
	game,
	student,
	refreshKey,
}: {
	game: Game;
	student: Student | null;
	refreshKey: number;
}) {
	const board = useAsync<Scoreboard>(
		(signal) => getScoreboard(game.id, signal),
		`scoreboard-${game.id}`,
	);

	// Everything that changes what the placar would answer reloads it: the game,
	// the kid who is looking at it (their own row and their pending pontuações
	// are theirs), and a pontuação the screen just posted. The first run is the
	// read useAsync already made, so it is skipped -- refetching on mount would
	// double every visit to a game.
	const asked = useRef(`${game.id}\0${student?.id ?? ""}\0${refreshKey}`);
	useEffect(() => {
		const now = `${game.id}\0${student?.id ?? ""}\0${refreshKey}`;
		if (asked.current === now) return;
		asked.current = now;
		board.reload();
	}, [board.reload, game.id, student?.id, refreshKey]);

	// The timer, and the moment the kid looks again. Both go through the same
	// reload, which is idempotent in what it shows: a poll that lands while the
	// panel is already showing the answer changes nothing on the screen.
	useEffect(() => {
		const timer = setInterval(() => board.reload(), REFRESH_MS);
		const look = () => board.reload();
		const onVisibility = () => {
			if (document.visibilityState === "visible") look();
		};
		window.addEventListener("focus", look);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			clearInterval(timer);
			window.removeEventListener("focus", look);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [board.reload]);

	return (
		<Card className="border-2">
			<CardHeader>
				<CardTitle className="text-xl">Placar</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				{board.loading && !board.data && (
					<div className="space-y-2">
						<Skeleton className="h-8 rounded-xl" />
						<Skeleton className="h-12 rounded-xl" />
						<Skeleton className="h-12 rounded-xl" />
					</div>
				)}

				{board.error && (
					<ErrorNotice error={board.error} onRetry={board.reload} />
				)}

				{board.data && (
					<>
						<RecordLine board={board.data} />
						<TopList top={board.data.top} me={student?.id ?? null} />
						<PendingList pending={board.data.myPending} />
					</>
				)}

				{game.type === "emulated" && (
					<SelfReport
						key={game.id}
						gameId={game.id}
						student={student}
						collapsed={game.autoScore}
						onFiled={board.reload}
					/>
				)}
			</CardContent>
		</Card>
	);
}

/** RecordLine is the best pontuação of all time, in one sentence. */
function RecordLine({ board }: { board: Scoreboard }) {
	const record = board.record;
	if (!record) return null;
	return (
		<p className="flex items-center gap-2 rounded-2xl bg-scratch-variables/15 px-4 py-3 font-bold text-lg">
			<Trophy aria-hidden="true" className="size-6 shrink-0" />
			<span>
				Recorde da turma: {record.score} — {record.student.name} (Aula{" "}
				{record.lessonNumber})
			</span>
		</p>
	);
}

/**
 * TopList is the aula's ten best, and it is the whole panel when nobody has
 * scored yet.
 */
function TopList({ top, me }: { top: ScoreRank[]; me: number | null }) {
	if (top.length === 0) {
		return (
			<p className="rounded-2xl border-2 border-border border-dashed bg-card/60 p-6 text-center font-bold text-lg text-muted-foreground">
				Ninguém pontuou ainda nesta aula — seja o primeiro!
			</p>
		);
	}

	return (
		<ol className="space-y-1.5">
			{top.map((row) => (
				<li
					key={row.student.id}
					className={cn(
						"flex items-center gap-3 rounded-xl px-3 py-2",
						row.student.id === me
							? "bg-primary/15 font-extrabold ring-2 ring-primary"
							: "bg-muted/50",
					)}
				>
					<RankMark rank={row.rank} />
					<span className="min-w-0 flex-1 truncate text-lg">
						{row.student.name}
					</span>
					{row.student.id === me && <Badge variant="secondary">você</Badge>}
					<span className="text-xl tabular-nums">{row.score}</span>
				</li>
			))}
		</ol>
	);
}

/** RankMark is a place in the table: a medal for the podium, the number after it. */
function RankMark({ rank }: { rank: number }) {
	const medal = MEDALS[rank];
	if (!medal) {
		return (
			<span className="w-7 shrink-0 text-center font-bold text-lg text-muted-foreground tabular-nums">
				{rank}
			</span>
		);
	}
	const Icon = medal.icon;
	return (
		<span
			role="img"
			className="grid w-7 shrink-0 place-items-center"
			aria-label={`${rank}º lugar`}
		>
			<Icon aria-hidden="true" className={cn("size-6", medal.className)} />
		</span>
	);
}

/** PendingList is what the kid typed in and the teacher has not answered. */
function PendingList({ pending }: { pending: Scoreboard["myPending"] }) {
	if (pending.length === 0) return null;
	return (
		<div className="space-y-2 rounded-2xl border-2 border-dashed border-border p-4">
			<p className="flex items-center gap-2 font-bold text-lg">
				<Loader2 aria-hidden="true" className="size-5 animate-spin" />
				Esperando o professor
			</p>
			<ul className="space-y-1 text-muted-foreground">
				{pending.map((item) => (
					<li key={item.id} className="flex items-center justify-between gap-3">
						<span>{pontos(item.score)}</span>
						<span className="text-sm">{formatDateTime(item.createdAt)}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * SelfReport is the form a kid types a pontuação into.
 *
 * Only for an emulated game: it has no way of writing the number on the placar
 * itself, so the kid writes it down and the teacher confirms it. Without a name
 * picked there is nobody to file it for, so the form is replaced by the way to
 * pick one, and the way back is this same game.
 *
 * For a game that reads its own score the form is the FALLBACK -- the reading
 * can fail, and the kid has to be able to write the number down anyway -- so it
 * is collapsed behind a button instead of sitting open under the placar.
 */
function SelfReport({
	gameId,
	student,
	collapsed,
	onFiled,
}: {
	gameId: string;
	student: Student | null;
	collapsed: boolean;
	onFiled: () => void;
}) {
	const action = useAction();
	const [value, setValue] = useState("");
	const [filed, setFiled] = useState<number | null>(null);
	const [open, setOpen] = useState(!collapsed);

	if (!open) {
		return (
			<div className="space-y-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => setOpen(true)}
					className="h-12 w-full rounded-2xl font-bold"
				>
					Anotar à mão
				</Button>
				<p className="text-muted-foreground">
					A leitura automática pode falhar; aqui você anota a sua pontuação.
				</p>
			</div>
		);
	}

	if (student === null) {
		return (
			<p className="text-lg text-muted-foreground">
				<Link
					to={`/quem-sou-eu?next=${encodeURIComponent(`/jogos/${gameId}`)}`}
					className="font-bold underline"
				>
					Escolha o seu nome
				</Link>{" "}
				para anotar a sua pontuação.
			</p>
		);
	}

	const score = Number(value);
	const valid =
		value.trim() !== "" &&
		Number.isInteger(score) &&
		score >= 0 &&
		score <= MAX_SCORE;

	async function submit(): Promise<void> {
		if (!valid) return;
		const wanted = score;
		await action.run(async () => {
			await postScore({ gameId, score: wanted, method: "self" });
			setValue("");
			setFiled(wanted);
			celebrate();
			onFiled();
		});
	}

	return (
		<form
			className="space-y-3"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<div className="space-y-2">
				<Label htmlFor="pontuacao" className="font-bold text-lg">
					Anotar minha pontuação
				</Label>
				<Input
					id="pontuacao"
					type="number"
					inputMode="numeric"
					min={0}
					max={MAX_SCORE}
					step={1}
					placeholder="0"
					value={value}
					onChange={(event) => {
						setValue(event.target.value);
						setFiled(null);
						action.reset();
					}}
					className="h-14 rounded-2xl border-2 text-2xl tabular-nums"
				/>
			</div>

			<Button
				type="submit"
				size="lg"
				disabled={!valid || action.busy}
				className="h-14 w-full rounded-2xl font-extrabold text-xl"
			>
				<CheckCircle2 className="size-6" />
				Anotar
			</Button>

			{filed !== null && (
				<p role="status" className="font-bold text-lg text-scratch-operators">
					Pronto! {pontos(filed)} estão esperando o professor.
				</p>
			)}

			{action.error && (
				<p role="alert" className="text-destructive">
					{action.error.message}
				</p>
			)}
		</form>
	);
}
