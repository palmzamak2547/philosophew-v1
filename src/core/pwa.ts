// The service worker (public/sw.js) lets the app open offline after one visit. Production only: dev must never
// serve cached modules. Each deploy's worker installs in the background, takes over at once and keeps the build
// before it for one more round, so a tab still running that build can finish opening its pages; the next page
// load is the new build (pages come from the network first).
export function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    // the worker script itself always comes from the server, never from the browser's HTTP cache
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      // an app left open for days still hears about new deploys: look again when it comes back to the front
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || Date.now() - checked < 30 * 60 * 1000) return;
        checked = Date.now();
        reg.update().catch(() => { /* offline: next time */ });
      });
    }).catch(() => { /* offline mode is a bonus, never a blocker */ });
  });
}
