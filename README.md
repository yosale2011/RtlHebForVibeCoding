# RTL Hebrew for Cursor & Codex

תוסף פרטיות־תחילה ליישור עברית, ערבית ופרסית ב־Cursor ובחלון Codex.

## מה נתמך

- Cursor Chat ו־Plan: זיהוי כיוון לכל פסקה.
- Monaco: מצב Auto / Always / Off לקובצי Markdown וטקסט.
- Codex: patch אופציונלי ונפרד ל־webview המבודד.
- קוד, terminal ורכיבי Monaco נשארים LTR.

## אבטחה

- אין telemetry ואין תקשורת רשת בזמן ריצה.
- אין YOLO, לחיצות אוטומטיות או אישור פעולות.
- כל שינוי מוצג למשתמש ודורש אישור מפורש.
- לפני שינוי Codex נוצר גיבוי ולצדו SHA-256; השחזור מאמת את הגיבוי.
- עדכונים מותקנים ידנית מקובץ VSIX שנבחר על ידי המשתמש.

## התקנה ושימוש

1. התקן את קובץ ה־VSIX דרך `Extensions: Install from VSIX...`.
2. עבור Cursor הרץ `Cursor RTL: Enable RTL / Fix After Update`.
3. עבור Codex הרץ `RTL Hebrew: Enable RTL in Codex` ואשר את רשימת הקבצים.
4. סגור ופתח מחדש את Cursor.

לשחזור Codex הרץ `RTL Hebrew: Restore Codex Files`. לשחזור Cursor הרץ
`Cursor RTL: Disable RTL Support`.

## מגבלות

Cursor ותוספי Agents אינם מספקים API רשמי לעיצוב כל הממשק. לכן הפתרון משנה
קבצים פנימיים עם גיבוי. עדכון של Cursor או Codex עשוי לדרוש החלה מחדש.

## ייחוס ורישיון

מנגנון Cursor והאלגוריתם ב־`resources/rtl.js` מבוססים על
[`motcke/cursor-ext-rtl`](https://github.com/motcke/cursor-ext-rtl), ברישיון Apache-2.0.
מנגנון Codex נכתב מחדש עבור פרויקט זה ואינו כולל את יכולות ה־YOLO של פרויקטים אחרים.
