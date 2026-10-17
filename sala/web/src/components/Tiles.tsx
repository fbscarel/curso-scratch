import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { Link } from "@/components/Bits";
import { SCRATCH, type ScratchColor } from "@/lib/palette";
import { cn } from "@/lib/utils";

/** The tile's own look: the frame, the hover lift and the focus ring. */
const TILE_CLASS =
	"group flex min-h-32 animate-in items-center gap-4 rounded-3xl border-2 border-border bg-card p-5 shadow-sm transition-all duration-300 fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring";

/**
 * FeatureTile is one thing a kid can do on this screen.
 *
 * The whole tile is the target and it is deliberately oversized: an 8-year-old
 * aiming at a laptop trackpad on a desk full of other 8-year-olds misses small
 * controls, so the tile clears the 64px tap target on its own and the icon
 * beside the words carries the meaning for anybody who cannot read it yet.
 */
export function FeatureTile({
	to,
	title,
	description,
	icon,
	color,
}: {
	to: string;
	title: string;
	description: string;
	icon: React.ReactNode;
	color: ScratchColor;
}) {
	return (
		<Link to={to} className={TILE_CLASS}>
			<TileInside
				title={title}
				description={description}
				icon={icon}
				color={color}
			/>
		</Link>
	);
}

/**
 * FileTile is the tile that leaves the application: a plain link to a file the
 * server hands out.
 *
 * A plain `href` and not the client router, because the click is a download:
 * the router would turn it into a request this page makes and reads, and the
 * file would never reach the kid's disk -- nor the application the system
 * registered for its type. No `download` attribute either: it is the server's
 * `Content-Disposition` that decides whether the file is saved or opened.
 */
export function FileTile({
	href,
	title,
	description,
	icon,
	color,
}: {
	href: string;
	title: string;
	description: string;
	icon: React.ReactNode;
	color: ScratchColor;
}) {
	return (
		<a href={href} className={TILE_CLASS}>
			<TileInside
				title={title}
				description={description}
				icon={icon}
				color={color}
			/>
		</a>
	);
}

/** TileInside is what both tiles look like: the icon, the two lines, the chevron. */
function TileInside({
	title,
	description,
	icon,
	color,
}: {
	title: string;
	description: string;
	icon: React.ReactNode;
	color: ScratchColor;
}) {
	return (
		<>
			<span
				className={cn(
					"grid size-16 shrink-0 place-items-center rounded-2xl text-foreground shadow-inner",
					SCRATCH[color],
				)}
			>
				{icon}
			</span>
			<span className="flex-1">
				<span className="block font-extrabold text-2xl">{title}</span>
				<span className="block text-lg text-muted-foreground">
					{description}
				</span>
			</span>
			<ChevronRight
				aria-hidden="true"
				className="size-8 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
			/>
		</>
	);
}
