// Flappy Plane — vanilla JS + Canvas, no libraries.
"use strict";

// כל הפרמטרים שמשפיעים על תחושת המשחק נמצאים כאן, במקום אחד.
const CONFIG = {
  WIDTH: 400,
  HEIGHT: 600,

  GRAVITY: 0.5,          // כוח משיכה על המטוס, פיקסלים/פריים^2 (יחסי ל-60fps)
  JUMP_FORCE: -8,         // מהירות אנכית מיידית בלחיצה (שלילי = למעלה)
  MAX_FALL_SPEED: 12,     // מהירות נפילה מקסימלית
  MAX_RISE_SPEED: -10,    // מהירות עלייה מקסימלית

  TOWER_SPEED: 2.5,       // פיקסלים/פריים (יחסי ל-60fps)
  TOWER_GAP: 172,         // רווח אנכי בין שני חלקי המגדל (הורחב קצת ב"סעיף 2" כדי לפצות על מטוס גדול יותר)
  TOWER_INTERVAL: 1500,   // מילישניות בין מגדל למגדל
  TOWER_WIDTH: 70,

  GROUND_HEIGHT: 40,      // גובה קו הרצפה (קולייז'ן בלבד — אין יותר ציור רצפה נפרד)

  PLANE_X: 110,                 // מיקום אופקי קבוע של המטוס
  PLANE_DISPLAY_WIDTH: 68,      // 17% מרוחב אזור המשחק (400)
  PLANE_DISPLAY_HEIGHT: 28,     // יחס רוחב-גובה קבוע (~2.45:1), כמו בעיצוב הווקטורי המקורי
  PLANE_HITBOX_WIDTH_SCALE: 0.84,  // תיבת הפגיעה קטנה מהמלבן המלא של המטוס, באותו יחס כמו לפני ההגדלה
  PLANE_HITBOX_HEIGHT_SCALE: 0.55, // (הזנב/הכנף המחודדים לא נספרים כפגיעה)
  PLANE_TILT_UP_MAX: (-20 * Math.PI) / 180,   // הטיית אף מקסימלית למעלה: 20°
  PLANE_TILT_DOWN_MAX: (25 * Math.PI) / 180,  // הטיית אף מקסימלית למטה: 25°

  CITY_PARALLAX_FACTOR: 1 / 3,  // שכבת העיר/שמיים גוללת בשליש ממהירות המגדלים
};

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

// מעגל קואורדינטה לוגית לרשת הפיקסלים האמיתית של מאגר הציור, כדי שהמטוס
// (שזז כל פריים) ירד תמיד על גבול פיקסל שלם — בלי רעידות/טשטוש תת-פיקסל.
function snapToPixelGrid(value) {
  return Math.round(value * PIXEL_SCALE) / PIXEL_SCALE;
}

// מונע גלילה/זום של הדף במהלך משחק במובייל.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

// רישום ה-service worker (PWA): שומר את קובצי המשחק במטמון כדי שהוא
// יעבוד גם בלי אינטרנט. נתיב יחסי כדי לעבוד גם בתת-תיקייה (GitHub Pages).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // כשלון ברישום לא אמור לעצור את המשחק — הוא ימשיך לעבוד בלי מצב אופליין.
    });
  });
}

