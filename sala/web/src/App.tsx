import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNotice } from "@/components/Bits";
import { KidHeader } from "@/components/KidHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { readAdminBase } from "@/lib/adminBase";
import {
	getAdminSession,
	getPublicSession,
	setUnauthorizedHandler,
} from "@/lib/api";
import { hrefFor, navigate, type Route, useRoute } from "@/lib/router";
import type { AdminSession, PublicSession } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { Attendance } from "@/screens/admin/Attendance";
import { Current } from "@/screens/admin/Current";
import { Lessons } from "@/screens/admin/Lessons";
import { AdminLogin } from "@/screens/admin/Login";
import { Students } from "@/screens/admin/Students";
import { Uploads } from "@/screens/admin/Uploads";
import { Home } from "@/screens/Home";
import { Identity } from "@/screens/Identity";
import { MyFiles } from "@/screens/MyFiles";
import { NotFound } from "@/screens/NotFound";
import { Sheets } from "@/screens/Sheets";
import { Upload } from "@/screens/Upload";

/**
 * App is the whole bootstrap, and it picks one of two applications.
 *
 * The admin path is not in the bundle -- it arrives in <head> as a meta tag the
 * server injects (lib/adminBase.ts) -- so the presence of that tag is what
 * decides which application this page is. The two trees share the router, the
 * api client and the theme, and nothing else.
 */
export function App() {
	const [base] = useState(readAdminBase);
	const route = useRoute(base);
	const admin =
		route.name.startsWith("admin-") ||
		(route.name === "notfound" && route.admin);

	useEffect(() => {
		document.title = admin ? "Sala — painel do professor" : "Sala de Scratch";
	}, [admin]);

	return (
		<>
			{admin ? (
				<AdminApp base={base} route={route} />
			) : (
				<KidApp route={route} />
			)}
			<Toaster position="top-center" richColors />
		</>
	);
}

/**
 * KidApp is the public tree.
 *
 * One session read serves both the header ("Jogando como…") and the home
 * screen's hero, and it is keyed on the route so that coming back from "Quem é
 * você?" after picking a name shows the name. That read is also what hands the
 * api client its CSRF token.
 *
 * Two screens need an identity before they mean anything -- handing work in and
 * looking at what you have handed in -- and the guard is here rather than in the
 * screens because the session is: a screen that redirected would first have to
 * be given the session it is being redirected for. The kid is sent to the name
 * cards with `?next=`, so choosing a name comes back to what they were doing.
 */
function KidApp({ route }: { route: Route }) {
	const session = useAsync<PublicSession>(
		(signal) => getPublicSession(signal),
		route.name,
	);
	const student = session.data?.student ?? null;
	const guarded = route.name === "upload" || route.name === "my-files";
	const target = hrefFor(route);

	useEffect(() => {
		if (!guarded || session.loading || session.error) return;
		if (!session.data || session.data.student) return;
		navigate(`/quem-sou-eu?next=${encodeURIComponent(target)}`);
	}, [guarded, session.loading, session.error, session.data, target]);

	return (
		<div className="min-h-dvh">
			<KidHeader student={student} />
			<main className="mx-auto max-w-5xl px-4 py-8">
				{route.name === "identity" && <Identity />}
				{route.name === "notfound" && <NotFound />}
				{route.name === "sheets" && <Sheets />}
				{route.name === "home" &&
					(session.loading ? (
						<KidLoading />
					) : session.error ? (
						<ErrorNotice error={session.error} onRetry={session.reload} />
					) : session.data ? (
						<Home session={session.data} />
					) : null)}
				{guarded &&
					(session.loading ? (
						<KidLoading />
					) : session.error ? (
						<ErrorNotice error={session.error} onRetry={session.reload} />
					) : student ? (
						route.name === "upload" ? (
							<Upload />
						) : (
							<MyFiles />
						)
					) : (
						// The guard above is navigating to the name cards; this is
						// the screen it is leaving, not a screen to show.
						<KidLoading />
					))}
			</main>
		</div>
	);
}

function KidLoading() {
	return (
		<div className="space-y-8">
			<Skeleton className="h-48 rounded-3xl" />
			<div className="grid gap-4 sm:grid-cols-2">
				<Skeleton className="h-32 rounded-3xl" />
				<Skeleton className="h-32 rounded-3xl" />
			</div>
		</div>
	);
}

/**
 * AdminApp is the teacher's tree.
 *
 * `/session` answers without authentication and says whether this browser is
 * signed in, so one read decides between the login card and the shell -- and
 * answers the current lesson for the header badge at the same time. A 401 from
 * any later call re-runs that read, which is what turns an expired session into
 * the login card rather than into a red box on every screen.
 */
function AdminApp({ base, route }: { base: string; route: Route }) {
	const session = useAsync<AdminSession>(
		(signal) => getAdminSession(signal),
		"admin-session",
	);

	useEffect(() => {
		setUnauthorizedHandler(session.reload);
		return () => setUnauthorizedHandler(() => undefined);
	}, [session.reload]);

	if (session.loading) {
		return (
			<div className="grid min-h-dvh place-items-center p-6">
				<Skeleton className="h-40 w-full max-w-md rounded-xl" />
			</div>
		);
	}

	if (session.error) {
		return (
			<div className="grid min-h-dvh place-items-center p-6">
				<div className="w-full max-w-md">
					<ErrorNotice error={session.error} onRetry={session.reload} />
				</div>
			</div>
		);
	}

	const current = session.data;
	if (!current) return null;

	if (!current.admin) {
		return (
			<AdminLogin
				onLoggedIn={() => {
					session.reload();
					// `/login` is not a screen to stay on once the password is
					// accepted; any other admin path is where the teacher was going.
					if (route.name === "admin-login") {
						navigate(hrefFor({ name: "admin-current" }, base));
					}
				}}
			/>
		);
	}

	return (
		<AdminShell
			base={base}
			route={route}
			session={current}
			onLoggedOut={session.reload}
		>
			<AdminScreen
				base={base}
				route={route}
				session={current}
				reloadSession={session.reload}
			/>
		</AdminShell>
	);
}

function AdminScreen({
	base,
	route,
	session,
	reloadSession,
}: {
	base: string;
	route: Route;
	session: AdminSession;
	reloadSession: () => void;
}) {
	switch (route.name) {
		case "admin-students":
			return <Students />;
		case "admin-lessons":
			return <Lessons />;
		case "admin-attendance":
			return (
				<Attendance currentNumber={session.currentLesson?.number ?? null} />
			);
		case "admin-uploads":
			return <Uploads currentNumber={session.currentLesson?.number ?? null} />;
		case "notfound":
			return (
				<NotFound
					backTo={hrefFor({ name: "admin-current" }, base)}
					backLabel="Voltar para a aula atual"
				/>
			);
		default:
			return <Current session={session} onChanged={reloadSession} />;
	}
}
