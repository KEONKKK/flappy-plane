// Flappy Plane — vanilla JS + Canvas, no libraries.
"use strict";

// מספר הגרסה המוצג (קונסול + פינת מסך הפתיחה) נטען בהמשך הקובץ, אחרי
// שהעמוד מוכן — ראו reportBuildVersion() למטה. BUILD_VERSION עצמו
// מגיע מ-version.js (נטען לפני הקובץ הזה ב-index.html) — ראו שם להסבר
// המלא על למה זה קובץ נפרד ולמה זה *לא* הערך הסופי שמוצג (יש עדיפות
// לשאול את ה-Service Worker הפעיל בפועל, כשיש כזה — ראו למטה).

// כל הפרמטרים שמשפיעים על תחושת המשחק נמצאים כאן, במקום אחד.
const CONFIG = {
  WIDTH: 1067,
  HEIGHT: 600,

  GRAVITY: 0.5,          // כוח משיכה על המטוס, פיקסלים/פריים^2 (יחסי ל-60fps)
  JUMP_FORCE: -8,         // מהירות אנכית מיידית בלחיצה (שלילי = למעלה)
  MAX_FALL_SPEED: 12,     // מהירות נפילה מקסימלית
  MAX_RISE_SPEED: -10,    // מהירות עלייה מקסימלית

  TOWER_SPEED: 2.5,       // פיקסלים/פריים (יחסי ל-60fps)
  TOWER_GAP: 172,         // רווח אנכי בין שני חלקי המגדל (הורחב קצת ב"סעיף 2" כדי לפצות על מטוס גדול יותר)
  TOWER_INTERVAL: 1500,   // מילישניות בין מגדל למגדל
  TOWER_WIDTH: 70,
  // מרווח אוויר אופקי מינימלי מובטח בין קצה מגדל אחד להתחלת הבא (ראו
  // המגן ב-spawnTower). בתצורה הנוכחית (TOWER_SPEED × TOWER_INTERVAL)
  // המרווח בפועל הוא כ-155px, תמיד גדול מזה — הקבוע הזה לא "עושה" כלום
  // כרגע, הוא רשת ביטחון למקרה שמישהו יקצר את TOWER_INTERVAL בעתיד
  // (למשל קושי עולה) בלי לשים לב שזה עלול ליצור מגדלים צמודים/חופפים.
  MIN_TOWER_DISTANCE: 140,

  GROUND_HEIGHT: 40,      // גובה קו הרצפה (קולייז'ן בלבד — אין יותר ציור רצפה נפרד)

  PLANE_X: 213,                 // מיקום אופקי קבוע של המטוס
  PLANE_DISPLAY_WIDTH: 68,      // כ-6.4% מרוחב אזור המשחק (1067). הגובה *לא* קבוע כאן —
                                 // נגזר מיחס הרוחב-גובה האמיתי של נכס המטוס, בלי מתיחה
                                 // (ראו PLANE_ASSET/planeDisplayHeight למטה).
  PLANE_TILT_UP_MAX: (-20 * Math.PI) / 180,   // הטיית אף מקסימלית למעלה: 20°
  PLANE_TILT_DOWN_MAX: (25 * Math.PI) / 180,  // הטיית אף מקסימלית למטה: 25°

  CITY_PARALLAX_FACTOR: 1 / 3,  // שכבת העיר/שמיים גוללת בשליש ממהירות המגדלים
};

// נכס המטוס (assets/plane.png, מקור: design/raw/NEW_PLANE.png): מידות
// ותיבת-הפגיעה נמדדו פעם אחת מהפיקסלים בפועל, לא מוקלדים בניחוש —
// frameWidth/frameHeight הם הממדים האמיתיים של האמנות (534x282 בקובץ
// המקור הוא הגדלה פי 6 בדגימת-שכן-קרוב של 89x47 "פיקסלים אמיתיים",
// אומת שכל בלוק 6x6 אחיד). hitboxFrac מגדיר את תיבת גוף המטוס בלבד
// (בלי זנב/כנפיים/מנועים), כשברירים חלקיים של frameWidth/frameHeight:
// שורות ה"גוף" הן שורות שבהן יש רצף פיקסלים אטומים ארוך מ-70% מרוחב
// הפריים (הזנב/הכנף המחודדים אף פעם לא מגיעים לרוחב כזה), מכווץ 10%
// מכל צד כדי שפגיעה "כמעט" לא תיחשב. אם תמונת המטוס מתחלפת שוב, מודדים
// מחדש מהפיקסלים (לא מעתיקים ניחוש) ומעדכנים כאן.
const PLANE_ASSET = {
  frameWidth: 89,
  frameHeight: 47,
  hitboxFrac: { left: 0.1000, top: 0.3915, right: 0.9000, bottom: 0.6298 },
};

// הגובה היחיד שנגזר תמיד מהיחס האמיתי של הנכס, אף פעם לא קבוע עצמאי —
// כך שאם הנכס מתחלף, הגובה על המסך תמיד נשאר נאמן ליחס שלו, בלי מתיחה.
function planeDisplayHeight() {
  return CONFIG.PLANE_DISPLAY_WIDTH * (PLANE_ASSET.frameHeight / PLANE_ASSET.frameWidth);
}

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// מראה פיקסל-ארט רטרו: מציירים לתוך מאגר פיקסלים קטן בהרבה מגודל התצוגה,
// ו-CSS (image-rendering: pixelated) מגדיל אותו בלי החלקה — בדיוק כמו מסך ישן.
const PIXEL_SCALE = 0.35;
(function setupPixelCanvas() {
  canvas.width = Math.round(CONFIG.WIDTH * PIXEL_SCALE);
  canvas.height = Math.round(CONFIG.HEIGHT * PIXEL_SCALE);
  ctx.imageSmoothingEnabled = false;
  ctx.scale(PIXEL_SCALE, PIXEL_SCALE);
})();

// שכבת רקע נפרדת, ברזולוציה גבוהה והחלקה רגילה — ראו ההסבר ב-style.css
// ליד canvas#bg-city. תמונת הרקע היא תצלום מפורט (חלונות, פרטים קטנים);
// אם הייתה נדגמת מחדש יחד עם שאר המשחק לתוך מאגר ה-140×210 הזעיר למעלה
// (כמו שהיה קודם), ה-downsample ב-nearest-neighbor היה יוצר רעש/טשטוש
// (moiré) על כל פרט דחוס. 3.5x תואם את תקרת הרוחב של מסגרת הטלוויזיה
// ב-CSS (700px) כך שגם במסך רטינה היחס בין פיקסלי המקור לפיקסלי המסך
// נשאר קרוב ל-1:1 — חד בלי להיות בזבזני.
const bgCanvas = document.getElementById("bg-city");
const bgCtx = bgCanvas.getContext("2d");
const BG_SCALE = 3.5;
(function setupBackgroundCanvas() {
  bgCanvas.width = Math.round(CONFIG.WIDTH * BG_SCALE);
  bgCanvas.height = Math.round(CONFIG.HEIGHT * BG_SCALE);
  bgCtx.imageSmoothingEnabled = true;
  bgCtx.imageSmoothingQuality = "high";
  bgCtx.scale(BG_SCALE, BG_SCALE);
})();

