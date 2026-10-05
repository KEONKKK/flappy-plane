// בונה assets/entrance-poster.png מהפריים הראשון של design/raw/ENTRANCE.gif —
// מוצג עד שה-GIF עצמו נטען, ונשאר קבוע אם הטעינה נכשלת או אם המשתמש
// הגדיר prefers-reduced-motion (ראו game.js, ליד initEntranceScreen).
// לא עורך את ה-GIF עצמו בשום צורה — רק קורא את מה שהדפדפן מציג ברגע
// הראשון אחרי טעינה, לפני שהאנימציה מתקדמת.
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "design", "raw", "ENTRANCE.gif");
const DEST = path.join(__dirname, "..", "assets", "entrance-poster.png");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = fs.readFileSync(SRC).toString("base64");
  const outB64 = await page.evaluate(
    (b64) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // ציור מיידי ב-onload, לפני שהדפדפן מספיק להתקדם לפריים הבא
          // של האנימציה -- זה מה שתופס את הפריים הראשון בלבד.
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve({ dataUrl: canvas.toDataURL("image/png").split(",")[1], w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => reject(new Error("gif failed to load"));
        img.src = `data:image/gif;base64,${b64}`;
      }),
    b64
  );
  await browser.close();

  fs.writeFileSync(DEST, Buffer.from(outB64.dataUrl, "base64"));
  console.log(`נכתב: ${DEST} (${outB64.w}x${outB64.h}, פריים ראשון של ${path.basename(SRC)})`);
})();
