const CACHE_NAME = 'aromotor-pro-cache-v3'; // Aumentamos la versión para forzar la actualización
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
                    // Borramos cachés antiguos
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


// --- INICIO DE LA CORRECCIÓN ULTRARRÁPIDA ---
async function cacheUrlsInParallel(cacheName, urls) {
    const cache = await caches.open(cacheName);
    
    // Convertimos cada URL en una promesa de cacheo.
    // Cada promesa intentará cachear su URL. Si falla, no romperá las demás.
    const promises = urls.map(url => {
        return (async () => {
            try {
                const request = new Request(url, { cache: 'reload' });
                await cache.add(request);
                return { status: 'fulfilled' };
            } catch (error) {
                console.warn(`[SW] No se pudo cachear la URL: ${url}`);
                return { status: 'rejected' };
            }
        })();
    });

    // Esperamos a que TODAS las promesas terminen (éxito o fracaso).
    const results = await Promise.all(promises);
    
    // Contamos cuántas fallaron.
    const failures = results.filter(result => result.status === 'rejected').length;
    return failures;
}

self.addEventListener('message', event => {
    if (event.data.type === 'CACHE_IMAGES') {
        console.log('[SW] Recibida orden de cachear imágenes en PARALELO.');
        event.waitUntil(
            cacheUrlsInParallel(CACHE_NAME, event.data.urls)
                .then((failures) => {
                    console.log(`[SW] Proceso de cacheo completado. Fallaron ${failures} imágenes.`);
                    event.source.postMessage({ type: 'CACHE_COMPLETE' });
                })
        );
    }
});
// --- FIN DE LA CORRECCIÓN ULTRARRÁPIDA ---

