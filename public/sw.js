const CACHE_NAME = 'catalogo-vendedor-cache-v1';
// Lista de archivos esenciales para que la app funcione offline.
    const urlsToCache = [
        '/',
        'index.html',
        'manifest.json',
        'Resultado_Final.json',
        'logos/AROMOTOR.png',
        'https://cdn.tailwindcss.com',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
    ];

// Evento de Instalación: Se dispara cuando el Service Worker se instala.
self.addEventListener('install', event => {
    console.log('Service Worker: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cache abierto, guardando archivos esenciales.');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.error('Service Worker: Falló el cacheo inicial', err);
            })
    );
});

// Evento de Fetch: Se dispara cada vez que la página pide un recurso (CSS, JS, imagen, etc.).
self.addEventListener('fetch', event => {
    event.respondWith(
        // 1. Busca el recurso en el caché.
        caches.match(event.request)
            .then(response => {
                if (response) {
                    // Si está en caché, lo devuelve directamente. Es rápido y funciona offline.
                    // console.log(`Service Worker: Sirviendo desde caché: ${event.request.url}`);
                    return response;
                }
                
                // 2. Si no está en caché, lo busca en la red.
                // console.log(`Service Worker: Buscando en la red: ${event.request.url}`);
                return fetch(event.request)
                    .then(networkResponse => {
                        // 3. Y si lo encuentra, lo guarda en caché para la próxima vez.
                        return caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, networkResponse.clone());
                                return networkResponse;
                            });
                    });
            })
            .catch(error => {
                // Si todo falla (ej. sin conexión y sin caché), puedes mostrar una página de fallback.
                console.error('Service Worker: Error en fetch', error);
                // Opcional: caches.match('/offline.html');
            })
    );
});

// Evento de Activación: Se usa para limpiar cachés antiguos si actualizas el CACHE_NAME.
self.addEventListener('activate', event => {
    console.log('Service Worker: Activando...');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log(`Service Worker: Borrando caché antiguo: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});