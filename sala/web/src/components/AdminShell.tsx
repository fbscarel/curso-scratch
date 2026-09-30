import { LogOut } from "lucide-react";
import type * as React from "react";
import { Link } from "@/components/Bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminLogout } from "@/lib/api";
import { formatDayMonth } from "@/lib/format";
import { hrefFor, type Route } from "@/lib/router";
import type { AdminCurrentLesson, AdminSession } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { cn } from "@/lib/utils";

/** The four sections of the teacher's app, in the order they are worked in. */
const NAV: { route: Route; label: string }[] = [
	{ route: { name: "admin-current" }, label: "Aula atual" },
	{ route: { name: "admin-students" }, label: "Alunos" },
	{ route: { name: "admin-lessons" }, label: "Aulas" },
	{ route: { name: "admin-attendance" }, label: "Presença" },
];

/**
 * LessonBadge is the answer to "which aula are we in?", on every admin page.
 *
 * It is in the shell rather than on each screen because the teacher reads it
 * while doing something else -- registering a student, taking attendance -- and
 * a page that only answered it on the home screen would be a page they leave to
 * check.
 */
export function LessonBadge({ lesson }: { lesson: AdminCurrentLesson | null }) {
	if (!lesson)
		return <Badge variant="secondary">Nenhuma aula começou ainda</Badge>;
	return (
		<>
			<Badge variant="secondary">
				Aula atual: {lesson.number} ({formatDayMonth(lesson.date)})
			</Badge>
			{lesson.override && (
				<Badge variant="outline">escolhida manualmente</Badge>
			)}
		</>
	);
}

/**
 * AdminShell is the frame every teacher screen sits in: the sections, the
 * current lesson, and the way out.
 *
 * The lesson badge is rendered from the session the shell already holds, so the
 * override control on the "Aula atual" screen only has to reload that session
 * for the whole header to agree with the database.
 */
export function AdminShell({
	base,
	route,
	session,
	onLoggedOut,
	children,
}: {
	base: string;
	route: Route;
	session: AdminSession;
	onLoggedOut: () => void;
	children: React.ReactNode;
}) {
	const logout = useAction();

	return (
		<div className="min-h-dvh bg-muted/40">
			<header className="border-b bg-background">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
					<span className="font-semibold text-lg">Painel do professor</span>

					<nav className="flex flex-wrap items-center gap-1">
						{NAV.map((item) => {
							const active = route.name === item.route.name;
							return (
								<Link
									key={item.label}
									to={hrefFor(item.route, base)}
									aria-current={active ? "page" : undefined}
									className={cn(
										"rounded-md px-3 py-1.5 text-sm transition-colors",
										active
											? "bg-secondary font-semibold text-secondary-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>

					<div className="ml-auto flex items-center gap-2">
						<LessonBadge lesson={session.currentLesson} />
						<Button
							variant="outline"
							size="sm"
							disabled={logout.busy}
							onClick={() => {
								void logout.run(async () => {
									await adminLogout();
									onLoggedOut();
								});
							}}
						>
							<LogOut />
							Sair
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
		</div>
	);
}

/** PageTitle is the one heading shape the teacher screens share. */
export function PageTitle({
	title,
	description,
	actions,
}: {
	title: string;
	description?: string;
	actions?: React.ReactNode;
}) {
	return (
		<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 className="font-semibold text-2xl">{title}</h1>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
			</div>
			{actions}
		</div>
	);
}
