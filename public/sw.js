const CACHE_NAME = 'aromotor-pro-cache-v2';
const urlsToCache = [
    '/',
    'index.html',
    'Resultado_Final.json',
    'logos/AROMOTOR.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

self.addEventListener('install', event => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cache abierto, guardando App Shell y datos.');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('[SW] Falló el cacheo del App Shell', err))
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Activado.');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Limpiando caché antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request).then(
                    networkResponse => {
                        // --- INICIO DE LA CORRECCIÓN ---
                        // Solo intentamos guardar en caché si es una petición web estándar (http o https)
                        if (event.request.url.startsWith('http')) {
                            return caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            });
                        }
                        // Si no es una petición web, simplemente la devolvemos sin cachearla.
                        return networkResponse;
                        // --- FIN DE LA CORRECCIÓN ---
                    }
                ).catch(() => {
                    // Manejo de error si la red falla
                });
            })
    );
});

self.addEventListener('message', event => {
    if (event.data.type === 'CACHE_IMAGES') {
        console.log('[SW] Recibida orden de cachear imágenes.');
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => {
                    console.log(`[SW] Cacheando ${event.data.urls.length} imágenes.`);
                    return cache.addAll(event.data.urls);
                })
                .then(() => {
                    console.log('[SW] Todas las imágenes han sido cacheadas.');
                    event.source.postMessage({ type: 'CACHE_COMPLETE' });
                })
                .catch(err => {
                    console.error('[SW] Error al cachear imágenes:', err);
                })
        );
    }
});

