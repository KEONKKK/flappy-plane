# מה שעובד ואסור לשבור

הרשימה הזו מתעדת כל התנהגות מאומתת ב-Baseline **stable-v21** (tag מקומי על
commit `2f7ea19`). היא נקראת ע"י `tools/run-regression.js` ברוח, ואמורה
להיקרא ע"י כל סוכן/מפתח **לפני** כל שינוי קוד — ראו CLAUDE.md.

כל סעיף: ההתנהגות, היכן היא ממומשת, ואיך מאמתים שהיא לא נשברה.

## מגדלים (game.js)

- **מגדל עליון הוא שיקוף אנכי של מגדל תחתון** — אותה פונקציית ציור
  (`drawTowerFromGapEdge`, game.js:785) משמשת לשני הכיוונים; ה-flip
  (game.js:747, `drawTowerSegment`) ממומש ע"י `translate`+`scale(1,-1)`,
  לא ע"י לוגיקה נפרדת לפי צורה.
  אימות: `tools/run-regression.js` (צילומי debug=towers, השוואה ל-baseline).
- **הגג/החוד פונה תמיד אל הרווח**, הבסיס פונה תמיד החוצה (תקרה/רצפה) —
  נובע מאותה גיאומטריה ב-`drawTowerFromGapEdge`: ה-sy=0 של התמונה (הגג)
  תמיד מעוגן ב-y0 (שפת הפער).
  אימות: אותו דבר — צילומי regression + `design/verify/*-top-*.png` (v21).
