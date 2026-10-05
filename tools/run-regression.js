// פקודת רגרסיה מאוחדת לפרויקט (ראו design/PROTECTED.md ו-CLAUDE.md:
// להריץ לפני כל commit). מאחדת:
//   1. tools/check-assets.js — עקביות APP_SHELL/ASSET_MANIFEST/גרסאות.
//   2. עצמאות הצורות: topShape !== bottomShape תמיד (spawnTower אמיתי).
//   3. מגן המרווח האופקי (MIN_TOWER_DISTANCE).
//   4. משחק אמיתי (פיזיקה אמיתית, ~12 שניות) בלי שגיאות קונסול.
//   5. בדיקת פיקסל-מדויק: שום fill לא מבצבץ ליד חוד המשולש (3.7.3-style).
//   6. השוואת צילומי debug=towers מול baseline דטרמיניסטי
//      ב-design/verify/regression-baseline-*.png — כל הבדל פיקסל נכשל.
//
// מריץ שרת סטטי זמני משלו (לא תלוי בשרת פיתוח שכבר רץ על 8080) ודפדפן
// Playwright אמיתי (תלות dev יחידה של הפרויקט — ראו package.json).
// --update-baseline: במקום להשוות, שומר את הצילום הנוכחי כ-baseline
// החדש (להשתמש רק אחרי שינוי מראה מכוון ומאושר — ראו CLAUDE.md).
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { readPng } = require("./png-lib");

const ROOT = path.join(__dirname, "..");
const VERIFY_DIR = path.join(ROOT, "design", "verify");
const UPDATE_BASELINE = process.argv.includes("--update-baseline");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      let filePath = path.join(ROOT, urlPath === "/" ? "/index.html" : urlPath);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("Not found"); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
  return ok;
}

async function withFreshPage(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.getElementById("loading-screen").classList.contains("hidden"),
    { timeout: 10000 }
  );
  return { page, errors };
}

