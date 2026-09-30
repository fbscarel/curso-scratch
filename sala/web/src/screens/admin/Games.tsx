import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/AdminShell";
import { Empty, ErrorNotice } from "@/components/Bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { getAdminGames, putGamesMode } from "@/lib/api";
import { SYSTEM_LABELS } from "@/lib/games";
import type { AdminGame, AdminGames } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useAsync } from "@/lib/useAsync";

/**
 * GamesAdmin is the teacher's control over what the kids can play.
 *
 * Two settings, and they are one decision: free mode turns the whole playable
 * catalogue on, and single mode turns one game on. Both are written together in
 * one request, because a screen that sent only the one it changed could undo
 * the other from a stale copy.
 *
 * The table below is the WHOLE catalogue, including the entries that cannot be
 * played. That is the point of it: a game that is not on the kids' screen has to
 * be explainable here, and the badge says which of the two things is missing --
 * the ROM file or the emulator core, which are two different fixes.
 */
export function GamesAdmin() {
	const games = useAsync<AdminGames>(
		(signal) => getAdminGames(signal),
		"admin-games",
	);
	const action = useAction();
	const [active, setActive] = useState<string | null>(null);
	const [free, setFree] = useState(false);
	const [seeded, setSeeded] = useState(false);

	// The settings are edited locally and written on every change, so the
	// controls answer at once instead of after a round trip. `seeded` keeps the
	// reload that follows a write from stamping over what the teacher just did.
	useEffect(() => {
		if (seeded || !games.data) return;
		setActive(games.data.activeGame);
		setFree(games.data.freeMode);
		setSeeded(true);
	}, [games.data, seeded]);

	const catalogue = games.data?.games ?? [];
	const playable = catalogue.filter((game) => game.playable);
	// The game that is stored, playable or not: it is what the select has to
	// show, because it is what the kids' screen is answering to.
	const stored = catalogue.find((game) => game.id === active) ?? null;
	const storedTrouble = stored ? troubleOf(stored) : null;
	const storedNote =
		stored && storedTrouble ? `${stored.title} ${storedTrouble}` : null;

	/** Writes both settings and, if the server refused, puts the truth back. */
	async function save(next: { activeGame: string | null; freeMode: boolean }) {
		setActive(next.activeGame);
		setFree(next.freeMode);
		// `true` and not the request's own (void) answer: useAction answers
		// `undefined` both for a write that failed and for one that returned
		// nothing, and this screen has to tell those apart -- reading the void as
		// a refusal is what left the buttons showing the mode the teacher had
		// just left.
		const written = await action.run(async () => {
			await putGamesMode(next);
			games.reload();
			return true;
		});
		// A refusal (an id the server will not store, a session that expired)
		// leaves the settings as they were, so what is on screen goes back to
		// being what is stored rather than what was asked for.
		if (written !== true) {
			setSeeded(false);
			games.reload();
		}
	}

	function chooseMode(nextFree: boolean) {
		// "Um jogo" with nothing playable chosen would leave the kids with no
		// game at all, so the first playable entry is picked for the teacher.
		// Free mode keeps the choice -- or drops it, if the game it names cannot
		// be played anymore: the server refuses to store one it cannot run.
		const chosen = playable.some((game) => game.id === active) ? active : null;
		void save({
			activeGame: nextFree ? chosen : (chosen ?? playable[0]?.id ?? null),
			freeMode: nextFree,
		});
	}

	function chooseGame(id: string) {
		void save({ activeGame: id, freeMode: free });
	}

	return (
		<div>
			<PageTitle
				title="Jogos"
				description="O que a turma pode jogar na aula de hoje."
			/>

			{action.error && (
				<ErrorNotice error={action.error} onRetry={action.reset} />
			)}

			{games.loading && (
				<div className="space-y-2">
					{[0, 1, 2, 3].map((n) => (
						<Skeleton key={n} className="h-12 rounded-lg" />
					))}
				</div>
			)}

			{games.error && (
				<ErrorNotice error={games.error} onRetry={games.reload} />
			)}

			{games.data && (
				<>
					<Card className="mb-6">
						<CardHeader>
							<CardTitle>Modo dos jogos</CardTitle>
							<CardDescription>
								Um jogo só, ou o catálogo inteiro liberado para a turma.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-wrap items-end gap-6">
							<div className="space-y-2">
								<Label>Modo</Label>
								<div className="flex gap-2">
									<Button
										variant={free ? "outline" : "default"}
										disabled={action.busy}
										aria-pressed={!free}
										onClick={() => chooseMode(false)}
									>
										Um jogo
									</Button>
									<Button
										variant={free ? "default" : "outline"}
										disabled={action.busy}
										aria-pressed={free}
										onClick={() => chooseMode(true)}
									>
										Modo livre
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="jogo-ativo">Jogo ativo</Label>
								{catalogue.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										O catálogo de jogos está vazio.
									</p>
								) : (
									<>
										{/* The WHOLE catalogue, with the games that cannot be played
										    disabled but present: the stored game may be one of them --
										    the ROM drive was where it always is yesterday and is not
										    today -- and a select that dropped it would show an empty
										    box, as if no game were chosen. */}
										<Select
											value={active ?? ""}
											onValueChange={chooseGame}
											disabled={action.busy}
										>
											<SelectTrigger
												id="jogo-ativo"
												className="w-72"
												aria-label="Jogo ativo"
											>
												<SelectValue placeholder="Escolha um jogo" />
											</SelectTrigger>
											<SelectContent>
												{catalogue.map((game) => (
													<SelectItem
														key={game.id}
														value={game.id}
														disabled={!game.playable}
													>
														{game.title}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{storedNote && (
											<p className="text-muted-foreground text-sm">
												{storedNote} A turma não consegue abrir este jogo
												enquanto isso.
											</p>
										)}
										{playable.length === 0 && (
											<p className="text-muted-foreground text-sm">
												Nenhum jogo pronto: falta a ROM ou o emulador.
											</p>
										)}
									</>
								)}
							</div>

							{action.busy && (
								<Loader2 className="mb-2 size-5 animate-spin text-muted-foreground" />
							)}
						</CardContent>
					</Card>

					{games.data.games.length === 0 ? (
						<Empty>O catálogo de jogos está vazio.</Empty>
					) : (
						<Card>
							<CardHeader>
								<CardTitle>Catálogo</CardTitle>
								<CardDescription>
									Todos os jogos cadastrados, prontos ou não.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Jogo</TableHead>
											<TableHead>Sistema</TableHead>
											<TableHead>Ano</TableHead>
											<TableHead>Fabricante</TableHead>
											<TableHead>Estado</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{games.data.games.map((game) => (
											<TableRow key={game.id}>
												<TableCell>
													<span className="block font-medium">
														{game.title}
													</span>
													<span className="text-muted-foreground text-xs">
														{game.id}
													</span>
												</TableCell>
												<TableCell>{SYSTEM_LABELS[game.system]}</TableCell>
												<TableCell className="text-muted-foreground">
													{game.year}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{game.maker}
												</TableCell>
												<TableCell>
													<StatusBadge game={game} />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}

/**
 * troubleOf says, in pt-BR, what stops a catalogue entry from being played --
 * the sentence the teacher reads next to the select when the stored game is one
 * of the entries with something missing. `null` is a game that is playable.
 */
function troubleOf(game: AdminGame): string | null {
	if (game.playable) return null;
	if (game.missing === "rom") return "está sem a ROM.";
	if (game.missing === "core") return "está sem o emulador.";
	return "não está pronto.";
}

/**
 * StatusBadge says whether a catalogue entry can be played, and if not, what is
 * missing.
 *
 * "Falta emulador" is the core not being in the vendor directory, which is
 * `just sala-emulador`; "Falta ROM" is the file not being on the ROM drive,
 * which is a different afternoon's work. Saying only "indisponível" would send
 * the teacher looking in the wrong place.
 */
function StatusBadge({ game }: { game: AdminGame }) {
	if (game.playable) {
		return (
			<Badge>
				<CheckCircle2 />
				Pronto
			</Badge>
		);
	}
	if (game.missing === "rom") {
		return (
			<Badge variant="destructive">
				<CircleAlert />
				Falta ROM
			</Badge>
		);
	}
	if (game.missing === "core") {
		return (
			<Badge variant="secondary">
				<CircleAlert />
				Falta emulador
			</Badge>
		);
	}
	return <Badge variant="outline">Indisponível</Badge>;
}