// שכבה נוספת לאותה סיבה בדיוק: מגדלים שמצוירים מתמונה (לא וקטור) —
// כרגע רק "משולש" (ראו drawTowerSegment) — חייבים רזולוציה גבוהה +
// החלקה כדי לא ליצור moiré על רשת החלונות שלהם, בדיוק כמו הרקע.
const towerImagesCanvas = document.getElementById("tower-images");
const towerImagesCtx = towerImagesCanvas.getContext("2d");
(function setupTowerImagesCanvas() {
  towerImagesCanvas.width = Math.round(CONFIG.WIDTH * BG_SCALE);
  towerImagesCanvas.height = Math.round(CONFIG.HEIGHT * BG_SCALE);
  towerImagesCtx.imageSmoothingEnabled = true;
  towerImagesCtx.imageSmoothingQuality = "high";
  towerImagesCtx.scale(BG_SCALE, BG_SCALE);
})();

// שכבה רביעית לאותה סיבה בדיוק כמו הרקע/המגדלים: נכס המטוס
// (assets/plane.png) הוא אמנות-פיקסל אמיתית ולא וקטור — ציור שלו על
// canvas#game ברזולוציה הנמוכה שלו (PIXEL_SCALE) איבד את המתאר ואת
// החלונות כמעט לגמרי (נבדק חזותית). בניגוד ל-bg-city/tower-images,
// כאן imageSmoothingEnabled=false: זו אמנות-פיקסל עם קצוות חדים
// מכוונים, לא תצלום שצריך החלקה. ראו PLANE_ASSET למטה לפרטי הנכס.
const planeCanvas = document.getElementById("plane-layer");
const planeCtx = planeCanvas.getContext("2d");
(function setupPlaneCanvas() {
  planeCanvas.width = Math.round(CONFIG.WIDTH * BG_SCALE);
  planeCanvas.height = Math.round(CONFIG.HEIGHT * BG_SCALE);
  planeCtx.imageSmoothingEnabled = false;
  planeCtx.scale(BG_SCALE, BG_SCALE);
})();

// מעגל קואורדינטה לוגית לרשת הפיקסלים האמיתית של מאגר הציור, כדי שהמטוס
// (שזז כל פריים) ירד תמיד על גבול פיקסל שלם — בלי רעידות/טשטוש תת-פיקסל.
function snapToPixelGrid(value) {
  return Math.round(value * PIXEL_SCALE) / PIXEL_SCALE;
}

// מונע גלילה/זום של הדף במהלך משחק במובייל.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

// רישום ה-service worker (PWA): שומר את קובצי המשחק במטמון כדי שהוא
// יעבוד גם בלי אינטרנט. נתיב יחסי כדי לעבוד גם בתת-תיקייה (GitHub Pages).
//
// localhost/127.0.0.1 הם מקרה נפרד לגמרי מהאתר החי: **לא נרשם שם שום
// Service Worker בכלל**, ואם כבר רשום אחד משם (מפיתוח/בדיקות קודמים —
// זה בדיוק מה שקרה בפועל, ראו design/AUDIT-2.md), מבטלים את הרישום,
// מוחקים את כל המטמונים של המקור, ומרעננים פעם אחת. הסיבה: שלושת
// המנגנונים למטה (updateViaCache/update/oncontrollerchange) מניחים
// שיש *שרת רץ ברציפות* בכתובת הזו — אבל בפיתוח מקומי שרתים עולים
// ויורדים כל הזמן (כל טרמינל חדש = שרת חדש, לפעמים אין שרת בכלל באותו
// רגע). Service Worker שכבר שולט על 127.0.0.1 מהפעם הקודמת יתפוס כל
// בקשה כזו וייפול חזרה למטמון שלו בלי להתלונן — בדיוק מסכה "זה עובד"
// על מצב שבו בעצם אין שום שרת חי, וגורם לקוד ישן להיראות כאילו הוא
// עדיין רץ. ביטול הרישום לגמרי בכתובות המקומיות האלה מסיר את השכבה
// הזו לחלוטין — מה שרואים הוא תמיד בדיוק מה שהשרת המקומי מגיש עכשיו,
// או שגיאת רשת כנה אם אין שרת, לא עדות ישנה שמתחזה לנוכחית.
const IS_LOCAL_HOST = location.hostname === "localhost" || location.hostname === "127.0.0.1";

if ("serviceWorker" in navigator && IS_LOCAL_HOST) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (regs.length === 0) return; // כבר נקי, אין מה לנקות
      Promise.all(regs.map((r) => r.unregister()))
        .then(() => (window.caches ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) : null))
        .then(() => window.location.reload());
    });
  });
} else if ("serviceWorker" in navigator) {
  // שלושה מנגנונים, יחד, פותרים את "גרסה חדשה לא מגיעה בלי ניקוי ידני של
  // המטמון" **באתר החי** (ראו design/AUDIT-2.md לחקירה המלאה עם שחזור
  // בפועל):
  //
  // 1. updateViaCache:"none" — מכריח את הדפדפן לבדוק עדכון ל-
  //    service-worker.js עצמו מול הרשת בכל פעם, לא מול מטמון ה-HTTP שלו
  //    (אותה בעיה בדיוק כמו ה-fetch בתוך ה-SW, רק שכבה אחת מעל — ראו
  //    ההערה המקבילה ב-service-worker.js).
  // 2. registration.update() מפורש בכל טעינה, במקום לחכות ללו"ז הפנימי
  //    (לא-תמיד-מיידי) של הדפדפן — בודק גרסה חדשה באופן יזום.
  // 3. oncontrollerchange → רענון עמוד *אוטומטי*, פעם אחת — אבל **רק**
  //    כשזה מעבר אמיתי מ-SW ישן לחדש, לא ההשתלטות הראשונה-אי-פעם על דף
  //    חדש (ביקור ראשון, שום SW לא שלט קודם — clients.claim() מפעיל את
  //    אותו אירוע controllerchange גם אז, למרות שאין שום "גרסה ישנה"
  //    להתעדכן ממנה; hadController שומר את זה: null→worker לא סופר).
  //    ברגע שגרסה חדשה מסיימת activate ותופסת שליטה על דף שכבר *היה*
  //    תחת שליטת גרסה קודמת, זה האירוע שמודיע על כך לעמוד הפתוח. בלי
  //    המאזין הזה, העמוד הפתוח ממשיך להריץ את הקוד הישן שכבר בזיכרון עד
  //    שמישהו ירענן ידנית — בדיוק התקלה שלמשתמשי טלפון (אין להם DevTools
  //    לנקות מטמון) אין דרך לעקוף. עם המאזין, המעבר קורה לבד תוך טעינה
  //    אחת-שתיים, בלי שום פעולה מצד המשתמש — זה בדיוק מה שנבדק במבחן
  //    המעבר שתועד ב-AUDIT-2.md.
  let hadController = Boolean(navigator.serviceWorker.controller);
  let refreshedOnce = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true; // השתלטות ראשונה-אי-פעם, לא עדכון אמיתי — לא מרעננים
      return;
    }
    if (refreshedOnce) return;
    refreshedOnce = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update().catch(() => {});
      })
      .catch(() => {
        // כשלון ברישום לא אמור לעצור את המשחק — הוא ימשיך לעבוד בלי מצב אופליין.
      });
  });
}