- **תמונות מצוירות ביחס הטבעי שלהן, בלי מתיחה, ברוחב CONFIG.TOWER_WIDTH
  קבוע** — `drawTowerFromGapEdge`, game.js:785-816: הגובה נגזר תמיד
  מ-`naturalHeight * (w / naturalWidth)`, אף פעם לא מ-`availableHeight`.
  אימות: בדיקת פיקסלים + צילומי zoom ב-design/verify/*-basezone-*.png.
- **המלבן (`assets/tower_base.png`) מצויר רק בין סוף תמונת המגדל
  (בניכוי אזור הבסיס המעוגל/מחודד) לבין קצה המסך** — אף פעם לא לצד גוף
  המגדל, אף פעם לא משני צדי חוד המשולש. `fillStart = naturalDrawH - bz`,
  `bz` נגזר מ-`TOWER_BASE_ZONE_SOURCE_PX` (game.js, ליד
  `TOWER_IMAGE_ASSET_KEY`) — נמדד פיקסלים-בפועל ע"י
  `tools/measure-tower-base-zones.js`, לא מוקלד בניחוש.
  אימות: בדיקת פיקסל-מדויק (3.7.3-style) ב-`tools/run-regression.js` +
  `design/verify/triangle-*-basezone-*` (זה שהיה שבור לפני v21).
- **המגדלים מגיעים עד קצוות המסך האמיתיים** — עליון עד y=0 (ה"תקרה"),
  תחתון עד `CONFIG.HEIGHT` (לא עד `floorY`/`GROUND_HEIGHT` — זה נשאר קו
  ההתנגשות עם הרצפה בלבד, ב-`checkCollisions`, game.js:501-541).
  אימות: `design/verify/*-bottom-C-multiFill-*.png` + regression.
- **topShape ו-bottomShape לעולם לא שווים**, וההתפלגות השולית של כל
  צורה עדיין 1/3 בשני הצדדים — `spawnTower()`, game.js:662 (הגרלת
  top חופשית מתוך 3, סינון, bottom מתוך 2 שנשארו).
  אימות: `tools/run-regression.js` (לולאת spawnTower אמיתית, 0 הפרות).
- **מגן מרווח אופקי מינימלי בין מגדלים** — `CONFIG.MIN_TOWER_DISTANCE`,
  נבדק ב-`spawnTower()` לפני יצירת מגדל חדש.
  אימות: `tools/run-regression.js`.
- **תיבת הפגיעה תמיד נגזרת מאותה גיאומטריה כמו הציור** —
  `towerSegmentHalfWidthAt` (game.js:555) משתמש באותם `naturalDrawH`/
  `segmentHeight` כמו `drawTowerFromGapEdge`; משולש מתרחב ליניארית מ-0
  עד הרוחב המלא, עגול/מרובע תמיד ברוחב מלא. **אם משנים L בציור (כמו
  שקרה ב-v21, מ-floorY ל-CONFIG.HEIGHT) חייבים לעדכן גם את הקריאה
  ל-towerSegmentHalfWidthAt ב-checkCollisions בדיוק באותו ערך.**

## מטוס (game.js)

- **נכס תמונה אמיתי** (`assets/plane.png`, 89x47, מקור `design/raw/NEW_PLANE.png`)
  מצויר על קנבס ייעודי (`canvas#plane-layer`, ברזולוציה גבוהה כמו
  bg-city/tower-images אבל `imageSmoothingEnabled=false` — זו אמנות-פיקסל
  אמיתית, לא תצלום). ציור על `canvas#game` (הרזולוציה הנמוכה) שובר את
  המתאר/החלונות — נבדק חזותית, ראו `design/verify/plane/`.
- **ציר הסיבוב הוא מרכז גוף המטוס**, לא מרכז הפריים — `PLANE_ASSET.hitboxFrac`
  (game.js) ו-`bodyCenterX`/`bodyCenterY` ב-`drawPlane` (game.js:920).
- **תיבת הפגיעה** נגזרת מאותם `hitboxFrac`, לא מקבוע-גודל נפרד —
  `checkCollisions` (game.js:501). נמדדה מהפיקסלים בפועל (שורות שבהן יש
  רצף אטום ארוך מ-70% מהרוחב, מכווץ 10% מכל צד), לא בניחוש. אם תמונת
  המטוס מתחלפת שוב, מודדים מחדש מהפיקסלים ומעדכנים את `PLANE_ASSET`.
- **הגובה על המסך תמיד נגזר** מהיחס האמיתי של הנכס
  (`planeDisplayHeight()`, game.js) — אף פעם לא קבוע/מתוח בנפרד.
  `CONFIG.PLANE_X`/`PLANE_DISPLAY_WIDTH` לא השתנו.
  אימות: `tools/run-regression.js` (6 תמונות הייחוס כוללות את המטוס
  במיקום הקבוע שלו; `design/verify/plane/` — שלוש הטיות, עם/בלי תיבת
  פגיעה).

## מצב בדיקה מקומי: `?debug=towers`

- פעיל **רק** ב-`IS_LOCAL_HOST` (game.js:113). `?debug=towers&shape=X&gapY=N`
  מקבע מגדל יחיד (`DEBUG_FROZEN_TOWER`, game.js:641), עוצר עדכון/תזוזה/
  התנגשות (`update()`, game.js:485), ומצייר מסגרות דיבוג
  (`strokeDebugRect`/`strokeDebugLine`, game.js:817-834), כולל מסגרת
  אדומה סביב תיבת הפגיעה של המטוס (`drawPlane`, ציר-מיושרת בעולם, לא
  מסתובבת עם ההטיה — משקפת בדיוק את מה ש-`checkCollisions` בודק).
  אימות: `tools/run-regression.js` (בודק שהמגדל באמת קפוא אחרי זמן).

## עדכוני גרסה ו-Service Worker

- **מקור אחד למספר ה-build** — `version.js` (`BUILD_VERSION`) ו-
  `service-worker.js` (`CACHE_VERSION`) חייבים להיות אותו ערך בדיוק;
  `tools/check-assets.js` נכשל אם הם לא תואמים.
- **המספר מוצג במסך הפתיחה** — `#build-marker` ב-index.html,
  `reportBuildVersion()` (game.js:180) שואל את ה-Service Worker הפעיל
  בפועל (postMessage GET_VERSION), לא רק קורא BUILD_VERSION סטטי.
- **גרסה חדשה מחליפה ישנה לבד, בלי ניקוי ידני** — שלושה מנגנונים יחד
  (game.js:124-168): `updateViaCache:"none"`, `registration.update()`
  מפורש, ו-`oncontrollerchange` עם `hadController` guard (כדי לא לרענן
  בביקור ראשון-אי-פעם). ראו `design/AUDIT-2.md` לחקירה המקורית.
- **בכתובת מקומית (localhost/127.0.0.1) אין Service Worker בכלל** —
  `IS_LOCAL_HOST` (game.js:113-123): מבטל רישום קיים, מוחק מטמונים,
  מרענן פעם אחת. הסיבה מתועדת ב-game.js:97-112.
- **אסטרטגיית cache מובחנת**: תמונות (`cacheFirstWithRevalidate`) מול
  כל השאר (`networkFirst`) — service-worker.js. שתיהן תמיד מחזירות
  `Response` אמיתי, לא `undefined`.

## מסך פתיחה, פיזיקה, ושמירה

- **מסך הפתיחה** מציג את `design/raw/ENTRANCE.gif` (`.entrance-gif`,
  index.html) וכותרת המשחק.
- **תחושת המשחק** (כבידה, כוח קפיצה, מהירות מגדלים, רווח, מרווח בין
  מגדלים) — כל הערכים ב-`CONFIG` (game.js:11-42), במקום אחד.
- **השיא השמור** — `localStorage["flappyPlaneHighScore"]`
  (`HIGH_SCORE_KEY`, game.js:317). המפתח הזה **אסור שישתנה** (היה
  מאפס שיאים קיימים של שחקנים אמיתיים).
- **צלילים** (תקיעה/ניקוד/התרסקות) מיוצרים ב-Web Audio API בקוד
  (`playFlapSound`/`playScoreSound`/`playCrashSound`, game.js:270-280),
  אין קובצי אודיו.
- **רינדור פיקסל-ארט**: שלוש שכבות canvas נפרדות (`bg-city` ו-
  `tower-images` ברזולוציה גבוהה עם החלקה, `game` ברזולוציה נמוכה בלי
  החלקה) — איחוד לשכבה אחת יחזיר moiré/טשטוש שכבר תוקן בעבר.
  מיקום המטוס מעוגל לרשת פיקסלים (`snapToPixelGrid`, game.js:90).
- **רקע עיר גולל בלי תפר** בטכניקת ריצוף-מראה (`drawBackgroundCity`,
  game.js:850).

## התקנה כאפליקציה (PWA)

- אנדרואיד: `beforeinstallprompt` → כפתור התקנה (game.js:433-450).
- אייפון: אין `beforeinstallprompt` בספארי — הנחיה קבועה
  (`#ios-install-hint`, `isIOSDevice()`, game.js:422).
- `manifest.json` + כל האייקונים ברשימת `APP_SHELL`.

## תשתית בדיקות (tools/)

- `tools/check-assets.js` — עקביות APP_SHELL/ASSET_MANIFEST/גרסאות.
- `tools/measure-tower-base-zones.js` — מקור האמת למדידת baseZone
  (לא להקליד מספרים ידנית אם תמונת מגדל מתחלפת — להריץ מחדש).
- `tools/run-regression.js` — פקודת הרגרסיה המאוחדת (ראו CLAUDE.md).
- `design/verify/` — צילומי אימות של תיקון v21 (עדות היסטורית לאג
  שתוקן) **וגם** baseline דטרמיניסטי להשוואת רגרסיה
  (`regression-baseline-*.png`, נוצר ע"י `tools/run-regression.js`
  עצמו עם `cityOffset` קבוע כדי שההשוואה תהיה יציבה בין הרצות).

---

**אם שכחתי כאן התנהגות שעובדת היום — הוסיפו אותה לרשימה הזו ועדכנו את
המשתמש, אל תניחו שהיא "מובנת מאליה".**
