// Service worker של Flappy Plane: שומר את כל קובצי המשחק במטמון כדי
// שהמשחק יעבוד גם בלי אינטרנט, ומתעדכן כשה-CACHE_VERSION משתנה.
"use strict";

// CACHE_VERSION חייב להתעדכן **יחד** עם BUILD_VERSION ב-version.js,
// לאותו ערך בדיוק, בכל שינוי. לא טוען את version.js דרך importScripts
// כאן למרות שזה אותו ערך בכוונה: זיהוי-עדכון של הדפדפן ל-Service
// Worker מבוסס על השוואת bytes של **הקובץ הזה עצמו**, לא על קבצים
// שהוא טוען — אילו CACHE_VERSION היה מגיע מ-importScripts, שינוי רק
// ב-version.js לא היה משנה את ה-bytes של הקובץ הזה, והדפדפן לא היה
// מזהה שיש גרסה חדשה להתקין בכלל (ראו design/AUDIT-2.md).
// tools/check-assets.js נכשל אם שני הקבצים לא תואמים.
const CACHE_VERSION = "v20";
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
  "./version.js",
  "./assets/background-city.png",
  "./assets/headline.png",
  "./design/raw/ENTRANCE.gif",
  "./assets/tower-round.png",
  "./assets/tower-square.png",
  "./assets/tower-triangle.png",
  "./assets/tower_base.png",
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

// עונה ל-GET_VERSION מכל קליינט (game.js, ראו reportBuildVersion שם):
// מקור-האמת היחיד ל"מה רץ באמת" הוא ה-Service Worker *הפעיל* עצמו, לא
// קובץ JS סטטי שאפשר לפספס עדכון שלו — ראו ההערה למעלה על CACHE_VERSION
// ו-design/AUDIT-2.md. event.ports[0] קיים כי game.js שולח עם
// MessageChannel (לא postMessage רגיל, כדי לקבל תשובה ממוקדת לבקשה הזו
// בלבד, לא broadcast).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage({ type: "VERSION", version: CACHE_VERSION });
  }
});

// שתי אסטרטגיות fetch, לפי סוג הקובץ — לא אחידה כמו קודם:
//
// תמונות/GIF (רקע, מגדלים, לוגו, אנימציית כניסה): מטמון-קודם עם רענון
// ברקע. אלו קבצים כבדים יחסית שכמעט אף פעם לא משתנים בין טעינה לטעינה
// של אותו משתמש — מטמון-קודם נותן תצוגה מיידית בלי לחכות לרשת, ועדיין
// מתעדכן ברקע לטעינה הבאה (stale-while-revalidate קלאסי). "stale" כאן
// זניח: גם בתרחיש הגרוע (תמונה התעדכנה והמשתמש עדיין רואה את הישנה
// לרגע), התוכן עצמו מגיע תמיד מהמטמון של *הגרסה הנוכחית* (CACHE_NAME),
// כי activate כבר מחק את כל הגרסאות הישנות — אין סיכון "לתקוע" קוד.
//
// הכל השאר (HTML/JS/CSS/manifest — קבצים שמכילים *לוגיקה*, לא רק
// תוכן): רשת-קודם, בלי שום פשרה. בקבצים האלה דווקא "רגע של תוכן ישן"
// הוא הבעיה המרכזית שכל השיחה הזו עסקה בה (ראו ההערה שהייתה כאן קודם
// ו-AUDIT-2.md) — אז אין להם בכלל את שלב ה"stale מותר", רק רשת, עם
// נפילה למטמון רק כשהרשת *לגמרי* לא זמינה.
//
// בשני המסלולים: cache:"no-store" על ה-fetch הפנימי (לא רק cache.put
// שלנו) — בלי זה, הדפדפן עלול להחזיר heuristic HTTP cache משלו בלי
// לגעת ברשת כלל, אותה תקלה בשכבה אחרת (python -m http.server לא שולח
// Cache-Control/ETag). ושני המסלולים **לעולם** לא פותרים ל-undefined —
// respondWith תמיד מקבל Response אמיתי, גם במקרה הגרוע ביותר (רשת
// נכשלה וגם אין כלום במטמון).
const IMAGE_PATTERN = /\.(?:png|gif|jpe?g|webp|svg|ico)$/i;

function cacheFirstWithRevalidate(event) {
  return caches.match(event.request).then((cached) => {
    const networkFetch = fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => cached || new Response(null, { status: 504, statusText: "Offline and not cached" }));
    return cached || networkFetch;
  });
}

function networkFirst(event) {
  return fetch(event.request, { cache: "no-store" })
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })
    .catch(() =>
      caches
        .match(event.request)
        .then((cached) => cached || new Response(null, { status: 504, statusText: "Offline and not cached" }))
    );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isImage = IMAGE_PATTERN.test(url.pathname);
  event.respondWith(isImage ? cacheFirstWithRevalidate(event) : networkFirst(event));
});
