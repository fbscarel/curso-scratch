import confetti from "canvas-confetti";

/**
 * The burst a kid earns: a saved file, a pontuação filed, a game finished.
 *
 * The instance is built here and not taken from the library's default one, which
 * animates from a `blob:` Web Worker: the SPA's policy (`app/spa.py`, SPA_CSP)
 * allows no blob workers -- nothing else in the bundle needs one, and the page's
 * whole point is that it reaches nothing outside this laptop -- so the default
 * instance's worker would be refused with a console error on every celebration.
 * On the main thread the burst lasts a second and nothing else is competing for
 * it at the moment a kid earns one.
 *
 * `disableForReducedMotion` is the whole accessibility story here: a kid who
 * asked their system for less animation gets none, and the card that appears
 * with the celebration is the part that says it worked.
 */
const celebration = confetti.create(undefined, {
	resize: true,
	useWorker: false,
});

/** celebrate draws one short burst from the bottom of the screen. */
export function celebrate(): void {
	celebration({
		particleCount: 80,
		spread: 70,
		origin: { y: 0.7 },
		disableForReducedMotion: true,
	});
}
