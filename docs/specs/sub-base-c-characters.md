# תת־בסיס C דמויות — מפרט מוצר, חוזה ומימוש

**סטטוס:** בתכנון ובמימוש מדורג  
**שם תצוגה:** תת־בסיס C דמויות  
**מזהה פנימי מתוכנן:** `sub-base-c-characters`  
**מודל ראשון:** Model A — מומחה חילוץ דמויות  
**מודל ראשי:** `gemini-3.5-flash-lite`  
**Fallback מתוכנן:** `gemini-2.5-flash-lite`  
**בעלות על נתונים:** Knowledge Layer הקיים; אין ליצור טבלת `characters` קנונית חדשה.

## 1. מטרת המפרט

תת־בסיס C דמויות הוא פרופיל חילוץ עצמאי לדמויות. בשלב הראשון הוא כולל מודל מומחה יחיד, Model A, שמקבל את אותו טקסט של ה־batch ומחלץ רק:

- דמויות.
- עובדות ותכונות של דמויות.
- מערכות יחסים בין דמויות.
- ראיות, מיקומי מקור, confidence ויכולת הבחנה בין מידע מפורש למידע שהוסק.

הוא אינו מחלץ בשלב זה אירועים, מקומות, חפצים או יכולות כישויות ראשיות. המבנה חייב להישאר ניתן להרחבה, כדי שבעתיד אפשר יהיה להוסיף מודלים נפרדים ליכולות ולחפצים לתוך אותו פרומפט/צינור בלי לשבור את חוזה הדמויות.

## 2. החלטות ארכיטקטוניות

### 2.1 שכבות

- `sub-base-c-characters` הוא פרופיל מוצר/חוזה חילוץ.
- Model A הוא מומחה התפקיד `characters` בתוך צינור המומחים.
- ה־artifacts נשמרים כנתוני ביניים ניתנים לבדיקה.
- ה־merger מאחד artifacts לפני כתיבה קנונית.
- הכתיבה הקנונית מתבצעת ל־`knowledge_entities`, `knowledge_entity_aliases`, `knowledge_entity_mentions`, `knowledge_entity_relationships`, `knowledge_entity_values` ו־`knowledge_entity_value_evidence` לפי הצורך.
- אין ליצור מאגר דמויות נפרד, כדי לשמור על תאימות ל־Main/Branch, ל־Effective Views ול־Story Model.

### 2.2 מודלים

בשלב הראשון כל Model A משתמש באותו מודל ראשי:

```text
characters / Model A → gemini-3.5-flash-lite
fallback               → gemini-2.5-flash-lite
```

אין להפעיל בשלב זה את `gemini-2.5-flash`, מאחר שהוא אינו זמין בפרויקט לפי לוגי Gemini. אין להשתמש במזהי Preview ישנים שאינם זמינים.

שלושת המומחים העתידיים יכולים לרוץ במקביל, אך C מתחיל ממומחה הדמויות בלבד. מודל synthesis מסוג `gemini-2.5-pro` אינו חלק מהשלב הראשון; הוא יישקל בשלב מאוחר יותר לבדיקת סתירות וסינתזה.

### 2.3 יכולת הסקה

מותר ל־Model A להסיק תכונות אופי, מניעים, פחדים, הרגלים, דפוסי התנהגות ותכונות חיצוניות מבין השורות. כל ערך מוסק חייב להישמר עם:

- `inferred: true`.
- ראיה או ציטוט תומך.
- `confidence`.
- מיקום מקור.
- הסבר קצר כאשר ההסקה אינה טריוויאלית.

אסור להמציא ערכי זהות ללא בסיס. כאשר ערך אינו מופיע ואינו נתמך בהקשר, הוא מושמט ולא נכתב כעובדה.

## 3. חוזה Model A

### 3.1 כללי זהות

