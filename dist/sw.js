// En tu archivo sw.js

const CACHE_NAME = 'catalogo-vendedor-cache-v2'; // <-- NUEVO: Cambiamos la versión para forzar la actualización
const urlsToCache = [
    '/',
    'index.html',
    'manifest.json',
    'Resultado_Final.json',
    'logos/AROMOTOR.png',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

self.addEventListener('install', event => {
    console.log('Service Worker: Instalando v2...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cache abierto, guardando archivos esenciales.');
                // Primero guardamos los archivos base
                return cache.addAll(urlsToCache)
                    .then(() => {
                        console.log('Service Worker: Archivos base guardados. Ahora buscando imágenes de productos...');
                        // Ahora, vamos por las imágenes de los productos
                        return fetch('Resultado_Final.json')
                            .then(response => response.json())
                            .then(products => {
                                const imageUrls = products.map(product => {
                                    const ref = product['Referencia Interna'];
                                    // Aseguramos que solo añadimos URLs válidas
                                    if (ref) {
                                        return `images/${ref}.webp`;
                                    }
                                    return null;
                                }).filter(url => url !== null); // Filtramos cualquier producto sin referencia

                                console.log(`Service Worker: Encontradas ${imageUrls.length} imágenes para guardar en caché.`);
                                return cache.addAll(imageUrls);
                            });
                    });
            })
            .catch(err => {
                console.error('Service Worker: Falló el cacheo inicial', err);
            })
    );
});

// El evento 'fetch' puede quedarse igual, pero lo optimizamos un poco
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Si está en caché, lo devuelve
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Si no, va a la red
                return fetch(event.request);
            })
    );
});


// Evento de Activación: Limpia los cachés antiguos
self.addEventListener('activate', event => {
    console.log('Service Worker: Activando v2...');
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