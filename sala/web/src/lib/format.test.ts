import { describe, expect, it } from "vitest";
import { formatDateTime, formatSize, pontos } from "@/lib/format";

describe("formatSize", () => {
	it("writes a byte count the way a Brazilian kid reads it", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(999)).toBe("999 B");
		expect(formatSize(1024)).toBe("1,0 KB");
		expect(formatSize(1258291)).toBe("1,2 MB");
		expect(formatSize(20971520)).toBe("20,0 MB");
	});

	it("rounds before it picks the unit, so 1024 never appears as a number", () => {
		// 1048575 bytes is 1023,999 KB, which rounds to 1024,0 KB -- a size
		// nobody writes. It is 1,0 MB.
		expect(formatSize(1048575)).toBe("1,0 MB");
		expect(formatSize(1023)).toBe("1023 B");
		expect(formatSize(1048576)).toBe("1,0 MB");
	});

	it("never writes a negative size", () => {
		expect(formatSize(-5)).toBe("0 B");
	});
});

describe("pontos", () => {
	it("uses the singular for exactly one point and the plural for anything else", () => {
		expect(pontos(1)).toBe("1 ponto");
		// Zero is plural in Portuguese, like any other count but one.
		expect(pontos(0)).toBe("0 pontos");
		expect(pontos(2)).toBe("2 pontos");
		expect(pontos(9_999_999)).toBe("9999999 pontos");
	});
});

describe("formatDateTime", () => {
	it("renders the API's timestamp as a Brazilian day and time", () => {
		expect(formatDateTime("2026-09-29 14:32:05")).toBe("29/09 às 14h32");
		expect(formatDateTime("2026-01-02 09:05:00")).toBe("02/01 às 09h05");
	});

	it("shows anything it cannot read exactly as it came", () => {
		// The raw value is at least the truth; a confident wrong date is not.
		expect(formatDateTime("ontem")).toBe("ontem");
		expect(formatDateTime("2026-09-29")).toBe("2026-09-29");
	});
});