- `first_name` הוא שדה חובה.
- אין ליצור או לשמור ישות דמות קנונית ללא שם פרטי מזוהה.
- `last_name` נשמר בשדה נפרד.
- כותרת התצוגה מחושבת כ־`first_name + last_name` כאשר שני הערכים קיימים.
- `aliases` מכיל שמות חלופיים אמיתיים: כינויים, שמות מקוצרים, שמות בדויים, עלבונות או שמות הומוריסטיים שמשמשים בפועל לדמות.
- השם הפרטי הרגיל אינו נכנס ל־`aliases`.
- דמות ללא שם פרטי יכולה להישמר לכל היותר כמועמד/אזכור ביניים עם evidence, אך לא כישות קנונית בשלב זה.

### 3.2 שדות בסיס קבועים

#### זהות ופרטים אישיים

- `first_name` — חובה.
- `last_name`.
- `aliases`.
- `age`.
- `gender`.
- `sexual_orientation`.
- `pronouns`.
- `occupation`.
- `hobbies`.
- `favorite_foods`.
- `disliked_foods`.
- `religion`.
- `beliefs`.
- `race`.
- `height`.
- `narrative_role` — גיבור, יריב, דמות משנה, מנטור וכדומה.
- `status` — חי/מת; תשתית חילוץ פנימית ללא תצוגה קבועה, ועדיף לייצג שינויי סטטוס גם כמצב/אירוע זמני.

#### אופי ופסיכולוגיה

- `personality_traits` — כולל תכונות המוסקות מהתנהגות.
- `strengths`.
- `weaknesses`.
- `fears`.
- `goals_and_desires`.
- `values_and_principles`.
- `habits_and_mannerisms`.
- `speech_style`.
- `secrets` כאשר קיימת ראיה מספקת.
- `emotional_state` כאשר ניתן להצמיד אותו למיקום נרטיבי; אין להתייחס אליו כעובדה קבועה.

#### מראה חיצוני

- `eye_color`.
- `eye_shape`.
- `eye_size`.
- `skin_color`.
- `hair_color`.
- `hair_type`.
- `tattoos`.
- `scars`.
- `jewelry`.
- `body_type` — שרירי, אתלטי, רזה, שמן, לא בכושר וכדומה.
- `facial_features`.
- `distinguishing_features`.
- `typical_clothing`.
- `posture_and_body_language`.
- `appearance_traits` — יפה, מכוער, מטופח וכדומה, רק כאשר נתמך בטקסט או בהסקה מתויגת.

#### הרחבות עתידיות

החוזה, ה־merger וה־UI חייבים לאפשר בעתיד הוספת:

- `abilities`.
- `magic_abilities`.
- `objects`.
- בעלות או שימוש של דמות בחפץ.

בשלב הנוכחי שדות אלו אינם יעדי חילוץ ואינם מוצגים כחלק מתת־בסיס C. אין לזרוק מבנה עתידי לא מוכר בעת normalization/merge, אך אין להציג אותו או לכתוב אותו כמידע קנוני עד שיוגדר מודל ייעודי.

### 3.3 חוזה ערך עם ראיות

לכל שדה שחולץ רצוי להחזיק מבנה עקבי:

```json
{
  "value": "פחד גבהים",
  "evidence": [
    {
      "quote": "היא נאחזה במעקה ולא העזה להביט למטה",
      "chunk_position": 14,
      "page": 6
    }
  ],
  "confidence": 0.82,
  "inferred": true,
  "inference_note": "הפחד מוסק מהתגובה החוזרת לגובה"
}
```

הייצוג בפלט המודל יכול להישאר תואם לחוזה הקיים, אך ה־normalizer חייב לשמור את המקור, confidence ו־inferred לפני הסנכרון ל־values/evidence.

## 4. מערכות יחסים

`חוסר קשר` נשמר במערכת לצורכי ניתוח, אך אינו מוצג למשתמש ואינו יוצר edge רגיל בתצוגת גרף.

סוגי הקשר הקבועים:

