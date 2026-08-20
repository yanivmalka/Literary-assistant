/**
 * Test: Verify ability extraction on Hebrew text
 * Purpose: Debug why abilities aren't being extracted
 */

// Mock Hebrew text from user demo
export const TEST_HEBREW_TEXT = `בערב זה הגיעו שלוש דמויות מרכזיות לעיר הקסום של טרונהיים.
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

/**
 * Test abilities that SHOULD be extracted
 */
export const EXPECTED_ABILITIES = {
  abilities: [
    {
      name: "קריאת שפתיים",
      keywords: ["יכולת"],
      characters: ["ליאו"],
      evidence: ["שורה 4: ליאו בעל יכולת נדירה של קריאת שפתיים"]
    },
    {
      name: "לחימה בשתי חרבות",
      keywords: ["לחימה"],
      characters: ["אלינה"],
      evidence: ["שורה 6: אלינה...לחימה בשתי חרבות"]
    },
    {
      name: "ריפוי אנרגטי",
      keywords: ["יכולת"],
      characters: ["אלינה"],
      evidence: ["שורה 8: אלינה בעלת יכולת קדושה של ריפוי אנרגטי"]
    }
  ],
  magic_abilities: [
    {
      name: "טלקינזיס",
      keywords: ["יכולת"],
      characters: ["צפוריה"],
      evidence: ["שורה 11: לצפוריה יכולת טלקינזיס"]
    },
    {
      name: "רונת אש",
      keywords: ["אש"],
      characters: ["?"],
      evidence: ["שורה 5: רונת האש"]
    }
  ]
};

/**
 * Analysis of text markers that should trigger ability extraction
 */
export const ABILITY_MARKERS_IN_TEXT = [
  {
    line: 4,
    text: "ליאו בעל יכולת נדירה של קריאת שפתיים",
    marker: "יכולת",
    ability_name: "קריאת שפתיים",
    should_extract: true,
    reason: "Explicit 'יכולת' + specific name"
  },
  {
    line: 6,
    text: "אלינה הלוחמת ההיא בת שלוש-עשרה לחימה בשתי חרבות",
    marker: "לחימה בשתי חרבות",
    ability_name: "לחימה בשתי חרבות",
    should_extract: true,
    reason: "Named martial technique attributed to character"
  },
  {
    line: 8,
    text: "אלינה בעלת יכולת קדושה של ריפוי אנרגטי",
    marker: "יכולת",
    ability_name: "ריפוי אנרגטי",
    should_extract: true,
    reason: "Explicit 'יכולת' + specific name"
  },
  {
    line: 11,
    text: "לצפוריה יכולת טלקינזיס - היכולת לזוז עצמים בעזרת מחשבה בלבד",
    marker: "יכולת",
    ability_name: "טלקינזיס",
    should_extract: true,
    reason: "Explicit 'יכולת' + specific name + description"
  },
  {
    line: 5,
    text: "המלך ארתור שלח אותו למשימה סודית על מנת למצוא את הכמוהו רונת האש",
    marker: "רונת אש",
    ability_name: "רונת אש",
    should_extract: true,
    reason: "Named magical ability (though not directly attributed to character)"
  }
];

/**
 * Test extraction mock
 * Shows what Gemini SHOULD return
 */
export const EXPECTED_GEMINI_RESPONSE = {
  characters: [
    {
      name: "ליאו פרוסט",
      aliases: ["ליאו"],
      age: "25",
      hair_color: "שחור",
      description: "קוסם",
      evidence: ["שערו השחור", "בן עשרים וחמש"]
    },
    {
      name: "אלינה",
      aliases: [],
      description: "לוחמת",
      evidence: ["הלוחמת ההיא בת שלוש-עשרה"]
    },
    {
      name: "צפוריה",
      aliases: [],
      description: "קוסמת",
      evidence: ["הקוסמת הגדולה"]
    }
  ],
  abilities: [
    {
      name: "קריאת שפתיים",
      aliases: [],
      ability_type: "physical",
      description: "יכולת לקרוא מה מדברים מתנועות שפתיים",
      mechanism: "קריאה בתנועות שפתיים",
      users: ["ליאו"],
      evidence: ["ליאו בעל יכולת נדירה של קריאת שפתיים"],
      chunk_positions: [4, 15]
    },
    {
      name: "לחימה בשתי חרבות",
      aliases: [],
      ability_type: "physical",
      description: "טכניקת קרב",
      users: ["אלינה"],
      evidence: ["אלינה...לחימה בשתי חרבות"],
      chunk_positions: [6]
    },
    {
      name: "ריפוי אנרגטי",
      aliases: [],
      ability_type: "physical",
      description: "יכולת קדושה של ריפוי",
      mechanism: "העברת אנרגיה",
      users: ["אלינה"],
      evidence: ["אלינה בעלת יכולת קדושה של ריפוי אנרגטי"],
      chunk_positions: [8, 16]
    }
  ],
  magic_abilities: [
    {
      name: "טלקינזיס",
      aliases: [],
      ability_type: "magical",
      description: "היכולת לזוז עצמים בעזרת מחשבה",
      mechanism: "כוח קסומי",
      users: ["צפוריה"],
      power_level: "היכולת החזקה ביותר בכל הממלכה",
      evidence: ["לצפוריה יכולת טלקינזיס", "היכולת לזוז עצמים בעזרת מחשבה בלבד"],
      chunk_positions: [11, 12, 13]
    },
    {
      name: "רונת אש",
      aliases: [],
      ability_type: "magical",
      description: "יכולת קסומה של יצירת אש",
      users: [],
      evidence: ["רונת האש"],
      chunk_positions: [5]
    }
  ],
  locations: [
    {
      name: "טרונהיים",
      aliases: [],
      location_type: "עיר קסומה",
      evidence: ["עיר הקסום של טרונהיים"],
      chunk_positions: [1, 7, 14]
    }
  ],
  objects: [
    {
      name: "החרב הקדושה של אזתור",
      aliases: ["החרב הקדושה"],
      object_type: "חרב",
      special_properties: "כוחות קסומים",
      evidence: ["החרב הקדושה של אזתור, פריט בעל כוחות קסומים עצומים"],
      chunk_positions: [3]
    }
  ]
};
