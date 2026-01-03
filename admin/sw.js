const CACHE_NAME = 'lanchonete-v2';
const urlsToCache = [
  './menu.html',
  './css/menu.css',
  './js/menu.js',
  './js/firebase-config.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Força atualização imediata
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Tenta adicionar arquivos, mas não trava se um falhar (opcional)
        return cache.addAll(urlsToCache).catch(err => console.log("Cache warning:", err));
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se tem no cache, retorna. Se não, busca na rede.
        if (response) return response;
        return fetch(event.request).catch(() => {
           // Se falhar (offline e sem cache), apenas retorna nada ou uma página offline se tivesse
           // Isso evita o erro vermelho no console
        });
      })
  );
});