// מספר הגרסה המוצג (קונסול + פינת מסך הפתיחה, #build-marker): נשאל
// תמיד את ה-Service Worker *הפעיל בפועל* (postMessage, לא קריאה ישירה
// ל-BUILD_VERSION), כי השאלה הרלוונטית היא לא "מה כתוב בקובץ שנטען" —
// game.js עצמו יכול להיות טרי בזמן שה-SW עדיין ישן (ראו AUDIT-2.md) —
// אלא "מי *באמת* שולט בדף הזה עכשיו". service-worker.js עונה ל-
// GET_VERSION עם ה-CACHE_VERSION שלו. אם אין עדיין SW ששולט (ביקור
// ראשון-אי-פעם, לפני שה-register למעלה הספיק להשתלט) או שהוא לא עונה
// תוך זמן סביר, נופלים חזרה ל-BUILD_VERSION הסטטי מ-version.js — עדיף
// מידע חלקי (ומסומן ככזה) על פני שום מידע.
function reportBuildVersion() {
  const show = (version, source) => {
    console.log(`Flappy Plane build: ${version} (${source})`);
    const el = document.getElementById("build-marker");
    if (el) el.textContent = version;
  };

  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    show(BUILD_VERSION, "version.js — אין עדיין Service Worker פעיל");
    return;
  }

  const channel = new MessageChannel();
  const timeout = setTimeout(
    () => show(BUILD_VERSION, "version.js — ה-Service Worker לא הגיב"),
    800
  );
  channel.port1.onmessage = (event) => {
    clearTimeout(timeout);
    const version = event.data && event.data.version ? event.data.version : BUILD_VERSION;
    show(version, "Service Worker פעיל, מאומת");
  };
  navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
}
reportBuildVersion();

// --- מניפסט נכסים: טעינה מסודרת מראש, לפני תחילת המשחק ---
// המטוס עצמו חזר להיות מצויר בקוד (ראו drawPlane) — ניסיון לחלץ אותו
// מתמונת מקור והפוך אותו ללבן אחיד נתקל בכך שההצללה הדו-גונית המקורית
// של הזנב/המנוע לא ניתנת להפרדה נקייה מ"חלונות" בסף בהירות פשוט, מה
// שיצר תוצאה מנומרת. ציור וקטורי נותן שליטה מדויקת, בלי הפתעות. כל
// רכיב גרפי אחר (רקעים נוספים וכו') עדיין עובר דרך אותו מנגנון טעינה.
const ASSET_MANIFEST = {
  backgroundCity: "assets/background-city.png",
  towerRound: "assets/tower-round.png",
  towerSquare: "assets/tower-square.png",
  towerTriangle: "assets/tower-triangle.png",
  towerBase: "assets/tower_base.png",
  plane: "assets/plane.png",
};
const assets = {};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load asset: " + src));
    img.src = src;
  });
}

function loadAssets(manifest) {
  const keys = Object.keys(manifest);
  return Promise.all(
    keys.map((key) => loadImage(manifest[key]).then((img) => { assets[key] = img; }))
  );
}

// --- צלילים קצרים דרך Web Audio API, בלי קובצי אודיו ---
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freqStart, freqEnd, duration, type, volume) {
  const ac = getAudioCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t0 = ac.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);

  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

function playFlapSound() {
  playTone(380, 620, 0.09, "square", 0.1);
}

function playScoreSound() {
  playTone(700, 1050, 0.14, "sine", 0.16);
}

function playCrashSound() {
  playTone(200, 40, 0.4, "sawtooth", 0.2);
}

// אייפון (ובדפדפנים ניידים נוספים) חוסם הפעלת אודיו לפני אינטראקציית משתמש.
// פותחים את ה-AudioContext כבר במגע/קליק/מקש הראשון בעמוד, כדי שצלילים
// מאוחרים יותר (כולל כאלה שמופעלים מתוך לולאת המשחק, לא ישירות ממחווה)
// יעבדו בלי עיכוב או חסימה.
function unlockAudioOnce() {
  getAudioCtx();
  window.removeEventListener("touchstart", unlockAudioOnce);
  window.removeEventListener("mousedown", unlockAudioOnce);
  window.removeEventListener("keydown", unlockAudioOnce);
}
window.addEventListener("touchstart", unlockAudioOnce, { passive: true });
window.addEventListener("mousedown", unlockAudioOnce);
window.addEventListener("keydown", unlockAudioOnce);

// --- מצבי משחק ---
const STATE = { START: "start", PLAYING: "playing", GAMEOVER: "gameover" };
let gameState = STATE.START;

const loadingScreen = document.getElementById("loading-screen");
const startScreen = document.getElementById("start-screen");
const gameoverScreen = document.getElementById("gameover-screen");
const hud = document.getElementById("hud");
const startBtn = document.getElementById("start-btn");
const retryBtn = document.getElementById("retry-btn");
const scoreEl = document.getElementById("score");
const finalScoreEl = document.getElementById("final-score");
const highScoreEl = document.getElementById("high-score");

function updateScreens() {
  startScreen.classList.toggle("hidden", gameState !== STATE.START);
  gameoverScreen.classList.toggle("hidden", gameState !== STATE.GAMEOVER);
  hud.classList.toggle("hidden", gameState !== STATE.PLAYING);
}

// --- ניקוד ושיא (נשמר ב-localStorage) ---
const HIGH_SCORE_KEY = "flappyPlaneHighScore";
let score = 0;

function getHighScore() {
  return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
}

function saveHighScoreIfNeeded(value) {
  if (value > getHighScore()) {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  }
}

function updateScore() {
  for (const t of towers) {
    if (!t.passed && t.x + CONFIG.TOWER_WIDTH < plane.x) {
      t.passed = true;
      score++;
      scoreEl.textContent = String(score);
      playScoreSound();
    }
  }
}

function startGame() {
  resetPlane();
  resetTowers();
  score = 0;
  scoreEl.textContent = "0";
  gameState = STATE.PLAYING;
  updateScreens();
}

