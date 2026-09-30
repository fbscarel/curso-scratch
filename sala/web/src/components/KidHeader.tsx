import { Blocks, UserRound } from "lucide-react";
import { Link, NameAvatar } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import type { Student } from "@/lib/types";

/**
 * The kid screens' header: who this machine is playing as.
 *
 * Sticky, because the answer to "whose turn is this?" has to survive a scroll
 * through a long list of names, and the button that changes it is the one a kid
 * looks for when the previous kid left without saying anything.
 */
export function KidHeader({ student }: { student: Student | null }) {
	return (
		<header className="sticky top-0 z-20 border-border border-b-2 bg-background/85 backdrop-blur">
			<div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
				<Link to="/" className="flex items-center gap-3">
					<span className="grid size-12 place-items-center rounded-2xl bg-scratch-motion text-foreground shadow-sm">
						<Blocks className="size-7" />
					</span>
					<span className="font-extrabold text-2xl tracking-tight">
						Sala de Scratch
					</span>
				</Link>

				{student ? (
					<div className="flex flex-wrap items-center gap-3">
						<span className="flex items-center gap-2 rounded-full border-2 border-border bg-card py-1 pr-4 pl-1.5 text-lg">
							<NameAvatar
								id={student.id}
								name={student.name}
								className="size-9 text-lg"
							/>
							<span>
								Jogando como:{" "}
								<strong className="font-extrabold">{student.name}</strong>
							</span>
						</span>
						<Button
							asChild
							variant="outline"
							className="h-12 rounded-2xl px-5 text-lg"
						>
							<Link to="/quem-sou-eu">trocar</Link>
						</Button>
					</div>
				) : (
					<Button
						asChild
						className="h-16 rounded-2xl px-6 font-extrabold text-xl"
					>
						<Link to="/quem-sou-eu">
							<UserRound className="size-7" />
							Quem é você?
						</Link>
					</Button>
				)}
			</div>
		</header>
	);
}
