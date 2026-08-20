#!/usr/bin/env node

/**
 * Direct test: Send Hebrew text to Gemini and see what it returns
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not set');
  process.exit(1);
}

const HEBREW_TEXT = `בערב זה הגיעו שלוש דמויות מרכזיות לעיר הקסום של טרונהיים.
ליאו פרוסט, קוסם בן עשרים וחמש עם שערו השחור וחזקתו בקוסמים, הסתכל סביב בחשש.
בידו החזיק את החרב הקדושה של אזתור, פריט בעל כוחות קסומים עצומים.
ליאו בעל יכולת נדירה של קריאת שפתיים, שהעניקה לו יתרון מכריע בקרבות.
המלך ארתור שלח אותו למשימה סודית על מנת למצוא את הכמוהו רונת האש.

באותו זמן, אלינה הלוחמת ההיא בת שלוש-עשרה לחימה בשתי חרבות.
היא הגיעה בעקבות ליאו כדי להבין מה קורה בעיר זו הגדולה.
אלינה בעלת יכולת קדושה של ריפוי אנרגטי, יכולת נדירה שלמדה מרבי הגדולה.
רבי גדול זה הלך לפעול בשיטות כישוף מסתוריות אשר עדיין לא נהיו ידועות.

בתוך הערב הקור, גם צפוריה הקוסמת הגדולה הגיעה לטרונהיים.
לצפוריה יכולת טלקינזיס - היכולת לזוז עצמים בעזרת מחשבה בלבד.
זו לא הייתה יכולת רגילה, כי צפוריה היתה יחידה בדור שלה בעלת כושר כזה.
גם ליאו וגם אלינה ידעו שטלקינזיס זו היכולת החזקה ביותר בכל הממלכה.

הכוחות התאספו בטרונהיים למטרה אחת: להעצור את קללת הכוכבים.
ליאו וקריאת השפתיים שלו היו הקשקשים היחידים להבין את כוונות האויב.
אלינה וריפויה האנרגטי אמורים היו לרפא את הנזקים הקדושים.
צפוריה אמורה הייתה להרים את החומה שמסביב לעירה כדי להגן עליה.
בלא שלוש היכולות אלו, הממלכה אבודה.`;

const PROMPT = `You are a literary entity extractor for Hebrew fiction. Extract meaningful entities from this text.

=== OUTPUT FORMAT ===
Return JSON with these arrays (omit empty arrays):

- characters: [{name, aliases[], description, evidence[], chunk_positions: []}]
- abilities: [{name, aliases[], ability_type, description, users, evidence[], chunk_positions: []}]
- magic_abilities: [{name, aliases[], ability_type, description, users, evidence[], chunk_positions: []}]
- locations: [{name, aliases[], location_type, description, evidence[]}]

=== ABILITIES (CRITICAL INSTRUCTION) ===

Extract abilities into TWO SEPARATE ARRAYS.

**abilities[]** — Physical/combat abilities:
- Look for phrases with: "יכולת", "מיומנות", "כושר", "טכניקה"
- EXAMPLES TO EXTRACT:
  - "קריאת שפתיים" (reading lips)
  - "לחימה בשתי חרבות" (two-sword combat)
  - "ריפוי אנרגטי" (energetic healing)
- These are ABILITIES even if mentioned as "X בעל יכולת Y"

**magic_abilities[]** — Magical/supernatural abilities:
- EXAMPLES TO EXTRACT:
  - "טלקינזיס" (telekinesis)
  - "רונת אש" (fire magic)
- These are abilities characters USE or POSSESS

EXPLICIT INSTRUCTION:
- If you see "בעל יכולת X" or "בעלת יכולת X" → extract X as an ability
- If you see "לחימה בZ" → extract as ability
- Do NOT omit abilities from the response

DO NOT extract:
- Generic actions (running, walking, eating)
- General systems (כישוף as a system)
- But DO extract specific techniques (רונת אש ✓, טלקינזיס ✓)

TEXT:
[chunk 0]: ${HEBREW_TEXT}`;

async function testGeminiExtraction() {
  console.log('🔍 Testing Gemini extraction on Hebrew text...\n');
  console.log('Text length:', HEBREW_TEXT.length, 'characters');
  console.log('Text preview:', HEBREW_TEXT.substring(0, 100) + '...\n');

  try {
    const payload = {
      contents: [
        {
          parts: [{ text: PROMPT }]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4096
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log('📤 Sending to Gemini...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Gemini API error:', response.status);
      console.error(error);
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Received response from Gemini\n');

    // Extract the text content
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('❌ No text in response');
      console.log('Full response:', JSON.stringify(result, null, 2));
      process.exit(1);
    }

    console.log('📄 Response text:');
    console.log(text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Try to parse JSON
    let json;
    try {
      // Find JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      json = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e.message);
      process.exit(1);
    }

    console.log('📊 Extracted entities:');
    console.log(`  Characters: ${json.characters?.length || 0}`);
    console.log(`  Abilities: ${json.abilities?.length || 0}`);
    console.log(`  Magic Abilities: ${json.magic_abilities?.length || 0}`);
    console.log(`  Locations: ${json.locations?.length || 0}\n`);

    if (json.abilities && json.abilities.length > 0) {
      console.log('✅ ABILITIES FOUND:');
      json.abilities.forEach(a => {
        console.log(`  - ${a.name} (type: ${a.ability_type})`);
        console.log(`    Users: ${a.users?.join(', ') || 'unknown'}`);
        console.log(`    Evidence: ${a.evidence?.join('; ') || 'none'}\n`);
      });
    } else {
      console.log('❌ NO ABILITIES FOUND');
    }

    if (json.magic_abilities && json.magic_abilities.length > 0) {
      console.log('✅ MAGIC ABILITIES FOUND:');
      json.magic_abilities.forEach(a => {
        console.log(`  - ${a.name} (type: ${a.ability_type})`);
        console.log(`    Users: ${a.users?.join(', ') || 'unknown'}`);
        console.log(`    Evidence: ${a.evidence?.join('; ') || 'none'}\n`);
      });
    } else {
      console.log('❌ NO MAGIC ABILITIES FOUND');
    }

    console.log('\n📋 Full JSON:');
    console.log(JSON.stringify(json, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testGeminiExtraction();
