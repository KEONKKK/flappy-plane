// Service worker של Flappy Plane: שומר את כל קובצי המשחק במטמון כדי
// שהמשחק יעבוד גם בלי אינטרנט, ומתעדכן כשה-CACHE_VERSION משתנה.
"use strict";

const CACHE_VERSION = "v2";
const CACHE_NAME = `flappy-plane-${CACHE_VERSION}`;

// רק קבצים מאותו מקור — קבצים חיצוניים (כמו גופן Google Fonts) נכנסים
// למטמון אוטומטית דרך מאזין ה-fetch בהמשך, כדי לא להפיל את ההתקנה אם
// הבקשה החיצונית נכשלת.
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

// Cache-first עם רענון ברקע (stale-while-revalidate): תגובה מהירה ומוכנה
// גם במצב לא מקוון, ובמקביל שולפים גרסה טרייה ושומרים אותה לטעינה הבאה.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
