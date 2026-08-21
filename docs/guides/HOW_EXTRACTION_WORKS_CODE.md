# 🔧 איך החילוץ עובד בקוד

## 🗺️ ארכיטקטורה כללית

```
טקסט (שורות עברית)
        ↓
[Gemini Prompt Builder]
        ↓
[Extraction Rules + Prompt Construction]
        ↓
[LLM (Claude/Gemini)]
        ↓
[JSON Output with Entities]
        ↓
[Entity Resolution & Normalization]
        ↓
[Database Storage]
```

---

## 1️⃣ תהליך הבנייה של ה-Prompt (`prompt.ts`)

### מיקום קוד:
```
supabase/functions/_shared/rules/prompt.ts
```

### תפקיד:
- בנייה של instruction פרומט ל-LLM
- הנחיות ספציפיות כיצד לחלץ ישויות

### דוגמה מהקוד:

```typescript
export function buildExtractionPrompt(chunks: { position: number; content: string }[]): string {
  const chunksText = chunks
    .map((c) => `[chunk ${c.position}]: ${c.content}`)
    .join("\n\n");

  return `You are a literary entity extractor for Hebrew fiction. Extract meaningful entities from these text chunks.

=== OUTPUT FORMAT ===
Return JSON with these arrays (omit empty arrays):

- characters: [{name, aliases[], ...}]
- abilities: [{name, aliases[], ability_type, description, mechanism, ...}]
- magic_abilities: [{name, aliases[], ability_type, description, ...}]
- events: [{...}]
...`;
}
```

### מה קורה:
1. ה-prompt מקבל חתיכות טקסט
2. הוא בונה הנחיה מלאה למודל
3. ההנחיה מוגדרת על ידי **Rules** (כללים)

---

## 2️⃣ כללי יכולות (`abilities.ts`)

### מיקום:
```
supabase/functions/_shared/rules/abilities.ts
```

### תוכן הכללים:

```typescript
export const ABILITY_RULES = {
  /**
   * Core rule: An ability must be a DISTINCT, SPECIAL capability.
   */
  requiresDistinctCapability: true,

  /**
   * The two subtypes: physical and magical
   */
  subtypes: {
    physical: {
      entityType: "ability",
      description: "Exceptional physical/combat abilities, special techniques, trained skills beyond ordinary",
      examples: ["לחימה בשתי חרבות", "קריאת שפתיים", "חוש כיוון מושלם"],
    },
    magical: {
      entityType: "magic_ability",
      description: "Magical powers, spells, supernatural abilities that characters can USE",
      examples: ["רונת אש", "יכולת ראייה דרך קירות", "טלקינזיס"],
    },
  },

  /**
   * Things that are NOT abilities
   */
  notAbilities: [
    "Ordinary actions: running, walking, talking, eating, sleeping",
    "General magic system concepts (e.g., 'the use of runes' as a system)",
    "Vague references to 'power' without specifics",
  ],

  /**
   * Magic system rule: Do NOT extract general magic systems
   */
  noMagicSystems: true,
};
```

### מה זה אומר:

| כלל | פירוש | דוגמה |
|-----|-------|-------|
| `requiresDistinctCapability` | יכולה חייבת להיות יחידה ומיוחדת | ✅ קריאת שפתיים, ❌ הליכה |
| `physical` | מיומנות גופנית | ✅ לחימה בשתי חרבות |
| `magical` | יכולת קסום | ✅ טלקינזיס |
| `noMagicSystems` | לא לחלץ מערכות אלא יכולות | ❌ "כישוף", ✅ "רונת אש" |

---

## 3️⃣ בניית הטקסט של הפרומט

### קוד ממשי:

```typescript
export function buildExtractionPrompt(chunks: { position: number; content: string }[]): string {
  // ...

  return `...

=== ABILITIES ===

ONLY extract DISTINCT, SPECIAL abilities — not ordinary actions.

