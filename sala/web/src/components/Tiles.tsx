import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { Link } from "@/components/Bits";
import { SCRATCH, type ScratchColor } from "@/lib/palette";
import { cn } from "@/lib/utils";

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
		<Link
			to={to}
			className="group flex min-h-32 animate-in items-center gap-4 rounded-3xl border-2 border-border bg-card p-5 shadow-sm transition-all duration-300 fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
		>
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
		</Link>
	);
}
