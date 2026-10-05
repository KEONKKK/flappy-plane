// מודד, מתוך הפיקסלים האמיתיים של כל תמונת מגדל, כמה שורות בקצה הרחוק
// מהפער (סוף הקובץ, ה"בסיס") אינן אטומות לכל הרוחב — זה ה-baseZone
// שמונע מה-fill (tower_base.png) להצטייר לצד גוף המגדל או משני צדי החוד
// של המשולש (ראו drawTowerFromGapEdge ב-game.js). הערך נמדד מהפיקסלים
// עצמם ולא מוקלד בניחוש, כדי שלא יהיה תלוי בעין של מי שכותב את הקוד —
// אם מישהו מחליף את אחת מתמונות המגדל, מריצים את הסקריפט הזה מחדש
// ומעתיקים את הפלט ל-TOWER_BASE_ZONE_SOURCE_PX ב-game.js.
//
// פענוח ה-PNG עצמו עבר ל-tools/png-lib.js (משותף עם run-regression.js).
const path = require("path");
const { readPng } = require("./png-lib");

// שורה "מלאה ברוחב" = כל הפיקסלים (או כל חוץ מאחד, לפינות אנטי-אליאסינג
// עדינות) אטומים (alpha מעל 200/255).
function isRowFullWidth(pixels, width, y) {
  let opaqueCount = 0;
  const rowStart = y * width * 4;
  for (let x = 0; x < width; x++) {
    if (pixels[rowStart + x * 4 + 3] > 200) opaqueCount++;
  }
  return opaqueCount >= width - 1;
}

// סורק מהשורה האחרונה (סוף הקובץ = הבסיס, הקצה הרחוק מהפער) כלפי מעלה,
// ומחזיר כמה שורות מתחתיה (כולל היא) אינן מלאות-ברוחב = baseZonePx,
// ביחידות פיקסל-מקור (לא מוקטן ל-TOWER_WIDTH — ראו ההערה ב-game.js
// שמחשבת bz = baseZonePx * (TOWER_WIDTH / naturalWidth)).
function measureBaseZonePx(pixels, width, height) {
  let firstFullFromBottom = -1;
  for (let y = height - 1; y >= 0; y--) {
    if (isRowFullWidth(pixels, width, y)) {
      firstFullFromBottom = y;
      break;
    }
  }
  if (firstFullFromBottom === -1) return height; // התמונה כולה לא מלאה-ברוחב (לא צפוי)
  return height - 1 - firstFullFromBottom;
}

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const FILES = {
  round: "tower-round.png",
  square: "tower-square.png",
  triangle: "tower-triangle.png",
};

const result = {};
for (const [shape, file] of Object.entries(FILES)) {
  const { width, height, pixels } = readPng(path.join(ASSETS_DIR, file));
  const baseZonePx = measureBaseZonePx(pixels, width, height);
  result[shape] = { width, height, baseZonePx };
}

console.log("נמדד מתוך הפיקסלים בפועל (ביחידות פיקסל-מקור, לא מוקטן):");
console.log(JSON.stringify(result, null, 2));
console.log("\nהדבק ב-game.js, ב-TOWER_BASE_ZONE_SOURCE_PX:");
console.log(
  `const TOWER_BASE_ZONE_SOURCE_PX = { round: ${result.round.baseZonePx}, square: ${result.square.baseZonePx}, triangle: ${result.triangle.baseZonePx} };`
);
