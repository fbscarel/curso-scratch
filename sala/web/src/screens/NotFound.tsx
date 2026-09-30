import { Compass } from "lucide-react";
import { Link } from "@/components/Bits";
import { Button } from "@/components/ui/button";

/**
 * NotFound answers a path this application does not serve.
 *
 * The server hands index.html to every extension-less GET, so a typo in a
 * pasted URL arrives here rather than at the server -- which is why this is a
 * screen and not a 404 page. It offers the way back rather than the path that
 * failed: the path is already in the address bar for anybody who wants it.
 */
export function NotFound({
	backTo = "/",
	backLabel = "Voltar para o começo",
}: {
	backTo?: string;
	backLabel?: string;
}) {
	return (
		<div className="animate-in space-y-6 py-8 text-center duration-300 fade-in">
			<Compass
				aria-hidden="true"
				className="mx-auto size-16 text-muted-foreground"
			/>
			<h1 className="font-extrabold text-5xl">Esta página não existe</h1>
			<p className="text-2xl text-muted-foreground">
				Talvez o endereço tenha sido digitado errado.
			</p>
			<Button asChild className="h-16 rounded-2xl px-6 font-extrabold text-xl">
				<Link to={backTo}>{backLabel}</Link>
			</Button>
		</div>
	);
}