```text
acquaintance / היכרות
friendship / ידידות שטחית
friendship_deep / חברות
family / משפחה
romantic_relationship / זוגיות
hostility / עוינות
rivalry / יריבות
alliance / ברית או שיתוף פעולה
mentorship / חונכות
work_subordinate / עובד תחת
work_supervisor / ממונה או מעביד
protection_or_dependency / הגנה או תלות
no_significant_bond / חוסר קשר — פנימי בלבד
```

הקשר חייב לכלול:

- דמות מקור.
- דמות יעד.
- סוג קשר מנורמל.
- כיוון כאשר הוא משמעותי.
- חוזק או confidence.
- evidence ומיקום מקור.
- תוקף זמני כאשר הקשר משתנה לאורך העלילה.
- Main/Branch scope.
- review status.

`בגידה`, `פרידה` ו־`עבר זוגי` אינם סוגי קשר ראשיים בשלב הראשון. הם יישמרו בעתיד כמצבים, אירועים או מאפייני היסטוריה של קשר.

## 5. שדות דינמיים

המשתמש יוכל להוסיף שדות בשתי דרכים:

1. **הוספת שדה קיים** — בחירה מקטלוג שדות שלא נוספו עדיין לדף הדמות.
2. **הוספת שדה עצמאי** — הקלדת שם שדה והוספתו באמצעות Enter או כפתור.

כל שדה עצמאי נשמר כהגדרת שדה ברמת הפרויקט ובפרופיל C, והערך נשמר בנפרד לכל דמות.

כללי תצוגה:

- שדה שלא חולץ ואינו נבחר על ידי המשתמש אינו מוצג.
- שדה שחולץ או נבחר מופיע במקום המתאים לפי קבוצת השדה.
- ערכים חסרים אינם מוצגים כ־`null`, `Unknown` או שורה ריקה.
- שדה שהמשתמש הוסיף נשאר זמין ל־Model A בריצות Branch עתידיות.
- ערך AI לשדה דינמי נשמר עם evidence, confidence ו־provenance בדיוק כמו שדה קבוע.
- שדות C אינם דולפים לפרופילים הישנים ללא החלטה מפורשת.

## 6. UI נדרש

### 6.1 Characters Hub

- הצגת דמויות לפי Main או Effective Branch.
- חיפוש פעיל לפי שם פרטי, שם משפחה, כינוי ושדות מאוכלסים.
- תוצאות החיפוש מתעדכנות בזמן הקלדה.
- כאשר אין תוצאה מוצג מצב ריק ברור.
- אין להציג `no_significant_bond` כחיפוש או כקשר למשתמש.

### 6.2 אריח דמות

האריח מציג רק ערכים קיימים:

- כותרת — שם מלא.
- גיל.
- גובה.
- מגדר.
- צבע עיניים.
- סוג וצבע שיער.

בריחוף מופיע כפתור עריכה. לחיצה על האריח פותחת את חלון הפרטים.

### 6.3 חלון פרטים

החלון מציג ללא צורך בגלילה:

- כל שדות האריח.
- גזע.
- כינויים.
- דת ואמונה.
- זוגיות.
- מקצוע.
- אזורי פעולה לחפצים וליכולות — במצב placeholder בלבד בשלב C.
- קישור לדף הדמות המורחב.

### 6.4 דף דמות מורחב

מציג את כל הערכים המאוכלסים:

- אוכל אהוב/שנוא.
- נטייה מינית.
- תכונות אופי וחיצוניות.
- שם פרטי ושם משפחה בנפרד.
- תחביבים.
- מערכות יחסים נוספות.
- מראה חיצוני מלא.
- שדות דינמיים.
- evidence לפי הרשאת התצוגה המתאימה.

מצב עריכה:

- כפתור עריכת דמות בראש הדף.
- כל השדות הופכים לעריכים.
- שינוי נשמר דרך מנגנון Main/Branch הקיים.
- בתחתית מופיע `הוסף שדה`.
- המשתמש יכול להוסיף שדה קיים או שדה עצמאי.

## 7. מסלול extraction

### Model A

Model A מקבל את כל ה־chunks של ה־batch, אך instruction שלו מגביל אותו לדמויות ולמערכות היחסים שלהן. הוא לא יוצר מיקומים, אירועים, חפצים או יכולות.

