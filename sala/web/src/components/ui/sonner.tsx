import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toaster is the one place a toast is mounted.
 *
 * The theme is hardcoded rather than read from a theme provider: this
 * application has exactly one theme (src/index.css declares the `dark` variant
 * and no `.dark` block), so a provider that can only ever answer one value
 * would be a dependency that exists to say nothing.
 */
const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="light"
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
