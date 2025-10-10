// En tu archivo sw.js
const CACHE_NAME = 'catalogo-vendedor-cache-v3'; // <-- IMPORTANTE: Nueva versión
const urlsToCache = [
    // LISTA MÁS LIMPIA Y SEGURA:
    '/',
    'index.html',
    'manifest.json',
    'Resultado_Final.json',
    'logos/AROMOTOR.png'
    // Hemos quitado los enlaces externos (CDN)
];

self.addEventListener('install', event => {
    console.log(`[SW] Evento: Instalando ${CACHE_NAME}...`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cache abierto. Guardando archivos base...');
                return cache.addAll(urlsToCache)
                    .then(() => {
                        console.log('[SW] Archivos base guardados. Buscando imágenes de productos...');
                        return fetch('Resultado_Final.json');
                    })
                    .then(response => {
                         if (!response.ok) {
                            throw new Error(`[SW] Falló el fetch de Resultado_Final.json: ${response.statusText}`);
                         }
                         return response.json();
                    })
                    .then(products => {
                        const imageUrls = products.map(product => {
                            const ref = product['Referencia Interna'];
                            return ref ? `images/${ref}.webp` : null;
                        }).filter(url => url !== null);
                        
                        console.log(`[SW] Encontradas ${imageUrls.length} imágenes para guardar.`);
                        return cache.addAll(imageUrls);
                    })
                    .then(() => {
                        console.log('[SW] ¡Todas las imágenes fueron guardadas en caché exitosamente!');
                    });
            })
            .catch(err => {
                console.error('[SW] La instalación falló:', err);
            })
    );
});

self.addEventListener('activate', event => {
    console.log(`[SW] Evento: Activando ${CACHE_NAME}...`);
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log(`[SW] Borrando caché antiguo: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Reclamo de clientes activado. El SW tiene el control.');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Si no está en caché, lo busca en la red Y lo guarda para la próxima vez
                return fetch(event.request).then(
                    networkResponse => {
                        // Verificamos que sea una respuesta válida antes de guardarla
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                            return networkResponse;
                        }

                        // Clonamos la respuesta porque es un "stream" y solo se puede consumir una vez
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                );
            })
    );
});