// --- מניפסט נכסים: טעינה מסודרת מראש, לפני תחילת המשחק ---
// המטוס עצמו חזר להיות מצויר בקוד (ראו drawPlane) — ניסיון לחלץ אותו
// מתמונת מקור והפוך אותו ללבן אחיד נתקל בכך שההצללה הדו-גונית המקורית
// של הזנב/המנוע לא ניתנת להפרדה נקייה מ"חלונות" בסף בהירות פשוט, מה
// שיצר תוצאה מנומרת. ציור וקטורי נותן שליטה מדויקת, בלי הפתעות. כל
// רכיב גרפי אחר (רקעים נוספים וכו') עדיין עובר דרך אותו מנגנון טעינה.
const ASSET_MANIFEST = {
  backgroundCity: "assets/background-city.png",
  towerTriangle: "assets/tower-triangle.png",
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

// כפתור ה-START הפיזי על מארז הטלוויזיה — אותה פעולה כמו קליק על המסך.
const tvStartBtn = document.getElementById("tv-start-btn");
tvStartBtn.addEventListener("click", (e) => {
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
  updatePlanePhysics(dt);
  updateTowers(dt, dtMs);
  updateScore();
  if (checkCollisions()) {
    endGame();
  }
}

// --- התנגשויות: רצפה, תקרה, מגדלים ---
function checkCollisions() {
  const halfW = (CONFIG.PLANE_DISPLAY_WIDTH / 2) * CONFIG.PLANE_HITBOX_WIDTH_SCALE;
  const halfH = (CONFIG.PLANE_DISPLAY_HEIGHT / 2) * CONFIG.PLANE_HITBOX_HEIGHT_SCALE;
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

    if (t.shape === "triangle") {
      // תיבת פגיעה מצטמצמת לכיוון הקודקוד (ראו triangleHalfWidthAt) —
      // מלבן קבוע היה פוסל את השחקן על אוויר ריק ליד החוד המחודד.
      // בודקים רק בנקודה העמוקה ביותר של חפיפה אנכית עם כל חלק (הכי
      // רחוקה מהפער) — מספיק כי הרוחב משתנה בצורה מונוטונית, אז אם
      // הנקודה הרחבה ביותר בטווח לא חופפת אופקית, אף נקודה צרה יותר
      // ממנה בטווח גם לא תחפוף.
      const centerX = t.x + CONFIG.TOWER_WIDTH / 2;
      if (top < gapTop) {
        const triHalfW = triangleHalfWidthAt(gapTop - top);
        if (right > centerX - triHalfW && left < centerX + triHalfW) return true;
      }
      if (bottom > gapBottom) {
        const triHalfW = triangleHalfWidthAt(bottom - gapBottom);
        if (right > centerX - triHalfW && left < centerX + triHalfW) return true;
      }
    } else {
      const towerLeft = t.x;
      const towerRight = t.x + CONFIG.TOWER_WIDTH;
      if (right > towerLeft && left < towerRight) {
        if (top < gapTop || bottom > gapBottom) return true; // התנגשות במגדל
      }
    }
  }
  return false;
}

// רוחב-חצי תיבת הפגיעה של מגדל המשולש במרחק נתון מקצה הפער (0 = בדיוק
// על קצה הפער, שם התמונה היא הקודקוד החד). גדל ליניארית עד לרוחב המלא
// (TOWER_WIDTH) במרחק triangleDisplayHeight — בדיוק אותה הגיון כמו
// הגזירה/המילוי בציור (drawTriangleTowerSegment), כך שתיבת הפגיעה
// תמיד תואמת את מה שהשחקן רואה בפועל.
function triangleHalfWidthAt(distFromGapEdge) {
  if (triangleDisplayHeight <= 0) return CONFIG.TOWER_WIDTH / 2;
  const fraction = Math.min(1, Math.max(0, distFromGapEdge / triangleDisplayHeight));
  return (fraction * CONFIG.TOWER_WIDTH) / 2;
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
// כל מגדל חדש מגריל את צורתו באקראי, בהסתברות שווה (שליש-שליש-שליש) —
// לא מחזור קבוע כמו קודם. "משולש" הוא תמונה (ראו ASSET_MANIFEST /
// drawTowerSegment); עגול ומרובע נשארים וקטוריים כמו תמיד.
const TOWER_SHAPES = ["round", "triangle", "square"];
let towers = [];
let towerSpawnTimer = 0;
// גובה התצוגה "המלא" (לא מעוות) של תמונת המשולש, בפרופורציה האמיתית
// שלה ברוחב TOWER_WIDTH — מחושב אחרי טעינת התמונה. ראו drawTriangleTowerSegment.
let triangleDisplayHeight = 0;

function resetTowers() {
  towers = [];
  towerSpawnTimer = 0;
}

function spawnTower() {
  const margin = 60;
  const half = CONFIG.TOWER_GAP / 2;
  const floorY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
  const minGapY = margin + half;
  const maxGapY = floorY - margin - half;
  const gapY = minGapY + Math.random() * Math.max(0, maxGapY - minGapY);
  const shape = TOWER_SHAPES[Math.floor(Math.random() * TOWER_SHAPES.length)];
  towers.push({
    x: CONFIG.WIDTH,
    gapY,
    shape,
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
  // שכבת תמונת-המגדלים (המשולש) לא נדגמת-מחדש כל פריים כמו הרקע (לא
  // ממלאת את כל השטח באטימות), ולכן צריכה ניקוי מפורש בכל פריים.
  towerImagesCtx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  for (const t of towers) {
    const half = CONFIG.TOWER_GAP / 2;
    const topHeight = t.gapY - half;
    const bottomY = t.gapY + half;
    const floorY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
    const bottomHeight = floorY - bottomY;

    drawTowerSegment(t.x, 0, topHeight, CONFIG.TOWER_WIDTH, t.shape, true);
    drawTowerSegment(t.x, bottomY, bottomHeight, CONFIG.TOWER_WIDTH, t.shape, false);
  }
}

// צבעי המגדלים (סעיף 6): כהים ורוויים יותר מכל בניין שברקע (שעבר הקהיה
// ברוויה/ניגודיות בנכס הרקע עצמו), עם קו מתאר באותו גוון כמו המטוס
// (עקביות חזותית) וצל רך וצר בצד ימין לנפח — כך שגם במבט חטוף ברור
// שזה מכשול ולא עוד בניין רקע. ראו design/SPEC.md, "היררכיית בהירות".
const TOWER_FILL = "#3f5564";
const TOWER_OUTLINE = "#1b2a38";
const TOWER_SHADOW = "rgba(10, 18, 26, 0.32)";
const TOWER_SHADOW_WIDTH = 7;
const TOWER_WINDOW_COLOR = "#d9f2fb";

// מצייר קטע מגדל אחד (חלק עליון תלוי מהתקרה, או חלק תחתון עולה מהרצפה).
function drawTowerSegment(x, yTop, height, w, shape, isHanging) {
  if (height <= 0) return;

  if (shape === "triangle") {
    drawTriangleTowerSegment(x, yTop, height, w, isHanging);
    return;
  }

  const radius = w / 2;
  const tipH = shape === "round" ? radius : 0;
  const bodyTop = isHanging ? yTop : yTop + tipH;
  const bodyBottom = isHanging ? yTop + height - tipH : yTop + height;
  const bodyH = bodyBottom - bodyTop;

  ctx.fillStyle = TOWER_FILL;
  ctx.strokeStyle = TOWER_OUTLINE;
  ctx.lineWidth = 2;

  if (bodyH > 0) {
    ctx.fillRect(x, bodyTop, w, bodyH);
    drawWindowGrid(ctx, x, bodyTop, w, bodyH);
    ctx.fillStyle = TOWER_SHADOW;
    ctx.fillRect(x + w - TOWER_SHADOW_WIDTH, bodyTop, TOWER_SHADOW_WIDTH, bodyH);
    ctx.strokeRect(x, bodyTop, w, bodyH);
  }

  ctx.fillStyle = TOWER_FILL;
  if (shape === "round") {
    ctx.beginPath();
    if (isHanging) {
      ctx.moveTo(x, bodyBottom);
      ctx.arc(x + radius, bodyBottom, radius, Math.PI, 0, true);
    } else {
      ctx.moveTo(x, bodyTop);
      ctx.arc(x + radius, bodyTop, radius, Math.PI, 2 * Math.PI, false);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // מרובע: הגג כבר שטוח כחלק מהמלבן, אין צורך בקצה נוסף.
}

// מגדל "משולש" (מגדל עזריאלי המשולש) — לא וקטור, אלא תמונה שלמה מתוך
// assets/tower-triangle.png (ראו ASSET_MANIFEST): מגדל אחד, רציף,
// מקודקוד ועד בסיס — לא ניתן לפרק ל"גוף חוזר + קצה" כמו עגול/מרובע,
// כי הרוחב משתנה בכל שורת פיקסלים (שום שורה לא "דומה" לשכנותיה). לכן
// במקום לגזור פלח שרירותי מתוך מגדל וירטואלי ארוך (כמו שהיה קודם —
// בדיוק זה שיצר "עמוד גנרי קטוע" שלא נראה כמו שום דבר מזוהה), מציירים
// תמיד את התמונה *בשלמותה* בפרופורציה האמיתית שלה (triangleDisplayHeight,
// קבוע, לא תלוי בגובה הפער שהוגרל), **מעוגנת תמיד בקצה הפונה לפער** —
// כך שהקודקוד החד תמיד נופל בדיוק על שפת הפער (המקום הקריטי לעין
// ולמשחק), בלי שום עיוות/מתיחה. שני מצבים:
//  - אם יש מספיק מקום (height >= triangleDisplayHeight): התמונה נגמרת
//    לפני קצה המסך/הרצפה, והשארית מתמלאת בצבע גוף אחיד + רשת חלונות —
//    בדיוק כמו ה"גוף" של עגול/מרובע, לשמירה על מגדל *שלם* שמגיע עד
//    הרצפה/תקרה (לא צף/נקטע באוויר).
//  - אם אין מספיק מקום (height < triangleDisplayHeight): גוזרים את
//    התמונה החל מהקודקוד (תמיד שלם וחד), והבסיס נחתך/מוסתר מחוץ לגבולות
//    המקטע — בלי שום מתיחה אופקית/אנכית של מה שכן מוצג.
// החלק התלוי מהתקרה (isHanging) מצויר *הפוך אנכית* (flip Y בלבד, לא X
// — כדי לשמור על כיוון התאורה/חלונות), כך שהקודקוד שוב נופל בדיוק על
// שפת הפער, הפעם מלמעלה. ראו triangleHalfWidthAt() לתיבת הפגיעה התואמת.
function drawTriangleTowerSegment(x, yTop, height, w, isHanging) {
  const img = assets.towerTriangle;
  if (!img || triangleDisplayHeight <= 0) return;
  const imgH = triangleDisplayHeight;
  const drawH = Math.min(imgH, height);
  const srcH = (drawH / imgH) * img.naturalHeight;

  if (isHanging) {
    const gapEdgeY = yTop + height; // התחתית של הקטע הזה = שפת הפער
    towerImagesCtx.save();
    towerImagesCtx.translate(0, gapEdgeY);
    towerImagesCtx.scale(1, -1); // היפוך אנכי בלבד — לא אופקי
    towerImagesCtx.drawImage(img, 0, 0, img.naturalWidth, srcH, x, 0, w, drawH);
    towerImagesCtx.restore();
    if (height > imgH) {
      const fillH = height - imgH; // מהתקרה (yTop) ועד שהתמונה מתחילה
      towerImagesCtx.fillStyle = TOWER_FILL;
      towerImagesCtx.fillRect(x, yTop, w, fillH);
      drawWindowGrid(towerImagesCtx, x, yTop, w, fillH);
    }
  } else {
    towerImagesCtx.drawImage(img, 0, 0, img.naturalWidth, srcH, x, yTop, w, drawH);
    if (height > imgH) {
      const fillTop = yTop + imgH; // איפה שהתמונה נגמרת ועד הרצפה
      const fillH = height - imgH;
      towerImagesCtx.fillStyle = TOWER_FILL;
      towerImagesCtx.fillRect(x, fillTop, w, fillH);
      drawWindowGrid(towerImagesCtx, x, fillTop, w, fillH);
    }
  }
}

// רשת חלונות על גוף המגדל. מקבל קונטקסט מפורש כי גם קנבס המשחק
// הפיקסלי (עגול/מרובע) וגם שכבת תמונות המגדלים (מילוי המשולש) צריכים
// אותה — ראו הקריאות בשני המקומות.
function drawWindowGrid(targetCtx, x, y, w, h) {
  const pad = 7;
  const cell = 8;
  const gap = 5;
  targetCtx.fillStyle = TOWER_WINDOW_COLOR;
  for (let wy = y + pad; wy <= y + h - pad - cell; wy += cell + gap) {
    for (let wx = x + pad; wx <= x + w - pad - cell; wx += cell + gap) {
      targetCtx.fillRect(wx, wy, cell, cell);
    }
  }
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

// --- מטוס נוסעים — לבן אחיד, מצויר בקוד (ללא הצללה, ללא צבעים נוספים) ---
// כל צורה (גוף/זנב/כנף) מצוירת פעמיים לפני המילוי: קודם הילה בהירה רחבה,
// ואז קו מתאר כהה צר יותר מעליה — כך שנשאר טבעת הילה דקה מחוץ לקו המתאר,
// בדיוק כמו באפקט שהיה אפוי לתוך קובץ התמונה, רק שעכשיו זה נגזר בזמן
// אמת מהצורה עצמה. הסיבוב סביב מרכז המטוס; המיקום מעוגל לרשת הפיקסלים
// האמיתית כדי למנוע רעידות/טשטוש תת-פיקסל.
const PLANE_WHITE = "#f8fafc";
const PLANE_OUTLINE = "#1b2a38";
const PLANE_HALO = "#f5f8fa";

function strokeAndFillShape(path) {
  ctx.lineJoin = "round";
  ctx.strokeStyle = PLANE_HALO;
  ctx.lineWidth = 6;
  ctx.stroke(path);
  ctx.strokeStyle = PLANE_OUTLINE;
  ctx.lineWidth = 4;
  ctx.stroke(path);
  ctx.fillStyle = PLANE_WHITE;
  ctx.fill(path);
}

function drawPlane(x, y, angle = 0) {
  const w = CONFIG.PLANE_DISPLAY_WIDTH;
  const h = CONFIG.PLANE_DISPLAY_HEIGHT;

  ctx.save();
  ctx.translate(snapToPixelGrid(x), snapToPixelGrid(y));
  ctx.rotate(angle);

  // זנב (מצויר ראשון, מתחת לגוף)
  const tail = new Path2D();
  tail.moveTo(-w / 2 + 2, -h / 2 + 2);
  tail.lineTo(-w / 2 - 8, -h);
  tail.lineTo(-w / 2 + 12, -h / 2 + 2);
  tail.closePath();
  strokeAndFillShape(tail);

  // כנף
  const wing = new Path2D();
  wing.moveTo(-6, h / 2 - 4);
  wing.lineTo(-20, h + 6);
  wing.lineTo(4, h / 2 + 2);
  wing.closePath();
  strokeAndFillShape(wing);

  // גוף ראשי — משושה מוארך עם חרטום מחודד ימינה
  const body = new Path2D();
  body.moveTo(-w / 2, -h / 2);
  body.lineTo(w / 2 - 10, -h / 2);
  body.lineTo(w / 2, 0);
  body.lineTo(w / 2 - 10, h / 2);
  body.lineTo(-w / 2, h / 2);
  body.closePath();
  strokeAndFillShape(body);

  // שורת חלונות תא הנוסעים + חלון תא הטייס — כהים, לא "צבע" אלא פרט תפקודי
  ctx.fillStyle = PLANE_OUTLINE;
  for (let i = -3; i <= 1; i++) {
    ctx.fillRect(i * 8 - 2, -5, 5, 5);
  }
  ctx.fillRect(12, -3, 6, 6);

  ctx.restore();
}

// --- אתחול: טוענים נכסים, ואז מתחילים את לולאת המשחק ---
loadAssets(ASSET_MANIFEST)
  .then(() => {
    cityTileWidth = CONFIG.HEIGHT * (assets.backgroundCity.naturalWidth / assets.backgroundCity.naturalHeight);
    triangleDisplayHeight =
      CONFIG.TOWER_WIDTH * (assets.towerTriangle.naturalHeight / assets.towerTriangle.naturalWidth);
    loadingScreen.classList.add("hidden");
    requestAnimationFrame(gameLoop);
  })
  .catch((err) => {
    loadingScreen.querySelector(".loading-text").textContent = "שגיאה בטעינת המשחק";
    console.error(err);
  });
