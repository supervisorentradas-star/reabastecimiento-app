// Service Worker para Recolección SOKSO
const CACHE_NAME = 'sokso-recoleccion-v1.0.0';
const OFFLINE_URL = 'interfaz-recoleccion.html';

const ASSETS_TO_CACHE = [
  'interfaz-recoleccion.html',
  'app-mobile.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Cacheando archivos esenciales...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase requests
  if (event.request.url.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // Otherwise fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache successful responses
            if (networkResponse.ok && event.request.url.startsWith('http')) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // If offline and page request, show cached page
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            return new Response('Offline', { 
              status: 503,
              statusText: 'Service Unavailable' 
            });
          });
      })
  );
});

// Background sync for pending changes
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-changes') {
    console.log('🔄 Background sync iniciado');
    event.waitUntil(syncPendingChanges());
  }
});

async function syncPendingChanges() {
  // Esta función se implementaría para sincronizar cambios pendientes
  // cuando se recupera la conexión
  console.log('Sincronizando cambios pendientes en background...');
}