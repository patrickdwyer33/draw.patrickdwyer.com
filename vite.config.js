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

			// uncomment if you want to test pwa in dev env
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
	},
});