function endGame() {
  gameState = STATE.GAMEOVER;
  playCrashSound();
  saveHighScoreIfNeeded(score);
  finalScoreEl.textContent = String(score);
  highScoreEl.textContent = String(getHighScore());
  updateScreens();
}

startBtn.addEventListener("click", startGame);
retryBtn.addEventListener("click", startGame);
updateScreens();

// --- מצב המטוס ---
const plane = {
  x: CONFIG.PLANE_X,
  y: CONFIG.HEIGHT / 2,
  vy: 0,
  angle: 0,
};

function resetPlane() {
  plane.y = CONFIG.HEIGHT / 2;
  plane.vy = 0;
  plane.angle = 0;
}

function flap() {
  plane.vy = CONFIG.JUMP_FORCE;
  playFlapSound();
}

// --- קלט: קליק, מקש רווח, נגיעה — פועל לפי מצב המשחק הנוכחי ---
function handlePrimaryAction() {
  if (gameState === STATE.START) {
    startGame();
  } else if (gameState === STATE.PLAYING) {
    flap();
  }
  // במצב GAMEOVER הפעולה היחידה היא כפתור "נסה שוב"
}

// מגן מפני הפעלה כפולה מאותה נגיעה (touchstart ואחריו mousedown סינתטי
// שדפדפנים ניידים עלולים עדיין לשגר, גם אחרי preventDefault).
let lastInputTime = 0;
function onFlapInput(e) {
  e.preventDefault();
  const now = performance.now();
  if (now - lastInputTime < 80) return;
  lastInputTime = now;
  handlePrimaryAction();
}

canvas.addEventListener("mousedown", onFlapInput);
canvas.addEventListener("touchstart", onFlapInput, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return; // החזקת המקש לא גורמת לדחיפות חוזרות
    handlePrimaryAction();
  }
});

// --- מסך הכניסה (ENTRANCE.gif): פוסטר-ואז-אנימציה ---
// שתי שכבות ה-img (entrance-bg/entrance-main, ראו index.html+style.css)
// מתחילות עם assets/entrance-poster.png (הפריים הראשון, PNG סטטי) כדי
// שלעולם לא יהיה רגע של מסך ריק. מחליפים ל-GIF המונפש רק אחרי שהוא
// נטען בהצלחה בעצמו (לא רק שה-poster נטען) — אם הטעינה נכשלת (אופליין
// לפני שה-SW הספיק לאחסן, רשת גרועה וכו') הפוסטר נשאר לצמיתות, בלי
// שבירה. prefers-reduced-motion מדלג על ההחלפה מראש, מאותה סיבה.
(function initEntranceAnimation() {
  const ENTRANCE_GIF = "design/raw/ENTRANCE.gif";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const bg = document.querySelector(".entrance-bg");
  const main = document.querySelector(".entrance-main");
  if (!bg || !main) return;

  const preload = new Image();
  preload.onload = () => {
    bg.src = ENTRANCE_GIF;
    main.src = ENTRANCE_GIF;
  };
  preload.src = ENTRANCE_GIF;
})();

// --- התקנה כאפליקציה (PWA): כפתור באנדרואיד, הנחיה באייפון ---
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true // דגל ישן של Safari באייפון
  );
}

function isIOSDevice() {
  const ua = window.navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIPadOS13Plus;
}

const installBtn = document.getElementById("install-btn");
const iosInstallHint = document.getElementById("ios-install-hint");
let deferredInstallPrompt = null;

if (!isRunningStandalone()) {
  // אנדרואיד/כרום: הדפדפן מודיע שאפשר להתקין — מציגים כפתור משלנו.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.disabled = false;
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    installBtn.disabled = true;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
    iosInstallHint.classList.add("hidden");
  });

  // אייפון: אין beforeinstallprompt — מציגים הנחיה קבועה למסך הפתיחה.
  if (isIOSDevice()) {
    iosInstallHint.classList.remove("hidden");
  }
}

// נגיעה בגוף הביפר או בכפתורים המצוירים שעליו — אותה פעולה כמו קליק על
// המסך. נגיעה בתוך .beeper-glass (קנבס/כפתורי המסכים) כבר מטופלת על ידי
// המאזינים שלהם למעלה; לא כופלים כאן את הפעולה עליהם.
const beeperBody = document.querySelector(".beeper");
beeperBody.addEventListener("click", (e) => {
  if (e.target.closest(".beeper-glass")) return;
  e.preventDefault();
  handlePrimaryAction();
});

// --- לולאת משחק מבוססת delta time ---
let lastTime = null;

function gameLoop(now) {
  if (lastTime === null) lastTime = now;
  const dtMs = Math.min(now - lastTime, 50);
  lastTime = now;
  // מנורמל כך ש-1.0 = פריים אחד ב-60fps
  const dt = dtMs / (1000 / 60);

  update(dt, dtMs);
  render();

  requestAnimationFrame(gameLoop);
}

function update(dt, dtMs) {
  // הרקע ממשיך לזוז גם במסך הפתיחה, לאפקט רקע חי, ונעצר במסך הסיום.
  if (gameState !== STATE.GAMEOVER) {
    updateBackgroundCity(dt);
  }
  if (gameState !== STATE.PLAYING) return;
  if (DEBUG_FROZEN_TOWER) return; // מצב בדיקה: תמונה סטטית, בלי תזוזה/התנגשות/ניקוד
  updatePlanePhysics(dt);
  updateTowers(dt, dtMs);
  updateScore();
  if (checkCollisions()) {
    endGame();
  }
}

// --- התנגשויות: רצפה, תקרה, מגדלים ---
function checkCollisions() {
  // תיבת הפגיעה נגזרת מ-PLANE_ASSET.hitboxFrac (נמדד מהפיקסלים בפועל של
  // נכס המטוס — ראו שם), לא מקבוע-גודל נפרד שעלול להתבדר מהאמנות בפועל.
  const halfW = ((PLANE_ASSET.hitboxFrac.right - PLANE_ASSET.hitboxFrac.left) * CONFIG.PLANE_DISPLAY_WIDTH) / 2;
  const halfH = ((PLANE_ASSET.hitboxFrac.bottom - PLANE_ASSET.hitboxFrac.top) * planeDisplayHeight()) / 2;
  const top = plane.y - halfH;
  const bottom = plane.y + halfH;
  const floorY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;

  if (bottom >= floorY) return true; // התנגשות ברצפה
  if (top <= 0) return true; // התנגשות בתקרה

  const left = plane.x - halfW;
  const right = plane.x + halfW;
  const half = CONFIG.TOWER_GAP / 2;

  for (const t of towers) {
    const gapTop = t.gapY - half;
    const gapBottom = t.gapY + half;

    // תיבת הפגיעה נגזרת תמיד מאותו מודל שמשמש לציור (ראו
    // towerSegmentHalfWidthAt / drawTowerFromGapEdge) כדי שהיא תמיד
    // תואמת בדיוק את מה שהשחקן רואה. בודקים רק בנקודה העמוקה ביותר של
    // חפיפה אנכית עם כל חלק (הכי רחוקה מהפער): מספיק כי הרוחב משתנה
    // בצורה מונוטונית (קבוע TOWER_WIDTH לעגול/מרובע, גדל מ-0 לכיוון
    // הקודקוד במשולש), אז אם
    // הנקודה הרחבה ביותר בטווח לא חופפת אופקית, אף נקודה צרה יותר ממנה
    // בטווח גם לא תחפוף.
    const centerX = t.x + CONFIG.TOWER_WIDTH / 2;
    if (top < gapTop) {
      const halfWidth = towerSegmentHalfWidthAt(t.topShape, gapTop - top, gapTop);
      if (right > centerX - halfWidth && left < centerX + halfWidth) return true;
    }
    if (bottom > gapBottom) {
      // floorY-gapBottom היה ה-L הישן (עד קו הרצפה); הציור עצמו עובר
      // עד CONFIG.HEIGHT עכשיו (ראו drawTowers) — תיבת הפגיעה חייבת
      // להיגזר מאותו L, בדיוק לפי העיקרון ב-towerSegmentHalfWidthAt.
      const halfWidth = towerSegmentHalfWidthAt(t.bottomShape, bottom - gapBottom, CONFIG.HEIGHT - gapBottom);
      if (right > centerX - halfWidth && left < centerX + halfWidth) return true;
    }
  }
  return false;
}

