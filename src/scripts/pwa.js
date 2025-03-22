import { registerSW } from "virtual:pwa-register";

export default function initPWA(period) {
	/**@type {(reloadPage?: boolean) => Promise<void>}*/
	let refreshSW;

	/* eslint-disable no-unused-vars */
	const refreshCallback = () => refreshSW?.(true);
	/* eslint-enable no-unused-vars */

	let swActivated = false;

	window.addEventListener("load", () => {
		refreshSW = registerSW({
			immediate: true,
			onRegisteredSW(swUrl, r) {
				if (period <= 0) return;
				if (r?.active?.state === "activated") {
					swActivated = true;
					registerPeriodicSync(period, swUrl, r);
				} else if (r?.installing) {
					r.installing.addEventListener("statechange", (e) => {
						/**@type {ServiceWorker}*/
						const sw = e.target;
						swActivated = sw.state === "activated";
						if (swActivated) registerPeriodicSync(period, swUrl, r);
					});
				}
			},
		});
	});
}

/**
 * This function will register a periodic sync check every period milliseconds, you can modify the interval as needed.
 *
 * @param period {number}
 * @param swUrl {string}
 * @param r {ServiceWorkerRegistration}
 */
function registerPeriodicSync(period, swUrl, r) {
	if (period <= 0) return;

	setInterval(async () => {
		if ("onLine" in navigator && !navigator.onLine) return;

		const resp = await fetch(swUrl, {
			cache: "no-store",
			headers: {
				cache: "no-store",
				"cache-control": "no-cache",
			},
		});

		if (resp?.status === 200) await r.update();
	}, period);
}
