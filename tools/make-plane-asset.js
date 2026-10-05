// בונה assets/plane.png מתוך design/raw/NEW_PLANE.png: מאמת שהמקור הוא
// הגדלה נקייה פי 6 בדגימת-שכן-קרוב (כל בלוק 6x6 פיקסלים אחיד — זה מה
// שהופך אותו לאמנות-פיקסל "אמיתית" של 89x47, לא תמונה מוחלקת/מעובדת),
// ואז מקטין בדיוק פי 6 חזרה (נכס הפלט תמיד 89x47 — ראו PLANE_ASSET
// ב-game.js). לא מצייר מחדש, לא נוגע בצבעים, לא מוסיף קו מתאר/הילה —
// התמונה היא העיצוב (ראו CLAUDE.md, "מדיניות אי-רגרסיה").
// שימוש ב-Playwright (לא מפוענח/מקודד PNG ידני) כי צריך לקודד PNG בחזרה
// אחרי ההקטנה, לא רק לפענח — ראו tools/png-lib.js להסבר למה זה מספיק
// לפענוח בלבד בסקריפטים האחרים.
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { readPng } = require("./png-lib");

const SRC = path.join(__dirname, "..", "design", "raw", "NEW_PLANE.png");
const DEST = path.join(__dirname, "..", "assets", "plane.png");
const BLOCK = 6;

function verifyBlockUniform() {
  const { width, height, pixels } = readPng(SRC);
  if (width % BLOCK !== 0 || height % BLOCK !== 0) {
    throw new Error(`${SRC}: ${width}x${height} is not a multiple of ${BLOCK} -- expected a clean ${BLOCK}x upscale`);
  }
  function px(x, y) {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
  }
  let mismatches = 0;
  for (let by = 0; by < height; by += BLOCK) {
    for (let bx = 0; bx < width; bx += BLOCK) {
      const ref = px(bx, by);
      for (let dy = 0; dy < BLOCK; dy++) {
        for (let dx = 0; dx < BLOCK; dx++) {
          const p = px(bx + dx, by + dy);
          if (p[0] !== ref[0] || p[1] !== ref[1] || p[2] !== ref[2] || p[3] !== ref[3]) mismatches++;
        }
      }
    }
  }
  if (mismatches > 0) {
    throw new Error(`${SRC}: ${mismatches} pixels are not uniform within their ${BLOCK}x${BLOCK} block -- not a clean nearest-neighbor upscale, refusing to guess`);
  }
  return { width, height, frameWidth: width / BLOCK, frameHeight: height / BLOCK };
}

(async () => {
  const info = verifyBlockUniform();
  console.log(`אומת: ${info.width}x${info.height} הוא הגדלה נקייה פי ${BLOCK} של ${info.frameWidth}x${info.frameHeight}.`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = fs.readFileSync(SRC).toString("base64");
  const outB64 = await page.evaluate(
    ({ b64, frameWidth, frameHeight }) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, frameWidth, frameHeight);
          resolve(canvas.toDataURL("image/png").split(",")[1]);
        };
        img.onerror = () => reject(new Error("image failed to load"));
        img.src = `data:image/png;base64,${b64}`;
      }),
    { b64, frameWidth: info.frameWidth, frameHeight: info.frameHeight }
  );
  await browser.close();

  fs.writeFileSync(DEST, Buffer.from(outB64, "base64"));
  console.log(`נכתב: ${DEST} (${info.frameWidth}x${info.frameHeight})`);
})();