Extract into TWO separate arrays based on ability type:

**abilities[]** — Physical/combat abilities (NOT ordinary actions):
- Exceptional physical feats
- Combat techniques with names
- Special martial skills
- Athletic abilities beyond normal
- Example: "קתיע קרב", "יכולת אתלטית יוצאת דופן"

**magic_abilities[]** — Magical/supernatural abilities:
- Spells, magical powers
- Supernatural abilities characters can USE
- Magic-based techniques
- Example: "רונת אש", "יכולת ראייה דרך קירות", "טלקינזיס"

DO NOT extract:
- Ordinary actions: running, walking, talking, eating
- General magic system concepts: if term refers to a general system (not a specific usable ability), do NOT extract as entity
- Vague references to "power" without specifics

...`;
}
```

### מה עושה הקוד:
1. **מפריד בין שני סוגים:**
   - `abilities[]` = כישורים גופניים
   - `magic_abilities[]` = יכולות קסומות

2. **נותן דוגמאות:**
   - קבול: "רונת אש", "טלקינזיס"
   - דחיה: "קישור", "הליכה"

3. **ברור את ההפרדה:**
   - בדו בטקסט המקור מופיע "יכולת", אנו קובעים מה סוג זה

---

## 4️⃣ Normalization Rules

### מיקום:
```
supabase/functions/_shared/rules/normalization.ts
```

### מטרה:
- המרה "קריאת שפתיים" ו"קריאה בשפתיים" לישות אחת
- הסרת ניקוד (צורות כתיב שונות)
- טיפול בשם בעברית בצורות שונות

### דוגמה:
```typescript
export const NORMALIZATION_RULES = {
  // אם יש שתי רפרנציות שונות לאותה יכולה
  // → הם מתאחדים
  
  // "קריאת שפתיים" (שורה 4)
  // "קריאת השפתיים שלו" (שורה 15)
  // = ישות יחידה
};
```

---

## 5️⃣ Entity Resolution

### מיקום:
```
supabase/functions/_shared/entity-resolution.ts
```

### שלבים:

#### שלב 1: זיהוי ישויות כפולות
```
[טקסט מקטע 1] → "קריאת שפתיים"
[טקסט מקטע 2] → "קריאת שפתיים"
= ישות כפולה?
```

#### שלב 2: סכימה
```
אם שניהם:
- שם דומה
- משתמש זהה (ליאו)
- סוג זהה (ability)
→ מיזוג לישות אחת
```

#### שלב 3: שמירה
```
ישות סופית:
{
  id: uuid(),
  name: "קריאת שפתיים",
  type: "ability",
  users: ["ליאו"],
  mentions: [
    { chunk: 4, text: "..." },
    { chunk: 15, text: "..." }
  ]
}
```

---

## 6️⃣ זרימת החילוץ המלאה

```
1. חתיכות טקסט מגיעות
   ↓
2. buildExtractionPrompt() בונה פרומט
   ↓
3. פרומט נשלח ל-Gemini/Claude
   ↓
4. LLM מחזיר JSON:
   {
     "abilities": [{"name": "קריאת שפתיים", ...}],
     "magic_abilities": [{"name": "טלקינזיס", ...}]
   }
   ↓
5. JSON מנובי → normalization rules
   ↓
6. normalization → entity resolution
   ↓
7. entity resolution → database
```

---

## 7️⃣ דוגמה ממשית מהקוד

### קוד בפנים:
```typescript
// supabase/functions/_shared/rules/prompt.ts

// כללים עבור יכולות
const abilitySection = `
=== ABILITIES ===

ONLY extract DISTINCT, SPECIAL abilities — not ordinary actions.

Extract into TWO separate arrays based on ability type:

**abilities[]** — Physical/combat abilities:
- Exceptional physical feats
- Combat techniques with names
- Special martial skills
- Example: "לחימה בשתי חרבות", "קריאת שפתיים"