הוא מחזיר:

- `role: "characters"`.
- entities מסוג `character`.
- relationship candidates.
- unresolved references.
- evidence לכל מועמד ושדה.
- chunk positions.
- confidence ו־inferred metadata.

### Artifact

כל הפעלה נשמרת ב־`extraction_expert_artifacts` עם:

- run/version/document/user/branch scope.
- profile C.
- role `characters`.
- window.
- status.
- actual model.
- token usage.
- latency.
- parsed response.
- בעתיד גם fallback chain מלא ו־failure reason לכל ניסיון.

### Merger

ה־merger:

- מאחד מועמדים בעלי אותו שם כאשר הדבר בטוח.
- שומר aliases וראיות.
- אינו מוחק observations סותרים.
- שומר conflict metadata.
- מעביר רק entities מסוג character וקשרי דמויות למסלול הקנוני.
- משאיר הרחבות abilities/objects/events לא ממומשות ללא נזק.

## 8. Main, Branch ועריכה ידנית

- Bootstrap כותב ל־Main לפי כללי ה־extraction הקיימים.
- Branch כותב overlay עם review status מתאים.
- ערך משתמש גובר על ערך AI.
- ערך AI חדש אינו מוחק ערך קודם ללא כלל merge ו־evidence.
- שינוי ידני צריך להישמר עם מקור `user` ולא להיטמע כ־AI.
- קונפליקטים נשמרים לבדיקה ואינם נפתרים על ידי overwrite שקט.

## 9. מדדי observability

לכל Model A invocation יש לתעד:

- `requested_model_profile`.
- `role`.
- `primary_model`.
- `actual_model`.
- `fallback_chain`.
- status לכל ניסיון.
- שגיאת HTTP או empty response.
- safety block כאשר קיים.
- input/output/thinking/total tokens.
- latency.
- artifact id ו־run id.

הצילום שסופק במהלך התכנון משמש baseline תפעולי: שלושה artifacts של אותה ריצה הסתיימו עם `gemini-3.5-flash-lite`. נתון זה אינו מחליף telemetry מלא של fallback.

## 10. שלבי מימוש

### שלב 0 — מפרט וחוזה

- [x] לתעד את מטרת C ואת גבולות Model A.
- [x] להגדיר שדות קבועים, קשרים, שדות דינמיים והרחבות עתידיות.
- [x] לבחור `gemini-3.5-flash-lite` כמודל ראשי.
- [x] לאשר את המזהה הפנימי `sub-base-c-characters`.

### שלב 1 — חוזה טהור ובדיקות

- [x] ליצור חוזה/validator ל־Character Specialist.
- [x] לאכוף `first_name` חובה לפני persistence.
- [x] להגדיר field evidence, confidence ו־inferred.
- [x] להגדיר taxonomy מנורמל של relationships.
- [x] להוסיף fixtures לדמויות מפורשות ומוסקות.
- [x] להוסיף בדיקות aliases, duplicate names, missing first name ו־conflicting fields.
- [x] לוודא שהחוזה מתעלם בשלב זה מ־objects/abilities/events/locations.

> שלב 1 אומת בבדיקות pure: 6 בדיקות Deno עברו, כולל validation, adapter, provenance, conflicts והרחבות עתידיות.

### שלב 2 — Prompt ו־Model A

- [x] להוסיף profile/instructions ייעודיים ל־C.
- [x] לקשר את role `characters` ל־`gemini-3.5-flash-lite`.
- [x] להגדיר fallback ל־`gemini-2.5-flash-lite`.
- [x] לשמור את `legacy-sequential` כברירת מחדל.
- [x] להפעיל רק ב־explicit opt-in/rollout.

### שלב 3 — Artifacts ו־merger

- [x] להרחיב את artifact metadata ל־C.
- [x] לשמור fallback attempts מלאים.
- [x] לחבר את חוזה הדמויות ל־merger.
- [x] לוודא ש־relationships נשמרים כ־edges ולא כטקסט בלבד.
- [ ] להשוות תוצאה חדשה מול התוצאה הקיימת ב־shadow mode.

