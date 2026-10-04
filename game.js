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
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// --- מצבי משחק ---
const STATE = { START: "start", PLAYING: "playing", GAMEOVER: "gameover" };
let gameState = STATE.START;

const startScreen = document.getElementById("start-screen");
const gameoverScreen = document.getElementById("gameover-screen");
const hud = document.getElementById("hud");
const startBtn = document.getElementById("start-btn");
const retryBtn = document.getElementById("retry-btn");

function updateScreens() {
  startScreen.classList.toggle("hidden", gameState !== STATE.START);
  gameoverScreen.classList.toggle("hidden", gameState !== STATE.GAMEOVER);
  hud.classList.toggle("hidden", gameState !== STATE.PLAYING);
}

function startGame() {
  resetPlane();
  resetTowers();
  gameState = STATE.PLAYING;
  updateScreens();
}

function endGame() {
  gameState = STATE.GAMEOVER;
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
  if (gameState !== STATE.PLAYING) return;
  updatePlanePhysics(dt);
  updateTowers(dt, dtMs);
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

// --- רקע: שמיים ---
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, CONFIG.HEIGHT);
  g.addColorStop(0, "#6ec6ff");
  g.addColorStop(1, "#cdeffd");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
}

// --- רצפה ---
function drawGround() {
  const y = CONFIG.HEIGHT - CONFIG.GROUND_HEIGHT;
  ctx.fillStyle = "#8d6e4a";
  ctx.fillRect(0, y, CONFIG.WIDTH, CONFIG.GROUND_HEIGHT);
  ctx.fillStyle = "#6b4f33";
  ctx.fillRect(0, y, CONFIG.WIDTH, 6);
}

// --- מטוס נוסעים גנרי, מצויר בקוד ---
function drawPlane(x, y, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const w = CONFIG.PLANE_WIDTH;
  const h = CONFIG.PLANE_HEIGHT;

  // גוף המטוס
  ctx.fillStyle = "#f5f5f5";
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b0b0b0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // כנף
  ctx.fillStyle = "#d8232a";
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-18, 16);
  ctx.lineTo(2, 6);
  ctx.closePath();
  ctx.fill();

  // זנב
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 4, -2);
  ctx.lineTo(-w / 2 - 6, -16);
  ctx.lineTo(-w / 2 + 10, -4);
  ctx.closePath();
  ctx.fill();

  // חרטום
  ctx.fillStyle = "#e0e0e0";
  ctx.beginPath();
  ctx.ellipse(w / 2 - 4, 0, 6, h / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // חלונות
  ctx.fillStyle = "#2b6cb0";
  for (let i = -1; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 9, -1, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

requestAnimationFrame(gameLoop);
