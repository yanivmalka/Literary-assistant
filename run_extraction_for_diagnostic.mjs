#!/usr/bin/env node
/**
 * Quick extraction runner to populate database for diagnostic
 * This will extract from a Hebrew text to test ability extraction
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqfqfzqcrqluxanhnjwu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnFmenFjcnFsdXhhbmhuand1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTgwODEsImV4cCI6MjEwMjUzNDA4MX0.D27T3yEG8rbp7eQMKxG-L7Z62PPaKzDYD3q4SCLjoww';

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

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

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                 EXTRACTION TEST RUNNER                                     ║
║            Populating database for diagnostic analysis                     ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);

  try {
    // Get current user
    console.log('\n1️⃣  Checking authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('\n❌ No authenticated user found');
      console.error('\n   How to proceed:');
      console.error('   1. Open the web app (http://localhost:5173)');
      console.error('   2. Sign up or log in');
      console.error('   3. Create a test project');
      console.error('   4. Upload a document');
      console.error('   5. Trigger extraction');
      console.error('   6. Then run this diagnostic script');
      process.exit(1);
    }
    
    console.log(`✓ Authenticated as: ${user.email}`);
    
    // Check for existing projects
    console.log('\n2️⃣  Checking for existing test projects...');
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (projects && projects.length > 0) {
      console.log(`✓ Found existing project: ${projects[0].name}`);
      console.log('\n⚠️  Note: Please use the web app to:');
      console.log('   1. Upload a document with the Hebrew text');
      console.log('   2. Trigger extraction via the UI');
      console.log('   3. Run diagnostic script to analyze results');
      console.log('\nThe diagnostic will analyze raw Gemini responses to understand:');
      console.log('   A) Is Gemini returning empty arrays?');
      console.log('   B) Are responses being lost in parsing/storage?');
      console.log('   C) Is the response format wrong?');
      process.exit(0);
    }
    
    console.log('\n⚠️  No projects found in the database');
    console.log('\n📝 To use the diagnostic tool:');
    console.log('\n   1. Open http://localhost:5173 in your browser');
    console.log('   2. Sign up or log in');
    console.log('   3. Create a new project');
    console.log('   4. Upload this Hebrew text as a document:');
    console.log('');
    console.log(HEBREW_TEXT);
    console.log('');
    console.log('   5. Click "Extract Entities"');
    console.log('   6. Once extraction completes, run:');
    console.log('      node diagnostic_extraction_analysis.mjs');
    console.log('\n   The diagnostic will show:');
    console.log('   ✓ Last 3 extractions with timestamps');
    console.log('   ✓ What arrays were returned (characters, abilities, magic_abilities)');
    console.log('   ✓ Actual raw JSON for each array');
    console.log('   ✓ Comparison with what the prompt requested');
    console.log('   ✓ Hypothesis testing to identify the root cause');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