// רוחב-חצי תיבת הפגיעה של קטע מגדל (עליון או תחתון) במרחק נתון מקצה
// הפער (0 = בדיוק על קצה הפער), עבור קטע שגובהו הכולל הוא segmentHeight.
// חייב לנבוע מאותה גיאומטריה בדיוק כמו drawTowerSegment (קנה-מידה
// טבעי, רוחב = TOWER_WIDTH, בלי מתיחה) — אחרת התיבה לא תואמת למה
// שבאמת מצויר. עגול/מרובע: מלבן ברוחב TOWER_WIDTH קבוע מקצה לקצה (הם
// כמעט-סימטריים ברוחב בכל שורת פיקסלים בקובץ המקור, ואף אחד מהם לא
// מתוח/מכווץ יותר — תמיד TOWER_WIDTH, גם באזור ה-fill). משולש: הקודקוד
// (בקצה הפער) מתחיל ב-0 ומתרחב ליניארית עד TOWER_WIDTH במרחק
// naturalTaperDepth — עומק הטור הטבעי של התמונה (כמה ממנה בפועל
// מוצגת, בלי מתיחה, מוגבל גם לפי segmentHeight למקרה שהיא נחתכת) —
// ונשאר ברוחב המלא (TOWER_WIDTH) מעבר לזה, כי שם זה כבר אזור ה-fill
// (tower_base.png), שהוא תמיד ברוחב מלא כמו כל fill אחר.
function towerSegmentHalfWidthAt(shape, distFromGapEdge, segmentHeight) {
  const w = CONFIG.TOWER_WIDTH;
  if (segmentHeight <= 0) return w / 2;
  if (shape !== "triangle") return w / 2;
  const img = towerSegmentAsset(shape);
  const naturalDrawH = img.naturalHeight * (w / img.naturalWidth);
  const naturalTaperDepth = Math.min(naturalDrawH, segmentHeight);
  const fraction = Math.min(1, Math.max(0, distFromGapEdge / naturalTaperDepth));
  return (fraction * w) / 2;
}

function updatePlanePhysics(dt) {
  plane.vy += CONFIG.GRAVITY * dt;
  plane.vy = Math.max(CONFIG.MAX_RISE_SPEED, Math.min(plane.vy, CONFIG.MAX_FALL_SPEED));
  plane.y += plane.vy * dt;

  // הטיית האף: עולה כשמטפסים, צונחת כשנופלים, עם ריכוך לתנועה חלקה.
  // מוגבלת ל-20° למעלה / 25° למטה (CONFIG.PLANE_TILT_*) כדי שהמטוס לא
  // יתהפך ויישאר קריא.
  const targetAngle = Math.max(
    CONFIG.PLANE_TILT_UP_MAX,
    Math.min(CONFIG.PLANE_TILT_DOWN_MAX, plane.vy / 10)
  );
  const ease = 1 - Math.pow(1 - 0.25, dt);
  plane.angle += (targetAngle - plane.angle) * ease;
}

function render() {
  // קנבס המשחק (ctx) כבר לא מצייר את הרקע (עבר לשכבה הנפרדת bg-city, ראו
  // setupBackgroundCanvas למעלה) ולכן חייב ניקוי מפורש — בלי זה המגדלים
  // והמטוס מהפריים הקודם היו נשארים על המסך.
  ctx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  drawBackgroundCity();
  drawTowers();
  drawPlane(plane.x, plane.y, plane.angle);
}

// --- מגדלים (בסגנון מגדלי עזריאלי: עגול / משולש / מרובע) ---
// החלק העליון (תלוי מהתקרה) והחלק התחתון (צומח מהרצפה) של אותו מכשול
// מגרילים את צורתם **בנפרד ובאופן בלתי תלוי לחלוטין** (topShape מול
// bottomShape, ראו spawnTower) — במתכוון: מגדל עגול שיורד מלמעלה ומגדל
// משולש שעולה מלמטה באותו ציר X הם שילוב לגיטימי ורצוי — אבל **אסור
// שיהיו אותה צורה**: topShape ו-bottomShape חייבים תמיד להיות שונים
// (ראו spawnTower). ה-top מוגרל חופשי מתוך שלוש הצורות (שליש-שליש-שליש
// אמיתי), ואז ה-bottom מוגרל רק מתוך שתי הצורות שנשארו — כך שההתאמה
// Top===Bottom מובטחת מתמטית ל-0%, בעוד שההתפלגות השולית (marginal) של
// כל צורה, גם ב-top וגם ב-bottom בנפרד, עדיין בדיוק שליש (ראו ההוכחה
// בהערה מעל spawnTower). בלי זיכרון של ההגרלה הקודמת — כל טור עצמאי
// לגמרי מהטור שלפניו.
const TOWER_SHAPES = ["round", "triangle", "square"];

// מקור-האמת היחיד שמקשר shape לנכס הגרפי שלו; גם הציור וגם חישוב תיבת
// הפגיעה (towerSegmentHalfWidthAt) קוראים מכאן, כך שאי אפשר שהם
// "יתפצלו" לשני מקורות מידע שונים.
const TOWER_IMAGE_ASSET_KEY = { round: "towerRound", square: "towerSquare", triangle: "towerTriangle" };

