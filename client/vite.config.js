import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: false,

			pwaAssets: {
				disabled: false,
				config: true,
			},

			manifest: {
				name: "draw.patrickdwyer.com",
				short_name: "draw",
				description: "Draws using physics based simulation",
				theme_color: "#D3D3FF",
			},

			workbox: {
				globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,pdf,woff2}"],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
			},

			// Uncomment if you want to test pwa in dev env
			// devOptions: {
			// 	enabled: true,
			// 	suppressWarnings: false,
			// 	type: "module",
			// },
		}),
	],

	// Add CORS configuration for the dev server
	server: {
		cors: {
			origin: "*", // Allow requests from any origin
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		},
		fs: { allow: ["..", "../shared"] },
	},

	resolve: {
		alias: {
			client: "/client",
			"/shared": new URL("../shared", import.meta.url).pathname,
		},
	},

	// This is a MULTI-PAGE app (drawing page + simulate page). Without listing both
	// HTML entries here, `vite build` emits only index.html, so /simulate falls back
	// to the drawing page in production (dev works because the Vite MPA middleware
	// serves simulate.html from source). Keep this in sync with the server routes.
	build: {
		rollupOptions: {
			input: {
				main: new URL("./index.html", import.meta.url).pathname,
				simulate: new URL("./simulate.html", import.meta.url).pathname,
			},
		},
	},
});
