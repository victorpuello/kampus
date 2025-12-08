// Service Worker desactivado para desarrollo
// Esto forzará al navegador a reemplazar el SW antiguo que está causando errores
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forzar activación inmediata
});

self.addEventListener('activate', (event) => {
  // Tomar control inmediato de todos los clientes para asegurar que la versión antigua se elimine
  event.waitUntil(self.clients.claim());
});

// Hemos eliminado el evento 'fetch' para que el SW deje de interceptar y bloquear las peticiones de red.