(async () => {
  section("1/6 check-assets.js");
  try {
    const out = execFileSync("node", [path.join(__dirname, "check-assets.js")], { cwd: ROOT, encoding: "utf8" });
    console.log("  " + out.trim());
    check("check-assets.js", true);
  } catch (e) {
    check("check-assets.js", false, (e.stdout || e.message || "").toString().trim());
  }

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const userDataDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "flappy-regression-"));
  const context = await chromium.launchPersistentContext(userDataDir, { viewport: { width: 500, height: 900 } });

  try {
    section("2/6 + 3/6: עצמאות צורות + מגן מרווח (spawnTower אמיתי)");
    {
      const { page, errors } = await withFreshPage(context, `${baseUrl}/index.html`);
      const result = await page.evaluate(() => {
        towers = [];
        let shapeViolations = 0, spacingViolations = 0, created = 0;
        const perShapeTop = { round: 0, square: 0, triangle: 0 };
        const perShapeBottom = { round: 0, square: 0, triangle: 0 };
        for (let i = 0; i < 600; i++) {
          const before = towers.length;
          spawnTower();
          if (towers.length > before) {
            created++;
            const t = towers[towers.length - 1];
            perShapeTop[t.topShape]++;
            perShapeBottom[t.bottomShape]++;
            if (t.topShape === t.bottomShape) shapeViolations++;
          }
          // מריץ גם כשהמרווח לא מספיק (בלי להזיז טאוורים), כדי לוודא
          // שה-guard באמת חוסם יצירה צפופה מדי.
          if (i % 3 !== 0) continue;
          for (const tw of towers) tw.x -= 1000; // מפנה מקום ל-spawn הבא
        }
        // בדיקת המגן במפורש: שני מגדלים צמודים מדי לא אמורים להיווצר יחד.
        towers = [{ x: CONFIG.WIDTH - CONFIG.TOWER_WIDTH - 10, gapY: 300, topShape: "round", bottomShape: "square", passed: false }];
        const beforeGuard = towers.length;
        spawnTower();
        if (towers.length > beforeGuard) spacingViolations++;
        return { created, shapeViolations, spacingViolations, perShapeTop, perShapeBottom };
      });
      check("0 התאמות topShape===bottomShape", result.shapeViolations === 0, `${result.shapeViolations}/${result.created}`);
      check("MIN_TOWER_DISTANCE חוסם spawn צפוף מדי", result.spacingViolations === 0, `${result.spacingViolations} הפרות`);
      check("אין שגיאות קונסול", errors.length === 0, errors.join(" | "));
      console.log("  התפלגות top:", JSON.stringify(result.perShapeTop), " bottom:", JSON.stringify(result.perShapeBottom));
      await page.close();
    }

    section("4/6 משחק אמיתי (~12 שניות, בלי שגיאות קונסול)");
    {
      const { page, errors } = await withFreshPage(context, `${baseUrl}/index.html`);
      await page.click("#start-btn");
      let gameOverSeen = false;
      const start = Date.now();
      while (Date.now() - start < 12000) {
        const state = await page.evaluate(() => ({
          gameState, planeY: plane.y, height: CONFIG.HEIGHT,
        })).catch(() => null);
        if (!state) break;
        if (state.gameState === "gameover") {
          gameOverSeen = true;
          await page.click("#retry-btn");
        } else if (state.planeY > state.height * 0.52) {
          await page.keyboard.press("Space");
        }
        await page.waitForTimeout(120);
      }
      check("gameover הגיע לפחות פעם אחת (התנגשויות עובדות)", gameOverSeen);
      check("אין שגיאות קונסול במהלך משחק אמיתי", errors.length === 0, errors.join(" | "));
      await page.close();
    }

    section("5/6 בדיקת פיקסל-מדויק: אין fill ליד חוד המשולש");
    {
      const { page, errors } = await withFreshPage(context, `${baseUrl}/index.html`);
      const geom = await page.evaluate(() => ({ half: CONFIG.TOWER_GAP / 2, H: CONFIG.HEIGHT }));
      const L = 300;
      for (const side of ["top", "bottom"]) {
        const gapY = side === "top" ? L + geom.half : (geom.H - L) - geom.half;
        const sampleX = 63;
        const sampleY = side === "top" ? L - 10 : (gapY + geom.half) + 10;
        const { withTower, withoutTower } = await page.evaluate(
          ({ gapY, sampleX, sampleY }) => {
            function sample(x, y) {
              const tmp = document.createElement("canvas");
              tmp.width = CONFIG.WIDTH; tmp.height = CONFIG.HEIGHT;
              const tctx = tmp.getContext("2d");
              tctx.drawImage(bgCanvas, 0, 0, bgCanvas.width, bgCanvas.height, 0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
              tctx.drawImage(towerImagesCanvas, 0, 0, towerImagesCanvas.width, towerImagesCanvas.height, 0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
              tctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
              return Array.from(tctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
            }
            towers = [{ x: 60, gapY, topShape: "triangle", bottomShape: "triangle", passed: false }];
            render();
            const withTower = sample(sampleX, sampleY);
            towers = [];
            render();
            const withoutTower = sample(sampleX, sampleY);
            return { withTower, withoutTower };
          },
          { gapY, sampleX, sampleY }
        );
        check(`משולש ${side}: d=10 מהפער זהה לרקע נקי`, JSON.stringify(withTower) === JSON.stringify(withoutTower));
      }
      check("אין שגיאות קונסול", errors.length === 0, errors.join(" | "));
      await page.close();
    }

    section(`6/6 השוואת צילומים מול baseline ${UPDATE_BASELINE ? "(מצב עדכון)" : ""}`);
    {
      fs.mkdirSync(VERIFY_DIR, { recursive: true });
      const geom = { half: 86, H: 600 }; // CONFIG.TOWER_GAP/2, CONFIG.HEIGHT -- קבועים מוגנים, ראו PROTECTED.md
      const SCENARIOS = [
        { shape: "round", side: "top", L: 350 },
        { shape: "round", side: "bottom", L: 350 },
        { shape: "square", side: "top", L: 350 },
        { shape: "square", side: "bottom", L: 350 },
        { shape: "triangle", side: "top", L: 300 },
        { shape: "triangle", side: "bottom", L: 300 },
      ];
      for (const sc of SCENARIOS) {
        const gapY = sc.side === "top" ? sc.L + geom.half : (geom.H - sc.L) - geom.half;
        const url = `${baseUrl}/index.html?debug=towers&shape=${sc.shape}&gapY=${gapY}`;
        const { page, errors } = await withFreshPage(context, url);
        await page.click("#start-btn");
        // דטרמיניזם מלא דורש שני תיקונים, לא רק איפוס cityOffset:
        // (1) לולאת המשחק החיה (gameLoop) ממשיכה לרוץ ברקע עם כל טעינת
        //     עמוד, ו-updateBackgroundCity רץ בה גם כש-DEBUG_FROZEN_TOWER
        //     פעיל (הוא נבדק רק *אחרי* עדכון הרקע ב-update()) -- בלי
        //     לנטרל את ה-loop, כל המתנה מריצה עוד טיקים שמזיזים את
        //     cityOffset שוב ומבטלים את האיפוס.
        // (2) ציור ב-canvas סינכרוני, אבל ה-compositor של כרום יכול
        //     "לפגר" פריים אחד מאחורי ה-bitmap המעודכן -- Playwright
        //     עלול לצלם פריים ישן-אחד-אחורה בלי המתנה אמיתית אחריו.
        // נמדד בפועל: בלי שני אלה, ~545,000 בתים שונים בין שני צילומים
        // של אותה סצנה המדויקת; עם שניהם, 0.
        await page.evaluate(() => { window.requestAnimationFrame = () => 0; }); // עוצר טיקים עתידיים (אחד שכבר תוזמן עוד עלול לרוץ)
        await page.waitForTimeout(30); // נותן לטיק האחרון-שכבר-מתוזמן (אם יש) להסתיים
        await page.evaluate(() => {
          document.getElementById("start-screen").classList.add("hidden");
          document.getElementById("hud").classList.add("hidden");
          cityOffset = 0;
          render(); // הציור הדטרמיניסטי האמיתי והאחרון -- אחריו אין עוד טיקים בכלל
        });
        await page.waitForTimeout(50); // זמן אמיתי ל-compositor לשקף את הציור האחרון
        const capturePath = path.join(VERIFY_DIR, `_tmp-${sc.shape}-${sc.side}.png`);
        const box = await page.locator("#game").boundingBox();
        await page.screenshot({ path: capturePath, clip: box });
        await page.close();

        const baselinePath = path.join(VERIFY_DIR, `regression-baseline-${sc.shape}-${sc.side}.png`);
        if (UPDATE_BASELINE || !fs.existsSync(baselinePath)) {
          fs.copyFileSync(capturePath, baselinePath);
          console.log(`  📸 baseline ${fs.existsSync(baselinePath) && !UPDATE_BASELINE ? "נוצר" : "עודכן"}: regression-baseline-${sc.shape}-${sc.side}.png`);
        } else {
          const a = readPng(capturePath);
          const b = readPng(baselinePath);
          let diffPixels = 0, maxDelta = 0;
          if (a.width === b.width && a.height === b.height) {
            for (let i = 0; i < a.pixels.length; i++) {
              const d = Math.abs(a.pixels[i] - b.pixels[i]);
              if (d > 0) { diffPixels++; maxDelta = Math.max(maxDelta, d); }
            }
          }
          const sameSize = a.width === b.width && a.height === b.height;
          const identical = sameSize && diffPixels === 0;
          check(
            `${sc.shape}-${sc.side} זהה ל-baseline`,
            identical,
            sameSize ? `${diffPixels} בתים שונים, Δmax=${maxDelta}` : `גודל שונה: ${a.width}x${a.height} מול ${b.width}x${b.height}`
          );
        }
        check(`${sc.shape}-${sc.side}: אין שגיאות קונסול`, errors.length === 0, errors.join(" | "));
        fs.unlinkSync(capturePath);
      }
    }
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    server.close();
  }

  console.log(`\n${"=".repeat(40)}`);
  if (failures === 0) {
    console.log("✅ כל הבדיקות עברו.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} בדיקות נכשלו.`);
    process.exit(1);
  }
})();
