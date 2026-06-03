const CACHE_NAME = 'bloom-salon-pwa-v14';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// Instalación: Cachea los recursos estáticos principales
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activación: Limpia cachés antiguos si se actualiza la versión
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Estrategia Cache-First para recursos locales (Network fallback para Firestore/APIs)
self.addEventListener('fetch', (event) => {
    // Ignorar las llamadas a Firestore/APIs externas para que siempre busquen la red
    if (event.request.url.includes('firestore') || event.request.url.includes('firebase')) return;
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});