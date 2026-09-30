import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

/**
 * boot installs the development mock before anything renders, then mounts.
 *
 * The import is DYNAMIC and cannot be static: a static import would pull
 * src/dev/mock.ts into the production bundle, and the mock must not exist there
 * at all. `import.meta.env.DEV` is replaced with `false` in a production build,
 * so this branch -- and the import inside it -- is dropped by the bundler.
 * src/dev/mock.ts carries the string the built output is grepped for to prove
 * it.
 */
async function boot(): Promise<void> {
	if (import.meta.env.DEV && import.meta.env.VITE_MOCK === "1") {
		const { installMock } = await import("@/dev/mock");
		installMock();
	}
	const root = document.getElementById("root");
	if (!root) throw new Error("no #root element in the document");
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

void boot();