> Shadow comparison intentionally remains open: the current extraction endpoint has no isolated comparison sink, and enabling it requires a separate non-canonical result path before live C runs.

### שלב 4 — Normalization ו־Knowledge Layer

- [ ] להרחיב את CharacterFields וה־normalizer.
- [ ] לסנכרן `knowledge_entity_values` ו־field evidence.
- [ ] להוסיף dynamic field definitions לפרופיל C.
- [ ] לבדוק Main/Branch, user precedence ו־conflict preservation.

### שלב 5 — UI דמויות

- [ ] לעדכן tile להצגת fields populated בלבד.
- [ ] לעדכן detail modal.
- [ ] לעדכן expanded edit page.
- [ ] להוסיף Add existing field/Add custom field.
- [ ] להוסיף placeholder לאזור יכולות וחפצים.
- [ ] להוסיף חיפוש דמויות לפי שם, alias ושדות מאוכלסים.

### שלב 6 — אימות חי

- [ ] להריץ על fixture קטן ב־Free Tier.
- [ ] לבדוק שלושה artifacts, role, actual model ו־fallback chain.
- [ ] לבדוק raw response → artifact → merger → canonical entity.
- [ ] לבדוק evidence, values ו־Main/Branch.
- [ ] לבדוק UI מול נתונים חסרים, מוסקים, ידניים ודינמיים.
- [ ] לתעד quota, latency, token usage ו־failure modes.

### שלב 7 — הרחבות עתידיות

- [ ] להוסיף Model B ליכולות.
- [ ] להוסיף Model C לחפצים.
- [ ] להוסיף synthesis ב־`gemini-2.5-pro` רק לאחר מדידת איכות ומכסה.
- [ ] לחבר abilities/objects ל־Character profile ול־UI.

## 11. Acceptance Criteria לשלב הראשון

- לא נוצרת דמות קנונית ללא `first_name`.
- שם פרטי, שם משפחה, שם מלא וכינויים נשמרים בנפרד ונכונים.
- תכונות מוסקות מסומנות `inferred` ומכילות evidence.
- ערכים שאינם קיימים אינם מוצגים כערכים ריקים.
- מערכות יחסים מנורמלות ונשמרות כ־edges עם evidence.
- `חוסר קשר` נשמר פנימית ואינו מוצג למשתמש.
- Model A אינו יוצר entities של locations/events/objects/abilities.
- שלושת שלבי התשתית העתידיים אינם נשברים כאשר abilities/objects יתווספו מאוחר יותר.
- כל artifact מכיל role, profile, window, status, actual model ו־token usage.
- קיימות בדיקות pure לפני הפעלה מול נתוני Main/Branch אמיתיים.

## 12. סיכונים והחלטות שעדיין פתוחות

1. האם `sub-base-c-characters` יהיה profile מלא ברמת run, או variant של role `characters` בתוך parallel-experts. מפרט זה מגדיר אותו כמוצר/profile, אך המימוש הראשון משתמש ב־role הקיים כדי לצמצם סיכון.
2. קוד ה־UI הקיים יוצר דמות חדשה עם שם placeholder. יש להחליט אם C יאפשר יצירה ידנית ללא first name, או שרק חילוץ AI ייאכף עם חובה זו.
3. dynamic fields קיימים כרגע עם constraint לפרופיל `sub-base-locations`; יש להרחיב את המנגנון בזהירות לפרופיל C בלי לדלוף לפרופילים הישנים.
4. ה־merger הקיים מחזיר legacy extraction shape שמכיל גם buckets עתידיים. יש לשמור תאימות ולא להציג buckets שאינם חלק מהשלב הנוכחי.
5. safety blocks ו־empty responses אינם נפתרים רק באמצעות החלפת מודל. הם חייבים להישמר ככשל מובחן ולא להיראות כ־fallback רגיל.
