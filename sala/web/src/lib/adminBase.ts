/**
 * The admin tree's own path is a deployment fact, not a constant.
 *
 * `config.toml`'s `admin_path` (e.g. `/professor-kqzt`) is injected by the
 * server into <head> as a meta tag, and the SPA shows the admin application
 * only when that tag is present. The path is therefore never written into the
 * bundle: it arrives with the page, and this module is the one place it is read
 * back out.
 */
export const ADMIN_BASE_META = "sala-admin-base";

/** normalizeBase trims a trailing slash and refuses anything that is not one rooted path. */
export function normalizeBase(value: string): string {
	const trimmed = value.trim();
	// A single leading slash, and not `//host` -- a protocol-relative URL is not
	// a path this server would ever inject, and building links out of one would
	// point them at another origin.
	if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
	const base = trimmed.replace(/\/+$/, "");
	if (base === "" || base.includes("//") || base.includes("\\")) return "";
	return base;
}

/**
 * readAdminBase answers the admin path this page was served for, or "" when
 * this is a public page.
 *
 * Read on demand rather than cached: it is one attribute lookup, and a cache
 * would be a second source of truth that a test has to remember to clear.
 */
export function readAdminBase(doc: Document = document): string {
	const meta = doc.querySelector(`meta[name="${ADMIN_BASE_META}"]`);
	return normalizeBase(meta?.getAttribute("content") ?? "");
}
