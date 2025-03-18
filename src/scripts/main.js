import { initPWA } from "./pwa.js";

// check for updates every minute
const period = 60 * 1000;
initPWA(period);
