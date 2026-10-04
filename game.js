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
  TOWER_GAP: 160,         // רווח אנכי בין שני חלקי המגדל
  TOWER_INTERVAL: 1500,   // מילישניות בין מגדל למגדל
  TOWER_WIDTH: 70,

  GROUND_HEIGHT: 40,

  PLANE_X: 110,           // מיקום אופקי קבוע של המטוס
  PLANE_WIDTH: 54,
  PLANE_HEIGHT: 22,

  PARALLAX_FACTOR: 0.35,  // קו הרקיע זז ביחס הזה ממהירות המגדלים
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

// מונע גלילה/זום של הדף במהלך משחק במובייל.
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

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

// --- מצבי משחק ---
const STATE = { START: "start", PLAYING: "playing", GAMEOVER: "gameover" };
let gameState = STATE.START;

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

function onFlapInput(e) {
  e.preventDefault();
  handlePrimaryAction();
}

canvas.addEventListener("mousedown", onFlapInput);
canvas.addEventListener("touchstart", onFlapInput, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    handlePrimaryAction();
  }
});

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
  // רקעים ממשיכים לזוז גם במסכי פתיחה/סיום, לאפקט רקע חי
  updateClouds(dt);
  updateSkyline(dt);
  if (gameState !== STATE.PLAYING) return;
  updatePlanePhysics(dt);
  updateTowers(dt, dtMs);
  updateRoad(dt);
  updateScore();
  if (checkCollisions()) {
    endGame();
  }
}

// --- התנגשויות: רצפה, תקרה, מגדלים ---
function checkCollisions() {
  const halfW = (CONFIG.PLANE_WIDTH / 2) * 0.8;
  const halfH = (CONFIG.PLANE_HEIGHT / 2) * 0.8;
  const top = plane.y - halfH;
  const bottom = plane.y + halfH;
  const floorY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;

  if (bottom >= floorY) return true; // התנגשות ברצפה
  if (top <= 0) return true; // התנגשות בתקרה

  const left = plane.x - halfW;
  const right = plane.x + halfW;
  const half = CONFIG.TOWER_GAP / 2;

  for (const t of towers) {
    const towerLeft = t.x;
    const towerRight = t.x + CONFIG.TOWER_WIDTH;
    if (right > towerLeft && left < towerRight) {
      const gapTop = t.gapY - half;
      const gapBottom = t.gapY + half;
      if (top < gapTop || bottom > gapBottom) return true; // התנגשות במגדל
    }
  }
  return false;
}

function updatePlanePhysics(dt) {
  plane.vy += CONFIG.GRAVITY * dt;
  plane.vy = Math.max(CONFIG.MAX_RISE_SPEED, Math.min(plane.vy, CONFIG.MAX_FALL_SPEED));
  plane.y += plane.vy * dt;

  // הטיית האף: עולה כשמטפסים, צונחת כשנופלים, עם ריכוך לתנועה חלקה
  const targetAngle = Math.max(-0.5, Math.min(0.9, plane.vy / 10));
  const ease = 1 - Math.pow(1 - 0.25, dt);
  plane.angle += (targetAngle - plane.angle) * ease;
}

function render() {
  drawSky();
  drawClouds();
  drawSkyline();
  drawTowers();
  drawGround();
  drawPlane(plane.x, plane.y, plane.angle);
}

// --- מגדלים (בסגנון מגדלי עזריאלי: עגול / משולש / מרובע, מתחלפים) ---
const TOWER_SHAPES = ["round", "triangle", "square"];
let towers = [];
let towerSpawnTimer = 0;
let nextShapeIndex = 0;

function resetTowers() {
  towers = [];
  towerSpawnTimer = 0;
  nextShapeIndex = 0;
}

