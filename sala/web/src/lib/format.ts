/**
 * pt-BR day formatting, done by hand rather than with Intl.
 *
 * `Intl.DateTimeFormat("pt-BR", { weekday: "long" })` answers "terça-feira",
 * and the board header the course uses is "terça". Stripping the suffix from an
 * ICU string is a dependency on a spelling that is not ours to change; the
 * seven words below are.
 */
const WEEKDAYS = [
	"domingo",
	"segunda",
	"terça",
	"quarta",
	"quinta",
	"sexta",
	"sábado",
] as const;

/**
 * parseISODate reads an ISO `YYYY-MM-DD` day as a LOCAL date.
 *
 * `new Date("2026-10-06")` is parsed as UTC midnight, which in Brazil is 21:00
 * of the day before -- so the weekday and the day-of-month of every lesson would
 * be off by one on the machine this actually runs on. The three numbers are
 * taken apart instead.
 *
 * Returns null for anything that is not a real day, including a well-formed
 * string naming one that does not exist (2026-02-30): the caller shows the raw
 * value rather than a confident wrong one.
 */
export function parseISODate(iso: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return null;
	const [, year, month, day] = match;
	if (year === undefined || month === undefined || day === undefined) {
		return null;
	}
	const y = Number(year);
	const m = Number(month);
	const d = Number(day);
	const date = new Date(y, m - 1, d);
	if (
		date.getFullYear() !== y ||
		date.getMonth() !== m - 1 ||
		date.getDate() !== d
	) {
		return null;
	}
	return date;
}

/** formatDayMonth renders `06/10`, the form the admin header badge uses. */
export function formatDayMonth(iso: string): string {
	const date = parseISODate(iso);
	if (!date) return iso;
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `${day}/${month}`;
}

/** formatLongDate renders `terça, 06/10`, the form the kid hero uses. */
export function formatLongDate(iso: string): string {
	const date = parseISODate(iso);
	if (!date) return iso;
	const weekday = WEEKDAYS[date.getDay()] ?? "";
	return `${weekday}, ${formatDayMonth(iso)}`;
}

/** formatFullDate renders `06/10/2026`, for the lessons table. */
export function formatFullDate(iso: string): string {
	const date = parseISODate(iso);
	if (!date) return iso;
	return `${formatDayMonth(iso)}/${date.getFullYear()}`;
}

/** todayISO is today's local day, which is the default date of a new lesson. */
export function todayISO(now: Date = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}
