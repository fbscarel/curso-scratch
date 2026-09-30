/**
 * The Scratch block palette, as Tailwind class names.
 *
 * The values themselves live in src/index.css, in the `@theme` block, so a tile
 * and the palette can never drift: this file names the utilities, that file
 * holds the colours. Nothing here is invented -- these are Scratch's own block
 * colours, which is what makes the kid screens recognisable to somebody who has
 * spent an afternoon in the editor.
 */
export const SCRATCH = {
	motion: "bg-scratch-motion",
	looks: "bg-scratch-looks",
	sound: "bg-scratch-sound",
	events: "bg-scratch-events",
	control: "bg-scratch-control",
	sensing: "bg-scratch-sensing",
	operators: "bg-scratch-operators",
	variables: "bg-scratch-variables",
} as const;

export type ScratchColor = keyof typeof SCRATCH;

/**
 * The ink a letter drawn on each block colour takes.
 *
 * The theme's slate clears 4.5:1 on six of the eight; on `looks` (#9966ff) it
 * reaches 3.6:1 and on `sound` (#cf63cf) 4.0:1, so those two take the deeper ink
 * instead (4.8:1 and 5.4:1). The block colour itself does not move -- it is what
 * a kid recognises as theirs.
 */
export const SCRATCH_INK: Record<ScratchColor, string> = {
	motion: "text-foreground",
	looks: "text-scratch-ink",
	sound: "text-scratch-ink",
	events: "text-foreground",
	control: "text-foreground",
	sensing: "text-foreground",
	operators: "text-foreground",
	variables: "text-foreground",
};

/**
 * The order the palette cycles in for avatars.
 *
 * Written out rather than `Object.keys(SCRATCH)`: the cycle is a design choice
 * (neighbouring cards should not collide), and deriving it from the object would
 * make a reordering of that object silently change every student's colour.
 */
export const SCRATCH_CYCLE: ScratchColor[] = [
	"motion",
	"looks",
	"sound",
	"events",
	"control",
	"sensing",
	"operators",
	"variables",
];

/**
 * colorFor is the colour of a student, from the ID and not from the position in
 * the list, so the colour a kid recognises as theirs does not move when another
 * kid is registered or deactivated. The same id always answers the same colour.
 */
function colorFor(studentId: number): ScratchColor {
	const index = Math.abs(Math.trunc(studentId)) % SCRATCH_CYCLE.length;
	return SCRATCH_CYCLE[index] ?? "motion";
}

/** avatarClass is the block colour of a student's avatar. */
export function avatarClass(studentId: number): string {
	return SCRATCH[colorFor(studentId)];
}

/** avatarInkClass is the ink of the letter drawn on that block colour. */
export function avatarInkClass(studentId: number): string {
	return SCRATCH_INK[colorFor(studentId)];
}
