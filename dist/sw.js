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
    // Ignoramos peticiones que no sean GET
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Estrategia: Stale-While-Revalidate para el JSON de productos
    if (url.pathname.endsWith('Resultado_Final.json')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    // Ir a la red para actualizar en segundo plano
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        // Clonar la respuesta para poder guardarla y devolverla
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });

                    // Devolver la respuesta del caché inmediatamente si existe,
                    // si no, esperar a la respuesta de la red.
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return; // Detenemos la ejecución aquí para el JSON
    }
    
    // Estrategia: Cache First para todas las demás peticiones (imágenes, CSS, etc.)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Si está en caché, lo devolvemos
            if (cachedResponse) {
                return cachedResponse;
            }
            // Si no, vamos a la red, lo cacheamos y lo devolvemos
            return fetch(event.request).then(networkResponse => {
                // Solo cacheamos respuestas válidas
                if (!networkResponse || networkResponse.status !== 200 || !event.request.url.startsWith('http')) {
                    return networkResponse;
                }
                
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            });
        })
    );
});


async function cacheUrlsInParallel(cacheName, urls) {
    const cache = await caches.open(cacheName);

    const promises = urls.map(url => {
        return (async () => {
            try {
                // Usamos 'reload' para asegurarnos de que no usamos una versión cacheada por el navegador (HTTP cache)
                const request = new Request(url, { cache: 'reload' });
                await cache.add(request);
                return { status: 'fulfilled' };
            } catch (error) {
                console.warn(`[SW] No se pudo cachear la URL: ${url}`);
                return { status: 'rejected' };
            }
        })();
    });

    const results = await Promise.all(promises);
    const failures = results.filter(result => result.status === 'rejected').length;
    return failures;
}

self.addEventListener('message', event => {
    if (event.data.type === 'CACHE_IMAGES') {
        console.log('[SW] Recibida orden de cachear imágenes en PARALELO.');
        event.waitUntil(
            cacheUrlsInParallel(CACHE_NAME, event.data.urls)
                .then((failures) => {
                    console.log(`[SW] Procesoself.addEventListener('fetch' de cacheo completado. Fallaron ${failures} imágenes.`);
                    // Es importante asegurarse de que event.source no sea nulo antes de enviar el mensaje
                    if (event.source) {
                        event.source.postMessage({ type: 'CACHE_COMPLETE' });
                    }
                })
        );
    }
});