**magic_abilities[]** — Magical abilities:
- Spells, magical powers
- Supernatural abilities
- Example: "רונת אש", "טלקינזיס"

DO NOT extract:
- Ordinary actions
- General magic systems
- Vague power references
`;
```

### מה הפרומט אומר ל-Gemini:
"עכשיו קרא את הטקסט הזה. כשאתה רואה משהו שנראה כמו יכולה:
1. בדוק האם זה בשם ספציפי (לא 'קישור')
2. בדוק האם זה פיזי או קסום
3. בדוק שזה לא פעולה רגילה או מערכת כללית
4. אם כל זה בסדר - החלץ אותו"

---

## 8️⃣ שדות יכולות בחילוץ

### מהקוד `entityTypes.ts`:

```typescript
export interface AbilityFields {
  // Basic details
  name: string | null
  ability_type: string | null  // "physical" | "magical"
  description: string | null

  // Mechanics
  mechanism: string | null
  activation_conditions: string | null
  limitations: string | null
  cost: string | null
  power_level: string | null

  // Connections
  magic_system: string | null
  users: string | null

  // Narrative role
  narrative_impact: string | null
}
```

### מה כל שדה אומר:

| שדה | פירוש | דוגמה |
|-----|-------|-------|
| `name` | שם היכולה | "קריאת שפתיים" |
| `ability_type` | סוג הכשר | "physical" או "magical" |
| `mechanism` | איך עובד | "קריאה בתנועות שפתיים" |
| `activation_conditions` | תנאים להפעלה | "צורך בראיה לשפתיים" |
| `limitations` | מגבלות | "דורשת ראיה טובה" |
| `power_level` | כוח | "היכולת החזקה ביותר" |
| `users` | מי משתמש | "צפוריה" |
| `narrative_impact` | חשיבות לסיפור | "מגינה על העיר" |

---

## 9️⃣ סיכום התהליך

```
Gemini = "המקביל הוא ש:
  אני קורא את הכללים בפרומט →
  אני קורא את הטקסט העברי →
  אני מחפש יכולות ספציפיות →
  אני מחלק לפיזיות וקסומות →
  אני ממלא את כל השדות →
  אני משמר עדויות מהטקסט →
  אני מחזיר JSON מובנה"
```

---

## 🔟 איפה מתאחזות התוצאות?

### במסד הנתונים:

```sql
INSERT INTO knowledge_entities (
  project_id,
  entity_type,  -- "ability" או "magic_ability"
  name,
  structured_fields
) VALUES (...)
```

### בטבלת היחסים:

```sql
INSERT INTO entity_relationships (
  entity_a_id,  -- צפוריה
  entity_b_id,  -- טלקינזיס
  relationship_type  -- "has_ability"
) VALUES (...)
```

---

## 📝 קובץ תצורה משמעותי

```typescript
// supabase/functions/_shared/rules/abilities.ts

// זה הקובץ שמגדיר מה משופע יכולה
// כל שינוי כאן משפיע על:
// 1. בנייה של הפרומט
// 2. סיווג ישויות
// 3. שדות שנחלצים
// 4. דוגמאות שנתנות למודל
```

---

## ✅ תוצאה סופית

יכולות בטבלת ה-DB:
```
┌─────────────────────────────────────────────────────┐
│ id  │ name              │ type          │ users     │
├─────┼──────────────────┼───────────────┼──────────┤
│ 1   │ קריאת שפתיים      │ ability       │ ליאו     │
│ 2   │ לחימה בשתי חרבות  │ ability       │ אלינה    │
│ 3   │ ריפוי אנרגטי      │ ability       │ אלינה    │
│ 4   │ טלקינזיס        │ magic_ability │ צפוריה   │
│ 5   │ רונת אש          │ magic_ability │ ?        │
└─────────────────────────────────────────────────────┘
```

זה הכל! 🎉
