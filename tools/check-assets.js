// בדיקת שלמות נכסים + גרסה, להרצה לפני כל push (או בתוך CI אם יתווסף
// כזה בעתיד): node tools/check-assets.js
//
// נולד מ-design/AUDIT-2.md: שני באגים אמיתיים שקרו בפרויקט הזה (קובץ
// ברשימת ה-precache של service-worker.js שלא הועלה ל-git בכלל —
// מפיל את כל ה-install לצמיתות; וקובץ יתום ב-assets/ שלא מקושר משום
// מקום) — שני המקרים האלה היו נתפסים מיידית אילו הסקריפט הזה היה קיים
// ורץ לפני ה-commit. גם מוודא ש-BUILD_VERSION ו-CACHE_VERSION לא
// מתפצלים לשני מספרים שונים (ראו ההערה ב-service-worker.js על למה הם
// שני קבועים נפרדים ולא קובץ משותף אחד דרך importScripts).
//
// ללא תלויות חיצוניות בכוונה (בלי npm/package.json בפרויקט הזה כולו —
// ראו CLAUDE.md) — רק fs/path מובנים.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf8");
const exists = (relPath) => fs.existsSync(path.join(ROOT, relPath));

let failures = [];
let warnings = [];

// --- 1. חילוץ APP_SHELL מתוך service-worker.js ---
const swSource = read("service-worker.js");
const appShellMatch = swSource.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!appShellMatch) {
  failures.push("לא הצלחתי למצוא את מערך APP_SHELL ב-service-worker.js (שינוי מבנה הקובץ?)");
}
const appShell = appShellMatch
  ? [...appShellMatch[1].matchAll(/"(\.\/[^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""))
  : [];

// --- 2. חילוץ ASSET_MANIFEST מתוך game.js ---
const gameSource = read("game.js");
const manifestMatch = gameSource.match(/const ASSET_MANIFEST = \{([\s\S]*?)\};/);
if (!manifestMatch) {
  failures.push("לא הצלחתי למצוא את אובייקט ASSET_MANIFEST ב-game.js (שינוי מבנה הקובץ?)");
}
const assetManifestPaths = manifestMatch
  ? [...manifestMatch[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1])
  : [];

// --- 3. כל קובץ ב-APP_SHELL וב-ASSET_MANIFEST חייב להתקיים בדיסק ---
for (const rel of appShell) {
  if (rel === "" || rel === "./") continue; // ה-root עצמו, לא קובץ פיזי
  if (!exists(rel)) {
    failures.push(`APP_SHELL מצביע על קובץ שלא קיים בדיסק: ${rel}`);
  }
}
for (const rel of assetManifestPaths) {
  if (!exists(rel)) {
    failures.push(`ASSET_MANIFEST מצביע על קובץ שלא קיים בדיסק: ${rel}`);
  }
}

// --- 4. כל קובץ שבתיקיית assets/ חייב להיות מקושר מ-ASSET_MANIFEST או מ-APP_SHELL ---
const assetsDir = path.join(ROOT, "assets");
if (fs.existsSync(assetsDir)) {
  const actualFiles = fs.readdirSync(assetsDir).map((f) => "assets/" + f);
  const referenced = new Set([...appShell, ...assetManifestPaths]);
  for (const f of actualFiles) {
    if (!referenced.has(f)) {
      failures.push(`קובץ יתום ב-assets/ — לא מופיע לא ב-APP_SHELL ולא ב-ASSET_MANIFEST: ${f}`);
    }
  }
}

// --- 5. BUILD_VERSION (version.js) מול CACHE_VERSION (service-worker.js) ---
const versionSource = exists("version.js") ? read("version.js") : null;
if (!versionSource) {
  failures.push("version.js לא נמצא");
} else {
  const buildVersionMatch = versionSource.match(/BUILD_VERSION\s*=\s*"([^"]+)"/);
  const cacheVersionMatch = swSource.match(/CACHE_VERSION\s*=\s*"([^"]+)"/);
  if (!buildVersionMatch) {
    failures.push("לא מצאתי BUILD_VERSION ב-version.js");
  } else if (!cacheVersionMatch) {
    failures.push("לא מצאתי CACHE_VERSION ב-service-worker.js");
  } else if (buildVersionMatch[1] !== cacheVersionMatch[1]) {
    failures.push(
      `BUILD_VERSION (version.js) = "${buildVersionMatch[1]}" אבל CACHE_VERSION (service-worker.js) = "${cacheVersionMatch[1]}" — חייבים להיות זהים.`
    );
  }
}

// --- 6. index.html חייב לטעון version.js לפני game.js (לא רק שהקובץ קיים) ---
const indexSource = exists("index.html") ? read("index.html") : "";
const versionScriptIdx = indexSource.indexOf('src="version.js"');
const gameScriptIdx = indexSource.indexOf('src="game.js"');
if (versionScriptIdx === -1) {
  failures.push("index.html לא טוען version.js בכלל");
} else if (gameScriptIdx === -1) {
  failures.push("index.html לא טוען game.js בכלל");
} else if (versionScriptIdx > gameScriptIdx) {
  failures.push("version.js נטען אחרי game.js ב-index.html — game.js צריך את BUILD_VERSION בזמן ריצה");
}

// --- דוח ---
if (warnings.length) {
  console.log("אזהרות:");
  for (const w of warnings) console.log("  ⚠ " + w);
}
if (failures.length) {
  console.error(`\n❌ ${failures.length} בעיה/ות נמצאו:`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(
  `✅ הכל תקין: ${appShell.length} קבצים ב-APP_SHELL, ${assetManifestPaths.length} ב-ASSET_MANIFEST, אין יתומים ב-assets/, הגרסאות תואמות.`
);