// כמה שורות פיקסל, בקצה הרחוק מהפער (סוף קובץ התמונה — ה"בסיס" המעוגל
// או המחודד של עגול/מרובע), אינן אטומות לכל רוחב התמונה. זה התחום שבו
// המלבן (tower_base.png) חייב לשכב *מתחת* לתמונת המגדל ולהיראות רק דרך
// החורים שמתחת לבסיס — ראו drawTowerFromGapEdge. נמדד מהפיקסלים
// האמיתיים של כל תמונה (לא מוקלד בניחוש) ע"י tools/measure-tower-base-zones.js;
// אם תמונת מגדל כלשהי מתחלפת, מריצים את הסקריפט מחדש ומעתיקים את הפלט
// לכאן. במשולש הערך קטן כמעט לאפס כי הוא מצטייר כחוד שמתרחב בהדרגה עד
// קו ישר בדיוק בסוף התמונה — אין "בסיס מעוגל" נפרד לכסות.
const TOWER_BASE_ZONE_SOURCE_PX = { round: 72, square: 84, triangle: 4 };

// שולף את התמונה הטעונה עבור צורת-מגדל נתונה. זורק אם shape לא מוכר
// או שהנכס שלו לא נטען — "מגן שפיות" שמוודא שלעולם לא נצייר (או נחשב
// תיבת פגיעה) עבור צורה בלי נכס גרפי תואם במפורש.
function towerSegmentAsset(shape) {
  const key = TOWER_IMAGE_ASSET_KEY[shape];
  const img = key && assets[key];
  if (!img) throw new Error(`No image asset bound for tower shape "${shape}"`);
  return img;
}

// --- מצב בדיקה (debug=towers): רק בכתובת מקומית (ראו IS_LOCAL_HOST) ---
// ?debug=towers&shape=round|square|triangle&gapY=NNN קובע מגדל יחיד,
// קפוא (בלי תזוזה, בלי הגרלה, בלי התנגשויות), באותה צורה למעלה ולמטה,
// בגובה הרווח הנתון — כדי לצלם תרחיש מדויק וחזיר (ראו drawTowerFromGapEdge
// למסגרות הבדיקה שהוא מצייר במצב הזה).
const DEBUG_PARAMS = IS_LOCAL_HOST ? new URLSearchParams(location.search) : null;
const DEBUG_TOWERS = Boolean(DEBUG_PARAMS && DEBUG_PARAMS.get("debug") === "towers");
const DEBUG_FIXED_SHAPE = DEBUG_PARAMS ? DEBUG_PARAMS.get("shape") : null;
const DEBUG_FIXED_GAPY = DEBUG_PARAMS ? Number(DEBUG_PARAMS.get("gapY")) : NaN;
const DEBUG_FROZEN_TOWER = Boolean(
  DEBUG_TOWERS && DEBUG_FIXED_SHAPE && TOWER_IMAGE_ASSET_KEY[DEBUG_FIXED_SHAPE] && Number.isFinite(DEBUG_FIXED_GAPY)
);

let towers = [];
let towerSpawnTimer = 0;

function resetTowers() {
  if (DEBUG_FROZEN_TOWER) {
    towers = [{
      x: CONFIG.PLANE_X + 150,
      gapY: DEBUG_FIXED_GAPY,
      topShape: DEBUG_FIXED_SHAPE,
      bottomShape: DEBUG_FIXED_SHAPE,
      passed: false,
    }];
    return;
  }
  towers = [];
  towerSpawnTimer = 0;
}

function spawnTower() {
  // מגן קשיח נגד צפיפות/חפיפה: לא יוצר מגדל חדש אם המגדל האחרון שעדיין
  // קיים לא התרחק מספיק (ראו CONFIG.MIN_TOWER_DISTANCE). בתצורה הנוכחית
  // זה תמיד מתקיים (הטיימר הקבוע כבר שומר מרווח גדול יותר), אז זה לא
  // משנה התנהגות — רק חוסם אפשרות לצפיפות אם הטיימר/המהירות ישתנו.
  const lastTower = towers[towers.length - 1];
  if (lastTower && CONFIG.WIDTH - (lastTower.x + CONFIG.TOWER_WIDTH) < CONFIG.MIN_TOWER_DISTANCE) {
    return;
  }

  const margin = 60;
  const half = CONFIG.TOWER_GAP / 2;
  const floorY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
  const minGapY = margin + half;
  const maxGapY = floorY - margin - half;
  const gapY = minGapY + Math.random() * Math.max(0, maxGapY - minGapY);
  // שלב א': topShape מוגרל חופשי מתוך שלוש הצורות — שליש בדיוק לכל אחת.
  // שלב ב': מסננים את הצורה שנבחרה מהמאגר, נשארות בדיוק שתיים.
  // שלב ג': bottomShape מוגרל מתוך שתי הנותרות בלבד (חצי-חצי ביניהן) —
  // כך ש-topShape !== bottomShape מובטח ב-100% מהמקרים, בלי יוצא מהכלל.
  //
  // ההוכחה שההתפלגות השולית של bottomShape נשארת שליש-שליש-שליש (לא
  // רק ש-top כן): לכל צורה X, הסיכוי ש-bottom===X הוא
  // P(top=A)*P(bottom=X|top=A) + P(top=B)*P(bottom=X|top=B) — סכום על
  // שתי הצורות האחרות A,B (ל-top=X עצמו הסיכוי לכך הוא 0, הוא כבר סונן
  // החוצה) — ולכל אחת מהן (1/3)*(1/2), סה"כ (1/3)*(1/2)+(1/3)*(1/2) =
  // 1/3 בדיוק. לכן גם bottomShape מגיע לשליש-שליש-שליש, לא רק topShape.
  const topShape = TOWER_SHAPES[Math.floor(Math.random() * TOWER_SHAPES.length)];
  const remainingShapes = TOWER_SHAPES.filter((s) => s !== topShape);
  const bottomShape = remainingShapes[Math.floor(Math.random() * remainingShapes.length)];
  towers.push({
    x: CONFIG.WIDTH,
    gapY,
    topShape,
    bottomShape,
    passed: false,
  });
}

function updateTowers(dt, dtMs) {
  towerSpawnTimer += dtMs;
  if (towerSpawnTimer >= CONFIG.TOWER_INTERVAL) {
    towerSpawnTimer -= CONFIG.TOWER_INTERVAL;
    spawnTower();
  }
  for (const t of towers) {
    t.x -= CONFIG.TOWER_SPEED * dt;
  }
  towers = towers.filter((t) => t.x + CONFIG.TOWER_WIDTH > 0);
}

