// ════════════════════════════════════════
//   Admin Service Worker — OmniService TG
//   v3 — domaine omniservice.tg
// ════════════════════════════════════════
const CACHE_NAME = 'omniservice-admin-v3';

const STATIC_ASSETS = [
  '/admin/',
  '/admin/index.html',
  'https://omniservice.tg/assets/logo.png',
  'https://omniservice.tg/assets/icon-any-192.png',
  'https://omniservice.tg/assets/icon-maskable-512.png'
];

// ── Installation ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[Admin SW] Non mis en cache :', url, err)
          )
        )
      )
    ).then(() => {
      console.log('[Admin SW] Installation terminée');
      return self.skipWaiting();
    })
  );
});

// ── Activation ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[Admin SW] Suppression ancien cache :', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : Network-First ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Firebase / API → toujours réseau
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

  // Google Fonts → Cache-First
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
          if (event.request.destination === 'document') {
            return new Response(
              `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin — Hors ligne</title>
              <style>body{font-family:sans-serif;background:#0a1220;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;gap:16px;text-align:center}
              h1{font-size:24px;margin:0}p{color:rgba(255,255,255,.5);font-size:13px}
              button{background:#1E6FBE;color:#fff;border:none;border-radius:999px;padding:12px 24px;font-size:14px;cursor:pointer;margin-top:8px}</style></head>
              <body><div style="font-size:48px">🛡️</div><h1>Administration hors ligne</h1>
              <p>Vérifiez votre connexion internet pour accéder au panneau admin.</p>
              <button onclick="location.reload()">↻ Réessayer</button></body></html>`,
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          }
        });
      })
  );
});
