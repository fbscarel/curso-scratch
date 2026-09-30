import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isTypingTarget, PongGame } from "@/games/pong/PongGame";

/**
 * What the game does when the browser cannot draw it.
 *
 * jsdom has no WebGL at all, which is exactly the case this covers -- and it is
 * not a hypothetical one: an old lab machine with hardware acceleration turned
 * off is a machine where the game has to say so in pt-BR rather than throw at a
 * kid. The engine's own rules are tested in engine.test.ts; this is only the
 * screen refusing politely.
 */
describe("PongGame", () => {
	it("says in pt-BR that this browser cannot draw the game", () => {
		render(<PongGame onGameOver={() => undefined} />);

		expect(screen.getByText("O jogo não conseguiu ligar aqui")).toBeTruthy();
		expect(screen.getByText(/WebGL/)).toBeTruthy();
		// Nothing is drawn: there is no canvas to draw on.
		expect(document.querySelector("canvas")).toBeNull();
	});
});

/**
 * Which keys are the game's to take.
 *
 * The game listens on the window, so it hears every keystroke on the page. A
 * key pressed in a field belongs to that field, and the fields this can ask
 * about are the ones a document carries: an input, a textarea, a select. An
 * editable region is the guard's other half, and it is asked of the browser
 * (`isContentEditable`), which jsdom does not implement -- so that half is
 * checked in a browser, not here.
 */
describe("isTypingTarget", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("is true for the fields a kid types in", () => {
		document.body.innerHTML = `
			<input id="texto" />
			<textarea id="area"></textarea>
			<select id="lista"></select>
		`;

		for (const id of ["texto", "area", "lista"]) {
			expect(isTypingTarget(document.getElementById(id))).toBe(true);
		}
	});

	it("is false for the rest of the page", () => {
		document.body.innerHTML = `
			<button id="botao">Jogar</button>
			<canvas id="tela"></canvas>
		`;

		expect(isTypingTarget(document.getElementById("botao"))).toBe(false);
		expect(isTypingTarget(document.getElementById("tela"))).toBe(false);
		expect(isTypingTarget(document.body)).toBe(false);
		// The listener is on the window, so an event with no element under it --
		// the window itself, or nothing at all -- is nobody's field.
		expect(isTypingTarget(window)).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});
