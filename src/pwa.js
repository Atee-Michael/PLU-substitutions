import { registerSW } from "virtual:pwa-register";

/**
 * Registers the service worker for PWA features:
 * offline caching and installability (Add to Home Screen).
 */
export function setupPWA() {
  registerSW({ immediate: true });
}
