# YB RTL — Hebrew for Cursor & Devin

תוסף פרטיות־תחילה ליישור עברית, ערבית ופרסית ב־Cursor וב־Devin — בצ'אט המובנה,
בפאנלים של סוכני AI (Claude Code, Codex) ובעורך.

## מה נתמך

### סביבות
- **Cursor** — הצ'אט המובנה (Chat / Plan), פאנלים של תוספי סוכנים, ועורך Monaco.
- **Devin (desktop)** — פאנל הסוכן, פאנלים של תוספים (Claude Code, Codex) ועורך.
- זיהוי אוטומטי של תיקיות התוספים גם ב־`.vscode`, `.cursor-server`, `.antigravity` ועוד.

### משטחי RTL
- **צ'אט Cursor ו־Plan** — זיהוי כיוון לכל פסקה, רשימות, טבלאות וכותרות.
- **פאנלים של סוכנים (Claude Code, Codex, Devin agent)** — הזרקה אוטומטית לכל
  webview, כולל iframes מקוננים:
  - תשובות הסוכן (Markdown): פסקאות, רשימות ממוספרות, טבלאות, ציטוטים.
  - בועות ההודעות של המשתמש (טקסט גולמי, לא רק Markdown).
  - תיבת ההקלדה (`dir="auto"`).
- **עורך Monaco** (ניסיוני) — מצב Auto / Always / Off לקובצי Markdown וטקסט,
  עם יישור ברמת השורה הבודדת.
- **קוד נשאר LTR תמיד** — בלוקים של קוד, inline code, diff, terminal ו־Monaco של קוד.

### איכות זיהוי הכיוון
- אלגוריתם first-strong + יחס: האות החזקה הראשונה קובעת; פתיחה לטינית מתהפכת
  ל־RTL רק כשלפחות 30% מהאותיות הן RTL (מטפל נכון ב"‎1. הרץ Cursor RTL‎").
- כיוון אחיד לרשימה שלמה — פריט "אנגלי" בתוך רשימה עברית לא שובר את המספור.
- עיגון RLM (U+200F) לבלוקים שמתחילים בתוכן לטיני.
- עמידות ל־re-render של React: סנכרון מחזורי שמחזיר `dir` שנמחק, בלי לגעת
  ב־`dir` שהאפליקציה קבעה בעצמה.

### תפעול
- מצבי עורך חיים דרך `~/.cursor-rtl-config.json` — שינוי חל בלי restart.
- Status bar עם התראת "UPDATE NEEDED" אחרי עדכון של Cursor, ו־auto-reapply אופציונלי.
- ייצוא אבחון DOM (`RTL Hebrew: Export DOM Diagnostics`) — מטא־דטה מבני בלבד,
  ללא תוכן שיחות.
- לוג מפורט ב־`~/cursor-rtl.log`.

## אבטחה

- אין telemetry ואין תקשורת רשת בזמן ריצה.
- אין YOLO, לחיצות אוטומטיות או אישור פעולות.
- כל שינוי מוצג למשתמש ודורש אישור מפורש.
- לפני שינוי Codex נוצר גיבוי ולצדו SHA-256; השחזור מאמת את הגיבוי.
- לפני שינוי main.js מאומתת חתימת המקור ונוצר גיבוי מתוארך.
- עדכונים מותקנים ידנית מקובץ VSIX שנבחר על ידי המשתמש.

## התקנה ושימוש

1. התקן את קובץ ה־VSIX דרך `Extensions: Install from VSIX...`.
2. הרץ `Cursor RTL: Enable RTL / Fix After Update` (ב־Windows עם התקנה תחת
   `Program Files` נדרשת הרצה חד־פעמית כ־Administrator, או השתמש ב־
   `scripts/apply-cursor-patch.cjs` עם הרשאות מוגבהות).
3. עבור Codex (אופציונלי) הרץ `RTL Hebrew: Enable RTL in Codex` ואשר את רשימת הקבצים.
4. סגור ופתח מחדש את היישום.

לשחזור Codex הרץ `RTL Hebrew: Restore Codex Files`. לשחזור מלא הרץ
`Cursor RTL: Disable RTL Support`.

### מצב יישור העורך

`Cursor RTL: Set Editor RTL Mode` או עריכת `~/.cursor-rtl-config.json`:

| מצב | התנהגות |
|---|---|
| `auto` (ברירת מחדל) | כיוון לפי השפה הדומיננטית בכל עורך |
| `always` | כל עורך קובץ מיושר RTL |
| `off` | העורך לא נגוע; הצ'אטים והפאנלים ממשיכים RTL |

יישור העורך הוא ניסיוני — ל־Monaco אין תמיכת RTL רשמית. אם מופיעות תופעות
רינדור מוזרות בעורך, עבור ל־`off`.

## מגבלות

Cursor, Devin ותוספי הסוכנים אינם מספקים API רשמי לעיצוב הממשק. לכן הפתרון
משנה קבצים פנימיים עם גיבוי מאומת. עדכון של Cursor / Devin דורס את ה־patch
של main.js וידרוש החלה מחדש (ה־status bar יתריע); עדכון של תוסף Codex ידרוס
את ה־patch שלו.

## ייחוס ורישיון

מנגנון Cursor והאלגוריתם ב־`resources/rtl.js` מבוססים על
[`motcke/cursor-ext-rtl`](https://github.com/motcke/cursor-ext-rtl), ברישיון Apache-2.0.
טכניקות זיהוי הכיוון והעמידות ל־re-render נלמדו מ־
[`GuyRonnen/rtl-for-vs-code-agents`](https://github.com/GuyRonnen/rtl-for-vs-code-agents)
(GPL-3.0) ומומשו מחדש באופן עצמאי.
מנגנון Codex נכתב מחדש עבור פרויקט זה ואינו כולל יכולות YOLO או אישור אוטומטי.
