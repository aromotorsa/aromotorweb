const CACHE_NAME = 'aromotor-pro-cache-v4'; // 1. ¡VERSIÓN INCREMENTADA!
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
            .then(() => {
                // 2. ¡AÑADIDO MÁGICO! Fuerza al SW a activarse de inmediato.
                return self.skipWaiting();
            })
            .catch(err => console.error('[SW] Falló el cacheo del App Shell', err))
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Activado y tomando el control.');
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
        }).then(() => {
            // 3. ¡AÑADIDO MÁGICO! Asegura que el SW controle la página actual.
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    // Ignoramos las peticiones que no son GET
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Estrategia: Network First para el HTML principal y el JSON de datos
    // Así siempre tenemos la última versión si hay conexión.
    if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/Resultado_Final.json')) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // Si la respuesta de la red es buena, la clonamos y la guardamos en caché para el futuro modo offline
                    if (networkResponse.ok) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Si la red falla (estamos offline), entonces buscamos en la caché.
                    console.log(`[SW] Red falló para ${url.pathname}. Sirviendo desde caché.`);
                    return caches.match(event.request);
                })
        );
    } else {
        // Estrategia: Cache First para todo lo demás (CSS, imágenes, fuentes, etc.)
        // Son archivos estáticos, es más rápido servirlos desde la caché.
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return fetch(event.request).then(networkResponse => {
                        // Solo cacheamos respuestas válidas
                        if (!networkResponse || networkResponse.status !== 200 || !url.protocol.startsWith('http')) {
                            return networkResponse;
                        }
                        
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                        return networkResponse;
                    });
                })
        );
    }
});

async function cacheUrlsInParallel(cacheName, urls) {
    const cache = await caches.open(cacheName);
    const failedUrls = [];

    const promises = urls.map(url => {
        return (async () => {
            try {
                const request = new Request(url, { cache: 'reload' });
                await cache.add(request);
                return { status: 'fulfilled' };
            } catch (error) {
                console.warn(`[SW] No se pudo cachear la URL: ${url}`);
                failedUrls.push(url);
                return { status: 'rejected' };
            }
        })();
    });

    await Promise.all(promises);
    return failedUrls;
}

self.addEventListener('message', event => {
    if (event.data.type === 'CACHE_IMAGES') {
        console.log('[SW] Recibida orden de cachear imágenes en PARALELO.');
        event.waitUntil(
            cacheUrlsInParallel(CACHE_NAME, event.data.urls)
                .then((failedUrls) => {
                    console.log(`[SW] Proceso de cacheo completado. Fallaron ${failedUrls.length} imágenes.`);
                    if (event.source) {
                        event.source.postMessage({ type: 'CACHE_COMPLETE', failedUrls: failedUrls });
                    }
                })
        );
    }
});