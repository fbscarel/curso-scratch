import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFile } from "@/lib/api";
import { Upload } from "@/screens/Upload";

/**
 * The upload client is mocked and not the browser: what this file is about is
 * the SCREEN's queue -- which file goes next, and what a failure of one does to
 * the others. The transport itself is driven for real in src/lib/upload.test.ts.
 *
 * The rejection is therefore an Error carrying the sentence the API wrote, which
 * is the whole of what the screen reads off a failure (the client turns the
 * API's `{error}` body into exactly this, with the status on it for the code
 * that cares).
 */
vi.mock("@/lib/api", () => ({ uploadFile: vi.fn() }));

/** The burst a saved file earns, which jsdom has no canvas for. The screen
 *  builds its own instance (`create`, no blob worker), so that is what the mock
 *  has to answer. */
vi.mock("canvas-confetti", () => {
	const celebrate = vi.fn();
	return {
		default: Object.assign(celebrate, { create: vi.fn(() => celebrate) }),
	};
});

const uploadMock = vi.mocked(uploadFile);

/** chooseFiles is a kid picking files in the picker the button opens. */
function chooseFiles(files: File[]): void {
	const input = document.querySelector("input[type=file]");
	if (!(input instanceof HTMLInputElement)) {
		throw new Error("o seletor de arquivos não está na tela");
	}
	// `files` is readonly, and this is how a test writes it.
	Object.defineProperty(input, "files", { value: files, configurable: true });
	fireEvent.change(input);
}

const ACCEPTED = {
	id: 9,
	lessonNumber: 3,
	name: "labirinto.sb3",
	size: 2048,
	createdAt: "2026-09-29 14:32:05",
};

describe("the entregar screen", () => {
	beforeEach(() => {
		uploadMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("sends the files one at a time, and a refused file does not stop the next", async () => {
		const big = new File([new Uint8Array(30)], "gigante.sb3");
		const ok = new File([new Uint8Array(2048)], "labirinto.sb3");
		// The first upload is left in flight so the order can be observed.
		const first = Promise.withResolvers<never>();
		uploadMock.mockReturnValueOnce(first.promise);
		uploadMock.mockResolvedValueOnce(ACCEPTED);

		render(<Upload />);
		chooseFiles([big, ok]);

		// One at a time: nothing else goes out while the first file is still
		// being sent.
		expect(uploadMock).toHaveBeenCalledTimes(1);
		expect(uploadMock.mock.calls[0]?.[0]).toBe(big);

		first.reject(
			new Error("Arquivo grande demais: o limite é 20 MB por arquivo."),
		);

		expect(
			await screen.findByText(
				"Arquivo grande demais: o limite é 20 MB por arquivo.",
			),
		).toBeTruthy();
		expect(await screen.findByText("Guardado na Aula 3!")).toBeTruthy();

		await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
		expect(uploadMock.mock.calls[1]?.[0]).toBe(ok);
		// The failure keeps its own card beside the file that worked.
		expect(screen.getByText("gigante.sb3")).toBeTruthy();
		expect(screen.getByText("labirinto.sb3")).toBeTruthy();
	});

	it("shows the aula the server filed the file under, not the one the screen guessed", async () => {
		uploadMock.mockResolvedValueOnce({ ...ACCEPTED, lessonNumber: 7 });

		render(<Upload />);
		chooseFiles([new File([new Uint8Array(4)], "x.sb3")]);

		expect(await screen.findByText("Guardado na Aula 7!")).toBeTruthy();
	});

	it("shows a sentence of its own when the failure carries no message", async () => {
		uploadMock.mockRejectedValueOnce("sem mensagem");

		render(<Upload />);
		chooseFiles([new File([new Uint8Array(4)], "x.sb3")]);

		expect(
			await screen.findByText(
				"Não foi possível enviar este arquivo. Tente de novo.",
			),
		).toBeTruthy();
	});
});
