const CACHE_NAME = "taskflow-cache-v33";
const urlsToCache = [
  "./",
  "./index.html",
  "./style.css",
  "./auth.css",
  "./app.js",
  "./auth.js",
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap",
];

self.addEventListener("install", (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    }),
  );
});

// Network-First Strategy to ensure users always get the latest code
self.addEventListener("fetch", (event) => {
  // Only intercept GET requests, ignore POST/API requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with the fresh response
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => {
        // If offline, return the cached version
        return caches.match(event.request);
      }),
  );
});

self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  // Take control of all pages immediately without a refresh
  event.waitUntil(self.clients.claim());

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

// Handle Notification Clicks and Actions
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const taskId = event.notification.data
    ? event.notification.data.taskId
    : null;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Action: Mark as Done
        if (action === "mark-done" && taskId) {
          // If app is already open, focus it and tell it to mark the task as done
          for (const client of clientList) {
            if (client.url.indexOf("/") !== -1 && "focus" in client) {
              client.focus();
              client.postMessage({ type: "MARK_DONE", taskId: taskId });
              return;
            }
          }
          // If app is closed, open it with a special URL parameter
          if (self.clients.openWindow) {
            return self.clients.openWindow(
              "/?action=mark-done&taskId=" + taskId,
            );
          }
        } else {
          // Default action (just clicked notification body)
          for (const client of clientList) {
            if (client.url.indexOf("/") !== -1 && "focus" in client) {
              return client.focus();
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow("/");
          }
        }
      }),
  );
});
