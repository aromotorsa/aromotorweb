// Contenido para public/sw.js
const CACHE_NAME = 'catalogo-cache-v3'; // Aumentamos la versión para forzar la actualización

self.addEventListener('install', event => {
    console.log('SW: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: Cache abierto');
            return cache.addAll(['./', 'index.html', '/logos/AROMOTOR.png']);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('SW: Activado.');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Borrando caché antiguo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
   const requestUrl = new URL(event.request.url);
   if (requestUrl.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request).then(networkResponse => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(() => {
                return caches.match(event.request);
            })
        );
        return;
   }
   event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
   );
});