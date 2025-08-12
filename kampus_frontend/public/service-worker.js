self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('kampus-static-v1').then((cache) => cache.addAll(['/','/index.html','/vite.svg']))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // network-first para peticiones de API, cache-first para estáticos
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response
        })
        .catch(() => caches.match(request))
    )
  } else {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    )
  }
})

