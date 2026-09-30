/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

// The bundle is built INTO the Flask application, at app/static/dist, because
// that is the directory app/spa.py serves index.html and /assets/* from.
// Copying a build output around afterwards is one more step to forget, and the
// failure it produces -- a server serving last week's bundle -- is silent.
const outDir = resolve(here, "../app/static/dist");

// The lab server's own address. The SPA is served by it in production; in
// development Vite serves the SPA and forwards the API to it, so a screen can
// be developed without building.
const apiOrigin = "http://127.0.0.1:8000";

/**
 * Whether this dev server has a lab server to talk to.
 *
 * With the mock (VITE_MOCK=1, src/dev/mock.ts) there is none, and the proxy
 * would answer every API and admin path with a connection error BEFORE Vite's
 * SPA fallback could serve index.html -- so the admin screens could not be
 * opened at all. The mock serves those paths itself, which is the whole point
 * of it.
 */
const useMock = process.env.VITE_MOCK === "1";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": resolve(here, "./src") } },
	server: {
		proxy: useMock
			? {}
			: {
					"/api": { target: apiOrigin, changeOrigin: false },
					// The admin tree lives under a path only the server knows
					// (config.toml's `admin_path`, e.g. /professor-kqzt). It is not a
					// fixed prefix the way /api is, so every admin path the app could be
					// served at is matched by its documented shape: `/professor-…`.
					"^/professor-[^/]*": { target: apiOrigin, changeOrigin: false },
				},
	},
	build: {
		outDir,
		// The directory is build output and nothing else -- nothing committed
		// lives in it -- so a stale hashed chunk from a previous build is
		// cleared rather than left behind to be served forever.
		emptyOutDir: true,
		// Hashed filenames are what makes the immutable cache header on
		// /assets/ safe; index.html is served no-store and points at the
		// current hashes.
		assetsDir: "assets",
		sourcemap: false,
		target: "es2022",
	},
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
