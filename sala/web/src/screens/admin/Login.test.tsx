import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCsrf, rememberCsrf } from "@/lib/api";
import { AdminLogin } from "@/screens/admin/Login";

/** The admin path a deployment injects into <head>. */
const BASE = "/professor-kqzt";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("the admin login form", () => {
	let fetchMock: Mock;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		rememberCsrf("tok-1");
		const meta = document.createElement("meta");
		meta.name = "sala-admin-base";
		meta.content = BASE;
		document.head.append(meta);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		forgetCsrf();
		document.querySelector('meta[name="sala-admin-base"]')?.remove();
	});

	/** submit tries a password the way the teacher does: type it, then Enter. */
	function submit(password: string): void {
		fireEvent.change(screen.getByLabelText("Senha"), {
			target: { value: password },
		});
		fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
	}

	it("says the password was wrong instead of re-enabling the button in silence", async () => {
		const onLoggedIn = vi.fn();
		fetchMock.mockResolvedValue(
			jsonResponse(401, { error: "Senha errada. Tente de novo." }),
		);
		render(<AdminLogin onLoggedIn={onLoggedIn} />);

		submit("errada");

		// The 401 IS the answer to the submission, so it is shown on the form
		// and the teacher stays on it.
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Senha incorreta.",
		);
		expect(onLoggedIn).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("lets the teacher in with the right password", async () => {
		const onLoggedIn = vi.fn();
		fetchMock.mockImplementation((path: string) =>
			path === `${BASE}/api/login`
				? Promise.resolve(new Response(null, { status: 204 }))
				: Promise.resolve(
						jsonResponse(200, {
							admin: true,
							csrf: "tok-2",
							currentLesson: null,
						}),
					),
		);
		render(<AdminLogin onLoggedIn={onLoggedIn} />);

		submit("segredo");

		await waitFor(() => expect(onLoggedIn).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
