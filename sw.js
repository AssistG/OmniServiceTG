/* ══════════════════════════════════════════
   OmniService TG — Service Worker (PWA)
   v5 — Auth téléphone
   ══════════════════════════════════════════ */

const CACHE_NAME = 'omniservice-v5';

// ⚠️ Ne lister QUE les fichiers qui existent réellement sur le serveur.
// Un seul fichier manquant fait échouer toute l'installation du SW.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.png'
  // style.css et app.js sont omis : ils seront cachés via Network-First
  // sans bloquer l'installation du SW.
];

// ── Installation : mise en cache individuelle (robuste) ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll() atomique remplacé par ajouts individuels :
      // une ressource manquante ne fait plus échouer toute l'install
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Ressource non mise en cache :', url, err)
          )
        )
      );
    }).then(() => {
      console.log('[SW] Installation terminée');
      return self.skipWaiting();
    })
  );
});

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Suppression ancien cache :', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : Network-First avec fallback cache ──
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Firebase / API → toujours réseau, jamais mis en cache
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('cloudfunctions.net')
  ) {
    return;
  }

  // Google Fonts → Cache-First (immuables)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Tout le reste → Network-First
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback vers index.html pour les navigations
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