function drawTowers() {
  // שכבת תמונת-המגדלים לא נדגמת-מחדש כל פריים כמו הרקע (לא ממלאת את כל
  // השטח באטימות), ולכן צריכה ניקוי מפורש בכל פריים.
  towerImagesCtx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  for (const t of towers) {
    const half = CONFIG.TOWER_GAP / 2;
    const topHeight = t.gapY - half;
    const bottomY = t.gapY + half;
    // עד לקצה המוחלט של ה-canvas (CONFIG.HEIGHT), לא עד קו הרצפה
    // (GROUND_HEIGHT) — אותו קו נשאר קו ההתנגשות עם הרצפה בלבד
    // (checkCollisions), אבל הוא לא "קצה הציור": בלעדי זה נשאר פס רקע
    // חשוף בין תחתית המגדל לתחתית המסך (בדיוק הפגם שדווח).
    const bottomHeight = CONFIG.HEIGHT - bottomY;

    // flip זהה לכל הצורות (עגול/מרובע/משולש) — ראו drawTowerSegment.
    // החלק העליון *תמיד* הפוך, החלק התחתון *אף פעם* לא — זה לא תלוי
    // בצורה בכלל יותר.
    drawTowerSegment(t.x, 0, topHeight, CONFIG.TOWER_WIDTH, t.topShape, true);
    drawTowerSegment(t.x, bottomY, bottomHeight, CONFIG.TOWER_WIDTH, t.bottomShape, false);
  }
}

// מצייר קטע מגדל אחד (חלק עליון תלוי מהתקרה, או חלק תחתון עולה מהרצפה).
// **ארכיטקטורה**: מגדל עליון הוא תמונת-מראה אנכית של מגדל תחתון — משני
// צדי הפער הגגות פונים זה אל זה, הבסיסים פונים החוצה (אל התקרה/הרצפה).
// יש פונקציית ציור אחת, drawTowerFromGapEdge, שמצוירת תמיד "ביחס לשפת
// הפער": הגג צמוד לשפת הפער, הגוף מתרחק ממנה. flip (לא תלוי בצורה —
// כל הצורות מתהפכות באותו אופן, אין יותר TOWER_SHAPE_TAPERS) קובע רק
// באיזה כיוון "מתרחק ממנה" מתורגם על המסך: כבוי = למטה (מגדל תחתון,
// מתרחק לכיוון הרצפה), דלוק = למעלה (מגדל עליון, מתרחק לכיוון התקרה) —
// מושג ע"י translate לשפת הפער + scale(1,-1) סביבה, ואז קריאה לאותה
// פונקציה בדיוק עם y0=0 (שבתוך המערכת ההפוכה הזו כבר מצביעה בדיוק על
// שפת הפער במסך). שום הבדל קוד בין הצורות — זה מה שמבטיח שאי אפשר
// "לשכוח" להפוך צורה אחת ולא אחרת.
function drawTowerSegment(x, segmentYTop, segmentHeight, w, shape, flip) {
  if (segmentHeight <= 0) return;
  const gapEdgeY = flip ? segmentYTop + segmentHeight : segmentYTop;
  const baseZoneSourcePx = TOWER_BASE_ZONE_SOURCE_PX[shape];

  towerImagesCtx.save();
  if (flip) {
    towerImagesCtx.translate(0, gapEdgeY);
    towerImagesCtx.scale(1, -1); // היפוך אנכי בלבד — לא אופקי
    drawTowerFromGapEdge(towerSegmentAsset(shape), assets.towerBase, x, 0, w, segmentHeight, baseZoneSourcePx);
  } else {
    drawTowerFromGapEdge(towerSegmentAsset(shape), assets.towerBase, x, gapEdgeY, w, segmentHeight, baseZoneSourcePx);
  }
  towerImagesCtx.restore();
}

// מצייר מגדל (או את חלקו) שהגג שלו מתחיל ב-y0 ומתרחב ב-y גדל (בתוך
// מערכת הקואורדינטות הנוכחית של הקונטקסט — יכולה להיות הפוכה, ראו
// drawTowerSegment) לאורך availableHeight, ביחידות d (d=0 בשפת הפער,
// d=availableHeight בקצה המסך — תקרה למגדל עליון, קצה ה-canvas למגדל
// תחתון). תמיד ביחס הטבעי — **בלי מתיחה בשום ציר, בשום תמונה** — ברוחב
// TOWER_WIDTH קבוע (נגזר מ-w, לעולם לא מ-availableHeight).
//
// שני אזורים נפרדים לאורך d, לעולם לא חופפים חוץ מהחפיפה המכוונת שתוארה:
//   [0, naturalDrawH]            — תמונת המגדל, מהגג (sy=0, תמיד שלם)
//                                   ועד הבסיס (sy=הגדול ביותר, נחתך אם
//                                   הוא עובר את availableHeight).
//   [fillStart, availableHeight] — המלבן (tower_base.png), רק אם
//                                   התמונה קצרה מ-availableHeight.
// fillStart = naturalDrawH - bz (bz = TOWER_BASE_ZONE_SOURCE_PX בקנה
// המידה של התמונה): המלבן מתחיל קצת *לפני* סוף תמונת המגדל, רק בגובה
// אזור הבסיס המעוגל/המחודד שלה (0 במשולש) — כדי שלא יבצבץ רקע דרך
// החור שמתחת לבסיס, ולעולם לא ליד גוף המגדל או משני צדי החוד.
// המלבן מצויר **קודם** (כך שבתחום fillStart..naturalDrawH הוא מוסתר
// מאחורי הבסיס האטום ונראה רק בחורים שלו), ואז תמונת המגדל **מעליו**.
// המלבן מעוגן תמיד לקצה המסך (d=availableHeight — תקרה/רצפה), ומתרחב
// לאחור לכיוון המגדל בעותקים שלמים; רק העותק הפנימי ביותר (הקרוב
// למגדל) נחתך, ונשמר ממנו החלק הקרוב לקצה המסך (לא לתמונת המגדל).
function drawTowerFromGapEdge(img, fillImg, x, y0, w, availableHeight, baseZoneSourcePx) {
  const naturalDrawH = img.naturalHeight * (w / img.naturalWidth);

  if (naturalDrawH < availableHeight) {
    const bz = baseZoneSourcePx * (w / img.naturalWidth);
    const fillStart = Math.max(0, naturalDrawH - bz);
    const fillDrawH = fillImg.naturalHeight * (w / fillImg.naturalWidth);

    let farD = availableHeight;
    while (farD > fillStart + 0.01) {
      const nearD = Math.max(fillStart, farD - fillDrawH);
      const tileDrawH = farD - nearD;
      const tileSrcH = fillImg.naturalHeight * (tileDrawH / fillDrawH);
      const sy = fillImg.naturalHeight - tileSrcH; // שומר את הקצה הקרוב למסך, חותך את הקרוב למגדל
      towerImagesCtx.drawImage(fillImg, 0, sy, fillImg.naturalWidth, tileSrcH, x, y0 + nearD, w, tileDrawH);
      if (DEBUG_TOWERS) strokeDebugRect(x, y0 + nearD, w, tileDrawH, "#ff00ff");
      farD = nearD;
    }
    if (DEBUG_TOWERS) strokeDebugLine(x, y0 + fillStart, w, "#00e5ff");
  }

  const visibleH = Math.min(naturalDrawH, availableHeight);
  const srcH = img.naturalHeight * (visibleH / naturalDrawH);
  towerImagesCtx.drawImage(img, 0, 0, img.naturalWidth, srcH, x, y0, w, visibleH);
  if (DEBUG_TOWERS) strokeDebugRect(x, y0, w, visibleH, "#39ff14");
}