function spawnTower() {
  const margin = 60;
  const half = CONFIG.TOWER_GAP / 2;
  const floorY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
  const minGapY = margin + half;
  const maxGapY = floorY - margin - half;
  const gapY = minGapY + Math.random() * Math.max(0, maxGapY - minGapY);
  const shape = TOWER_SHAPES[nextShapeIndex % TOWER_SHAPES.length];
  nextShapeIndex++;
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

// מצייר קטע מגדל אחד (חלק עליון תלוי מהתקרה, או חלק תחתון עולה מהרצפה).
function drawTowerSegment(x, yTop, height, w, shape, isHanging) {
  if (height <= 0) return;

  const radius = w / 2;
  const tipH = shape === "square" ? 0 : shape === "round" ? radius : Math.min(26, height * 0.35);
  const bodyTop = isHanging ? yTop : yTop + tipH;
  const bodyBottom = isHanging ? yTop + height - tipH : yTop + height;
  const bodyH = bodyBottom - bodyTop;

  ctx.fillStyle = "#9aa0a6";
  ctx.strokeStyle = "#6e7378";
  ctx.lineWidth = 2;

  if (bodyH > 0) {
    ctx.fillRect(x, bodyTop, w, bodyH);
    ctx.strokeRect(x, bodyTop, w, bodyH);
    drawWindowGrid(x, bodyTop, w, bodyH);
  }

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
  } else if (shape === "triangle") {
    ctx.beginPath();
    if (isHanging) {
      ctx.moveTo(x, bodyBottom);
      ctx.lineTo(x + w, bodyBottom);
      ctx.lineTo(x + w / 2, yTop + height);
    } else {
      ctx.moveTo(x, bodyTop);
      ctx.lineTo(x + w, bodyTop);
      ctx.lineTo(x + w / 2, yTop);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // מרובע: הגג כבר שטוח כחלק מהמלבן, אין צורך בקצה נוסף.
}

// רשת חלונות על גוף המגדל.
function drawWindowGrid(x, y, w, h) {
  const pad = 7;
  const cell = 8;
  const gap = 5;
  ctx.fillStyle = "#bfe3f0";
  for (let wy = y + pad; wy <= y + h - pad - cell; wy += cell + gap) {
    for (let wx = x + pad; wx <= x + w - pad - cell; wx += cell + gap) {
      ctx.fillRect(wx, wy, cell, cell);
    }
  }
}

// --- רקע: שמיים (פסים שטוחים בסגנון פיקסל-ארט, לא גרדיאנט חלק) ---
const SKY_BANDS = [
  { color: "#4fb8ea", upto: 0.35 },
  { color: "#6ec6ef", upto: 0.65 },
  { color: "#9adcf2", upto: 1.0 },
];

function drawSky() {
  let prevY = 0;
  for (const band of SKY_BANDS) {
    const y = CONFIG.HEIGHT * band.upto;
    ctx.fillStyle = band.color;
    ctx.fillRect(0, prevY, CONFIG.WIDTH, y - prevY);
    prevY = y;
  }
}

// --- עננים פיקסליים, parallax איטי מאוד ---
const CLOUDS = [
  { x: 30, y: 70, scale: 1.1 },
  { x: 230, y: 50, scale: 0.9 },
  { x: 330, y: 140, scale: 1.3 },
  { x: 120, y: 160, scale: 0.8 },
];
const CLOUD_TILE_WIDTH = CONFIG.WIDTH + 140;
let cloudOffset = 0;

function updateClouds(dt) {
  cloudOffset += CONFIG.TOWER_SPEED * CONFIG.PARALLAX_FACTOR * 0.4 * dt;
  cloudOffset %= CLOUD_TILE_WIDTH;
}

function drawClouds() {
  ctx.fillStyle = "#ffffff";
  for (const tileStart of [-cloudOffset, -cloudOffset + CLOUD_TILE_WIDTH]) {
    for (const c of CLOUDS) {
      drawPixelCloud(tileStart + c.x, c.y, c.scale);
    }
  }
}

function drawPixelCloud(x, y, scale) {
  const u = 8 * scale; // יחידת "פיקסל" של הענן
  ctx.fillRect(x - u, y, u * 4, u);
  ctx.fillRect(x, y - u, u * 2.5, u);
}

// --- קו רקיע של תל אביב, זז לאט יותר מהמגדלים (parallax) ---
const SKYLINE_TILE_WIDTH = CONFIG.WIDTH;
const SKYLINE_BUILDINGS = [
  { x: 10, w: 40, h: 70, shape: "rect" },
  { x: 55, w: 36, h: 100, shape: "round" },
  { x: 100, w: 30, h: 60, shape: "rect" },
  { x: 140, w: 44, h: 120, shape: "triangle" },
  { x: 195, w: 34, h: 80, shape: "rect" },
  { x: 240, w: 38, h: 95, shape: "round" },
  { x: 290, w: 28, h: 65, shape: "rect" },
  { x: 330, w: 42, h: 110, shape: "triangle" },
  { x: 380, w: 20, h: 55, shape: "rect" },
];
let skylineOffset = 0;

function updateSkyline(dt) {
  skylineOffset += CONFIG.TOWER_SPEED * CONFIG.PARALLAX_FACTOR * dt;
  skylineOffset %= SKYLINE_TILE_WIDTH;
}

function drawSkyline() {
  const baseY = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (const tileStart of [-skylineOffset, -skylineOffset + SKYLINE_TILE_WIDTH]) {
    for (const b of SKYLINE_BUILDINGS) {
      drawSkylineBuilding(tileStart + b.x, baseY, b.w, b.h, b.shape);
    }
  }
  ctx.restore();
}

function drawSkylineBuilding(x, baseY, w, h, shape) {
  const top = baseY - h;
  ctx.beginPath();
  if (shape === "round") {
    const r = w / 2;
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, top + r);
    ctx.arc(x + r, top + r, r, Math.PI, 2 * Math.PI, false);
    ctx.lineTo(x + w, baseY);
  } else if (shape === "triangle") {
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w, baseY);
  } else {
    ctx.rect(x, top, w, h);
  }
  ctx.closePath();
  ctx.fill();
}

