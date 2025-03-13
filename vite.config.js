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
				name: "patrickdwyer.com",
				short_name: "patrickdwyer.com",
				description: "Personal resume website for Patrick Dwyer",
				theme_color: "#D3D3FF",
			},

			workbox: {
				globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,pdf,woff2}"],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
			},

			devOptions: {
				enabled: true,
				suppressWarnings: false,
				type: "module",
			},
		}),
	],
});
