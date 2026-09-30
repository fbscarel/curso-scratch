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

/**
 * formatSize renders a byte count the way a Brazilian kid reads it: "1,2 MB".
 *
 * The units are the powers of 1024 the file manager shows, and the separator is
 * the comma. The rounding happens BEFORE the unit is chosen, so a file of
 * 1048575 bytes -- which rounds to 1024,0 KB -- is promoted to "1,0 MB" rather
 * than shown as a kilobyte count nobody writes.
 */
export function formatSize(bytes: number): string {
	const size = Math.max(0, Math.round(bytes));
	if (size < 1024) return `${size} B`;
	const kb = Math.round((size / 1024) * 10) / 10;
	if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} KB`;
	const mb = Math.round((size / (1024 * 1024)) * 10) / 10;
	return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * formatDateTime renders the API's `createdAt` ("2026-09-29 14:32:05") as
 * "29/09 às 14h32".
 *
 * The string is taken apart rather than handed to `new Date`, for the same
 * reason `parseISODate` does it: an unqualified datetime string is read as
 * local time by some engines and as UTC by others, and the one this runs on
 * would move every entrega's hour. Seconds are dropped -- a kid reading when
 * they handed something in does not need them.
 */
export function formatDateTime(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
	if (!match) return value;
	const [, year, month, day, hour, minute] = match;
	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		hour === undefined ||
		minute === undefined
	) {
		return value;
	}
	return `${day}/${month} às ${hour}h${minute}`;
}

/** todayISO is today's local day, which is the default date of a new lesson. */
export function todayISO(now: Date = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}