// מסגרות דקות למצב ?debug=towers בלבד (ראו DEBUG_TOWERS) — ירוק סביב
// תמונת המגדל עצמה, מגנטה סביב כל עותק של המלבן, ציאן בגובה fillStart.
// מצוירות בתוך אותה מערכת-קואורדינטות מקומית (d) כמו שאר הפונקציה, כולל
// תחת ה-translate/scale ההפוך של מגדל עליון — כך שהן תמיד מתאימות
// למיקום האמיתי על המסך בלי חשבון נפרד.
function strokeDebugRect(x, y, w, h, color) {
  towerImagesCtx.save();
  towerImagesCtx.strokeStyle = color;
  towerImagesCtx.lineWidth = 1.2;
  towerImagesCtx.strokeRect(x + 0.6, y + 0.6, w - 1.2, Math.max(0, h - 1.2));
  towerImagesCtx.restore();
}

function strokeDebugLine(x, y, w, color) {
  towerImagesCtx.save();
  towerImagesCtx.strokeStyle = color;
  towerImagesCtx.lineWidth = 1;
  towerImagesCtx.beginPath();
  towerImagesCtx.moveTo(x, y);
  towerImagesCtx.lineTo(x + w, y);
  towerImagesCtx.stroke();
  towerImagesCtx.restore();
}

// --- רקע: תמונת עיר+שמיים אחת (אין שכבת כביש נפרדת — ראו design/SPEC.md) ---
// גוללת בלי תפר נראה בטכניקת "ריצוף מראה": מציירים את התמונה ואת ההיפוך
// האופקי שלה לסירוגין (A, flip(A), A, flip(A)...). כך קצה ימין של כל
// אריח תמיד זהה לקצה ימין של הבא אחריו (וכנ"ל משמאל) — אין קפיצה בתפר,
// גם בלי שהתמונה המקורית תוכננה להיות ניתנת לריצוף.
let cityOffset = 0;
let cityTileWidth = 0; // מחושב אחרי טעינת התמונה, לפי יחס הרוחב-גובה שלה

function updateBackgroundCity(dt) {
  if (cityTileWidth <= 0) return; // עוד לא נטען
  cityOffset += CONFIG.TOWER_SPEED * CONFIG.CITY_PARALLAX_FACTOR * dt;
  cityOffset %= cityTileWidth * 2;
}

function drawBackgroundCity() {
  const img = assets.backgroundCity;
  if (!img || cityTileWidth <= 0) return;

  const displayH = CONFIG.HEIGHT; // מכסה את כל גובה אזור המשחק
  const tileW = cityTileWidth;
  const startX = -(cityOffset % (tileW * 2));

  for (let x = startX, i = 0; x < CONFIG.WIDTH; x += tileW, i++) {
    const flipped = (Math.round((x - startX) / tileW) % 2) === 1;
    bgCtx.save();
    if (flipped) {
      bgCtx.translate(x + tileW, 0);
      bgCtx.scale(-1, 1);
      bgCtx.drawImage(img, 0, 0, tileW, displayH);
    } else {
      bgCtx.drawImage(img, x, 0, tileW, displayH);
    }
    bgCtx.restore();
  }
}

// --- מטוס נוסעים — נכס תמונה אמיתי (assets/plane.png, ראו PLANE_ASSET) ---
// מצויר על canvas#plane-layer הייעודי שלו (לא canvas#game, ראו
// setupPlaneCanvas למעלה), ביחס הרוחב-גובה האמיתי של הנכס — בלי מתיחה.
// ציר הסיבוב של ההטיה הוא מרכז *גוף* המטוס (bodyCenterX/Y, מחושב
// מ-PLANE_ASSET.hitboxFrac), לא מרכז הפריים כולו: הזנב הגבוה משמאל
// והכנפיים הנמוכות מתחת לא סימטריים סביב הפריים, אז סיבוב סביב מרכז
// הפריים היה מזיז את המטוס בצורה נראית לעין בכל הטיה. התמונה מצוירת
// בהיסט (-bodyCenterX, -bodyCenterY) ביחס לנקודת המקור אחרי ה-translate,
// כך שבפועל גוף המטוס — לא התמונה — יושב בדיוק על (x, y).
function drawPlane(x, y, angle = 0) {
  if (!assets.plane) return; // הגנת-שפיות: לא אמור לקרות אחרי loadAssets
  const w = CONFIG.PLANE_DISPLAY_WIDTH;
  const h = planeDisplayHeight();
  const bodyCenterX = ((PLANE_ASSET.hitboxFrac.left + PLANE_ASSET.hitboxFrac.right) / 2) * w;
  const bodyCenterY = ((PLANE_ASSET.hitboxFrac.top + PLANE_ASSET.hitboxFrac.bottom) / 2) * h;

  planeCtx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  planeCtx.save();
  planeCtx.translate(snapToPixelGrid(x), snapToPixelGrid(y));
  planeCtx.rotate(angle);
  planeCtx.drawImage(assets.plane, -bodyCenterX, -bodyCenterY, w, h);
  planeCtx.restore();

  // מצב ?debug=towers (ראו DEBUG_TOWERS, מקומי בלבד): מסגרת אדומה סביב
  // תיבת הפגיעה האמיתית. מצוירת *מחוץ* ל-rotate בכוונה — תיבת הפגיעה
  // עצמה ציר-מיושרת בעולם ולא מסתובבת עם ההטיה (ראו checkCollisions),
  // אז המסגרת חייבת לשקף בדיוק את זה, לא את המטוס המוטה.
  if (DEBUG_TOWERS) {
    const halfW = ((PLANE_ASSET.hitboxFrac.right - PLANE_ASSET.hitboxFrac.left) * w) / 2;
    const halfH = ((PLANE_ASSET.hitboxFrac.bottom - PLANE_ASSET.hitboxFrac.top) * h) / 2;
    planeCtx.save();
    planeCtx.strokeStyle = "#ff2d55";
    planeCtx.lineWidth = 1;
    planeCtx.strokeRect(x - halfW, y - halfH, halfW * 2, halfH * 2);
    planeCtx.restore();
  }
}

// --- אתחול: טוענים נכסים, ואז מתחילים את לולאת המשחק ---
loadAssets(ASSET_MANIFEST)
  .then(() => {
    cityTileWidth = CONFIG.HEIGHT * (assets.backgroundCity.naturalWidth / assets.backgroundCity.naturalHeight);
    loadingScreen.classList.add("hidden");
    requestAnimationFrame(gameLoop);
  })
  .catch((err) => {
    loadingScreen.querySelector(".loading-text").textContent = "שגיאה בטעינת המשחק";
    console.error(err);
  });
