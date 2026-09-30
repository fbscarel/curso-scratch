import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, adminLogin } from "@/lib/api";
import { useAction } from "@/lib/useAction";

/**
 * AdminLogin is the teacher's way in: a password and nothing else.
 *
 * There is no account and no user name -- this server runs on the teacher's own
 * laptop, for one teacher -- so a field asking for an identity would be a field
 * with one possible answer. A wrong password answers 401 with "Senha
 * incorreta.", and that is shown as the form's error rather than as a red box:
 * it is the answer to the submission, not a failure of the application. That is
 * why this one caller asks `useAction` to keep the 401 instead of swallowing it
 * the way the screens behind the shell do.
 */
export function AdminLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
	const [password, setPassword] = useState("");
	const action = useAction();

	const message =
		action.error instanceof ApiError && action.error.status === 401
			? "Senha incorreta."
			: (action.error?.message ?? null);

	return (
		<div className="grid min-h-dvh place-items-center bg-muted/40 p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<KeyRound className="size-5" />
						Painel do professor
					</CardTitle>
					<CardDescription>
						Digite a senha da turma para entrar.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void action.run(
								async () => {
									await adminLogin(password);
									setPassword("");
									onLoggedIn();
								},
								{ keepUnauthorized: true },
							);
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="senha">Senha</Label>
							<Input
								id="senha"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => {
									setPassword(e.target.value);
									action.reset();
								}}
							/>
						</div>
						{message && (
							<p role="alert" className="text-destructive text-sm">
								{message}
							</p>
						)}
						<Button
							type="submit"
							className="w-full"
							disabled={action.busy || password === ""}
						>
							Entrar
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
