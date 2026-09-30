import { AlertTriangle, RotateCw } from "lucide-react";
import type * as React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { avatarClass, avatarInkClass } from "@/lib/palette";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";

/**
 * Link navigates in-app without a page load, and is still a real href.
 *
 * A real `href` is not decoration: it is what makes the address copyable, what
 * opens the screen in a new tab on middle-click, and what works at all if the
 * script that would have handled the click never ran.
 */
export function Link({
	to,
	children,
	className,
	...rest
}: {
	to: string;
	children: React.ReactNode;
	className?: string;
} & Omit<React.ComponentProps<"a">, "href" | "className" | "children">) {
	return (
		<a
			href={to}
			className={cn("cursor-pointer", className)}
			onClick={(e) => {
				if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
				e.preventDefault();
				navigate(to);
			}}
			{...rest}
		>
			{children}
		</a>
	);
}

/**
 * ErrorNotice renders a failed request.
 *
 * A 401 never reaches here -- the api client has already sent the shell back to
 * the login screen -- so everything this shows is something the reader can act
 * on or quote to the teacher.
 */
export function ErrorNotice({
	error,
	onRetry,
	className,
}: {
	error: Error;
	onRetry?: () => void;
	className?: string;
}) {
	return (
		<Card
			className={cn(
				"border-2 border-destructive/40 bg-destructive/5",
				className,
			)}
		>
			<CardContent className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 size-6 shrink-0 text-destructive" />
				<div className="flex-1 space-y-2">
					<p className="font-bold text-lg">Algo deu errado</p>
					<p className="text-muted-foreground">{error.message}</p>
					{onRetry && (
						<Button variant="outline" size="lg" onClick={onRetry}>
							<RotateCw />
							Tentar de novo
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/** Empty is a permanent, unremarkable state, and reads like one. */
export function Empty({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"rounded-2xl border-2 border-border border-dashed bg-card/60 p-6 text-center text-lg text-muted-foreground",
				className,
			)}
		>
			{children}
		</p>
	);
}

/**
 * NameAvatar is the coloured initial a kid recognises as theirs.
 *
 * The colour comes from the student id (lib/palette.ts) rather than from the
 * position in the list, so registering another kid does not repaint anybody's
 * card. The ink comes from the same place and is not always the theme's slate:
 * measured against these eight block colours, the slate clears 4.5:1 on six of
 * them and only 3.6:1 and 4.0:1 on `looks` and `sound`, so those two take a
 * deeper ink (4.8:1 and 5.4:1). White is nowhere near: it is under 3:1 on seven
 * of the eight.
 *
 * The size and the text size both come from the caller's `className`, which is
 * why the fallback's font-size is `1em`: the generated component hardcodes
 * `text-sm`, and a caller asking for a 64px circle with a 30px initial would
 * otherwise get an initial that stayed small.
 */
export function NameAvatar({
	id,
	name,
	className,
}: {
	id: number;
	name: string;
	className?: string;
}) {
	const initial = name.trim().charAt(0).toUpperCase();
	return (
		<Avatar
			aria-hidden="true"
			className={cn("font-extrabold text-xl", avatarClass(id), className)}
		>
			{/* The ink goes on the fallback, not on the avatar: the generated
			    component gives the fallback its own `text-muted-foreground`, and
			    an inherited colour never reaches it. That default is 1.5:1 on
			    `looks`, which is why the fallback carries the ink itself. */}
			<AvatarFallback
				className={cn("bg-transparent text-[1em]", avatarInkClass(id))}
			>
				{initial === "" ? "?" : initial}
			</AvatarFallback>
		</Avatar>
	);
}
