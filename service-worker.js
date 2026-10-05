// Service worker של Flappy Plane: שומר את כל קובצי המשחק במטמון כדי
// שהמשחק יעבוד גם בלי אינטרנט, ומתעדכן כשה-CACHE_VERSION משתנה.
"use strict";

const CACHE_VERSION = "v14";
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
  "./assets/background-city.png",
  "./assets/tower-round.png",
  "./assets/tower-square.png",
  "./assets/tower-triangle.png",
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

// רשת-קודם, מטמון כגיבוי (network-first): כל בקשה מנסה קודם לרדת מהרשת;
// רק אם זה נכשל (למשל אופליין) חוזרים למה שבמטמון. **זה היה stale-while-
// revalidate (מטמון-קודם) קודם — שונה בכוונה**: תחת cache-first, ברגע
// שקובץ כלשהו נכנס למטמון תחת גרסה מסוימת, הוא *תמיד* הועדף על פני
// הרשת, גם כשברקע קודם לכן כבר נשלפה גרסה טרייה — זו רק מתעדכנת
// ב-cache.put בשביל הטעינה *הבאה*, לא הטעינה הנוכחית. בפיתוח פעיל (הקובץ
// הזה משתנה כל כמה דקות) זו בדיוק המתכון ל"עשיתי שינוי, שום דבר לא
// קרה": אם מישהו שכח להעלות את CACHE_VERSION באותו קומיט ששינה game.js
// (זה קרה בפועל — ראו 30f20ae בהיסטוריה), או שהטאב כבר פתוח מקודם, אין
// שום מנגנון שמעדיף תוכן טרי על פני מטמון ישן באותה טעינה. network-first
// הופך את זה: כל עוד יש אינטרנט (המצב הנפוץ בפיתוח/שימוש רגיל), תמיד
// רואים את הגרסה העדכנית ביותר בפועל, בלי תלות בלוגיקת גרסאות נכונה.
// התמיכה-אופליין עדיין קיימת במלואה (ה-catch חוזר למטמון), רק כבר לא
// ברירת המחדל כשיש רשת.
//
// cache: "no-store" על ה-fetch עצמו (לא רק on-disk cache.put שלנו): בלי
// זה, "network-first" עדיין יכול להיתקע — fetch() כפוף למטמון ה-HTTP
// הרגיל של הדפדפן (לא ה-Cache API של ה-SW), וללא כותרות Cache-Control
// מפורשות מהשרת (python -m http.server שולח רק Last-Modified, לא
// Cache-Control/ETag) הדפדפן מפעיל "heuristic freshness" ומחזיר תשובה
// מהמטמון-ההיסטי שלו בלי לגעת ברשת בכלל — אותה תקלה בדיוק, רק בשכבה
// אחרת. no-store מכריח בקשת רשת אמיתית בכל פעם.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
