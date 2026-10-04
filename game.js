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

// --- לולאת משחק מבוססת delta time ---
let lastTime = null;

function gameLoop(now) {
  if (lastTime === null) lastTime = now;
  const dtMs = now - lastTime;
  lastTime = now;
  // מנורמל כך ש-1.0 = פריים אחד ב-60fps
  const dt = Math.min(dtMs / (1000 / 60), 3);

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  // ייתמלא בשלבים הבאים (פיזיקת מטוס, מגדלים וכו')
}

function render() {
  drawSky();
  drawGround();
  drawPlane(CONFIG.PLANE_X, CONFIG.HEIGHT / 2);
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
