/* Web Push handling, loaded into the Workbox service worker through importScripts (see vite.config.ts). */
/* global self, clients */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  // Same-site paths only ("//host" would leave the site).
  const url = typeof data.url === 'string' && /^\/(?!\/)/.test(data.url) ? data.url : '/dashboard'
  event.waitUntil(
    self.registration.showNotification(data.title || 'GradPath', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'gradpath',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin))
      if (open) return open.navigate(target).then((w) => (w || open).focus())
      return clients.openWindow(target)
    }),
  )
})
