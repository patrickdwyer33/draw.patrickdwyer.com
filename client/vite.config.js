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
				// Do NOT precache HTML. Precached HTML is served cache-first and goes
				// stale after a deploy: the old cached page references JS hashes the new
				// build no longer has -> scripts fail -> white page (fixed only by a
				// shift-refresh that bypasses the SW). Hashed JS/CSS are content-addressed,
				// so precaching THOSE is safe.
				globPatterns: ["**/*.{js,css,svg,png,ico,webp,pdf,woff2}"],
				// MPA: do not SPA-fallback navigations to index.html (that would serve the
				// drawing page for /simulate). Let navigations reach the server, which
				// routes /simulate -> simulate.html.
				navigateFallback: null,
				// Navigations are network-first: always fetch fresh HTML when online, fall
				// back to the runtime cache only when offline. This is the white-page fix.
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === "navigate",
						handler: "NetworkFirst",
						options: {
							cacheName: "html-navigations",
							networkTimeoutSeconds: 3,
						},
					},
				],
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
