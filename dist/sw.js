const CACHE_NAME = 'aromotor-pro-cache-v2'; // Incrementamos la versión para forzar la actualización
const urlsToCache = [
    '/',
    'index.html',
    'Resultado_Final.json',
    'logos/AROMOTOR.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

// Evento de instalación: Se dispara cuando el Service Worker se instala.
// Aquí guardamos los archivos principales de la aplicación (el "App Shell").
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

// Evento activate: Se dispara cuando el SW se activa.
// Aquí limpiamos cachés antiguos para mantener todo ordenado.
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

// Evento fetch: Se dispara cada vez que la página solicita un recurso.
// Estrategia: "Cache first, falling back to network".
self.addEventListener('fetch', event => {
    // Solo intervenimos en peticiones GET
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Si la respuesta está en el caché, la devolvemos desde ahí (¡súper rápido!)
                if (cachedResponse) {
                    // console.log('[SW] Recurso encontrado en caché:', event.request.url);
                    return cachedResponse;
                }

                // Si no está en el caché, la pedimos a la red
                // console.log('[SW] Recurso no encontrado en caché, buscando en red:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // Antes de devolverla a la página, la guardamos en el caché para la próxima vez.
                        return caches.open(CACHE_NAME).then(cache => {
                            // Clonamos la respuesta porque es un "stream" y solo se puede consumir una vez.
                            cache.put(event.request, networkResponse.clone());
                            return networkResponse;
                        });
                    }
                ).catch(() => {
                    // Si la red falla y no está en caché, no podemos hacer mucho más.
                    // Podríamos devolver una imagen o recurso placeholder aquí si quisiéramos.
                });
            })
    );
});


// Evento message: Escucha los mensajes de la página principal.
// Usado para el botón "Descargar Catálogo".
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
                    // Avisamos a la página que hemos terminado
                    event.source.postMessage({ type: 'CACHE_COMPLETE' });
                })
                .catch(err => {
                    console.error('[SW] Error al cachear imágenes:', err);
                })
        );
    }
});
