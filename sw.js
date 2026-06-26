// sw.js
// SELF-DESTRUCTING SERVICE WORKER

self.addEventListener('install', (event) => {
    // Force the updated worker to take control instantly without waiting
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // 1. Delete all existing application cache buckets completely
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    console.log('Clearing Service Worker Cache:', key);
                    return caches.delete(key);
                })
            );
        }).then(() => {
            // 2. Unregister this service worker from the browser runtime environment
            return self.registration.unregister();
        }).then(() => {
            console.log('Service worker self-destruct operation complete.');
        })
    );
});
