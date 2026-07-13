// Self-destructing service worker to clear any stale registered service workers from previous projects on localhost:3000
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.registration.unregister()
    .then(() => self.clients.matchAll())
    .then((clients) => {
      clients.forEach((client) => {
        if (client.navigate) {
          client.navigate(client.url);
        }
      });
    });
});
