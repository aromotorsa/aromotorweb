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
                        if (event.request.url.startsWith('http')) {
                            return caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            });
                        }
                        return networkResponse;
                    }
                ).catch(() => {
                    // Manejo de error si la red falla
                });
            })
    );
});


async function cacheUrlsOneByOne(cacheName, urls) {
    const cache = await caches.open(cacheName);
    let failures = 0;
    for (const url of urls) {
        try {
            // Creamos una nueva Request para asegurarnos de que no use el caché existente
            const request = new Request(url, { cache: 'reload' });
            await cache.add(request);
        } catch (error) {
            failures++;
            console.warn(`[SW] No se pudo cachear la URL: ${url}`);
        }
    }
    return failures;
}

self.addEventListener('message', event => {
    if (event.data.type === 'CACHE_IMAGES') {
        console.log('[SW] Recibida orden de cachear imágenes de forma robusta.');
        event.waitUntil(
            cacheUrlsOneByOne(CACHE_NAME, event.data.urls)
                .then((failures) => {
                    console.log(`[SW] Proceso de cacheo completado. Fallaron ${failures} imágenes.`);
                    event.source.postMessage({ type: 'CACHE_COMPLETE' });
                })
        );
    }
});