// --- כביש בתחתית המסך (במקום רצפת אדמה), עם מכוניות פיקסליות חולפות ---
function drawGround() {
  const y = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
  ctx.fillStyle = "#3a3a3e";
  ctx.fillRect(0, y, CONFIG.WIDTH, CONFIG.GROUND_HEIGHT);
  ctx.fillStyle = "#2a2a2d";
  ctx.fillRect(0, y, CONFIG.WIDTH, 6);

  // פס הפרדה מקווקו, זז במהירות המגדלים (שכבת קדמה)
  const dashY = y + CONFIG.GROUND_HEIGHT / 2 - 2;
  ctx.fillStyle = "#f2c94c";
  const dashWidth = 16;
  const dashGap = 14;
  const start = -(roadOffset % (dashWidth + dashGap));
  for (let x = start; x < CONFIG.WIDTH; x += dashWidth + dashGap) {
    ctx.fillRect(x, dashY, dashWidth, 4);
  }

  drawCars(y);
}

const CARS = [
  { x: 40, color: "#e94f4f" },
  { x: 220, color: "#4f8de9" },
  { x: 330, color: "#f2c94c" },
];
const CAR_TILE_WIDTH = CONFIG.WIDTH + 120;
let roadOffset = 0;

function updateRoad(dt) {
  roadOffset += CONFIG.TOWER_SPEED * dt;
  roadOffset %= 100000;
}

function drawCars(roadY) {
  const base = -(roadOffset % CAR_TILE_WIDTH);
  ctx.save();
  for (const tileStart of [base, base + CAR_TILE_WIDTH]) {
    for (const car of CARS) {
      drawPixelCar(tileStart + car.x, roadY + CONFIG.GROUND_HEIGHT - 14, car.color);
    }
  }
  ctx.restore();
}

function drawPixelCar(x, y, color) {
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 1, y - 1, 24, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 22, 10);
  ctx.fillStyle = "#cdeffd";
  ctx.fillRect(x + 5, y - 5, 12, 6);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x + 2, y + 8, 5, 5);
  ctx.fillRect(x + 15, y + 8, 5, 5);
}

// --- מטוס נוסעים גנרי, מצויר בקוד בסגנון פיקסל-ארט (ללא לוגו חברת תעופה) ---
function drawPlane(x, y, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const w = CONFIG.PLANE_WIDTH;
  const h = CONFIG.PLANE_HEIGHT;
  const outline = "#1b2a38";

  // זנב (מצויר ראשון, מתחת לגוף)
  ctx.fillStyle = "#d8232a";
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 2, -h / 2 + 2);
  ctx.lineTo(-w / 2 - 8, -h);
  ctx.lineTo(-w / 2 + 12, -h / 2 + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();

  // כנף
  ctx.fillStyle = "#c21f27";
  ctx.beginPath();
  ctx.moveTo(-6, h / 2 - 4);
  ctx.lineTo(-20, h + 6);
  ctx.lineTo(4, h / 2 + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // גוף ראשי — מלבן שטוח עם חרטום משופע, לא אליפסה חלקה
  ctx.fillStyle = "#eef3f6";
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2 - 10, -h / 2);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2 - 10, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // פס גוף כחול
  ctx.fillStyle = "#2b6cb0";
  ctx.fillRect(-w / 2, 3, w - 6, 5);

  // שורת חלונות מרובעים
  ctx.fillStyle = "#1b2a38";
  for (let i = -3; i <= 1; i++) {
    ctx.fillRect(i * 8 - 2, -5, 5, 5);
  }

  ctx.restore();
}

requestAnimationFrame(gameLoop);
