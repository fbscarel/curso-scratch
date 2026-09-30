/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** "1" serves src/dev/mock.ts instead of the lab server. Development only. */
	readonly VITE_MOCK?: string;
}
