# APIs חינמיים ליצירת ועריכת תמונות

מסמך זה מכיל מידע על שירותי API חינמיים ליצירת ועריכת תמונות, כולל דוגמאות קוד ואדריכלות מומלצות לשילוב באתר.

## סקירה כללית

### מודל Freemium
רוב שירותי ה-API לתמונות פועלים במודל "Freemium" שמעניק מכסה יומית קבועה ללא עלות, עם אפשרות לשדרוג לתשלום.

## שירותי API עם מסלול חינמי

### 1. Hugging Face Inference API
- **תיאור**: מאפשר גישה חינמית למגוון עצום של מודלי קוד פתוח מובילים (כמו סדרת Flux או Stable Diffusion)
- **הגבלות**: קצב בקשות מוגבל (Rate limiting)
- **עלות**: ללא עלות (ללא שימוש ב-Serverless Endpoints ייעודיים)
- **קושי עיקרי**: קרדיט התחלתי נמוך של 0.1 דולר שנגמר מהר

### 2. Pollinations.ai
- **תיאור**: מציע API פשוט וחינמי לחלוטין ללא הרשמה או מפתח API
- **מודלים**: מבוסס על מודלי קוד פתוח
- **יתרון עיקרי**: ללא מערכת קרדיטים כספית
- **שימוש**: שליחת בקשת URL פשוטה (GET request) ומקבל תמונה ישירות

### 3. Together AI
- **תיאור**: מעניק קרדיט ראשוני חינמי נדיב עם ההרשמה
- **שימוש**: הרצת מודלי יצירת תמונות מהירים בעלות אפסית/נמוכה
- **מתאים**: פיתוח ובדיקות

### 4. Craiyon API
- **תיאור**: פתרונות צד שלישי או גישה בסיסית ללא עלות
- **חסרון**: איכות נמוכה יותר ממודלים מודרניים

## חלופות ללא מגבלת קרדיט כספי

### Pollinations.ai (מומלץ ביותר)
- שירות חינמי לחלוטין ללא הרשמה וללא מפתח API
- אין מערכת קרדיטים
- פועל באמצעות שליחת בקשת URL פשוטה

### Hugging Face Free Inference (ללא מפתח בתשלום)
- גישה למודלים ספציפיים ללא Serverless Endpoints
- חינמי לחלוטין
- תלוי רק בעומס על השרת (Rate Limit)

### Monster API
- מכסה חודשית קבועה של בקשות חינמיות (ראנרים)
- מתחדשת בכל חודש
- לא מבוסס על קרדיט דולרי חד-פעמי

## דוגמת קוד לשימוש ב-Pollinations.ai

### HTML + JavaScript (Frontend בלבד)

```html
<!-- שדה קלט להוראה מהמשתמש -->
<input type="text" id="userPrompt" placeholder="הקלד תיאור לתמונה...">
<button onclick="generateImage()">צור תמונה</button>

<!-- המקום בו תופיע התמונה באתר -->
<div id="resultContainer">
    <img id="outputImage" src="" alt="התמונה תופיע כאן" style="max-width: 100%; display: none;">
</div>

<script>
function generateImage() {
    // 1. קריאת הטקסט שהמשתמש הקליד
    const prompt = document.getElementById('userPrompt').value;
    if (!prompt) return alert('אנא הקלד תיאור לתמונה');

    // 2. קידוד הטקסט כדי שיתאים לכתובת אינטרנט (URL)
    const encodedPrompt = encodeURIComponent(prompt);

    // 3. בניית הכתובת ל-API החינמי
    const apiUrl = `https://pollinations.ai/${encodedPrompt}?width=512&height=512`;

    // 4. עדכון תגית התמונה באתר והצגתה
    const imgTag = document.getElementById('outputImage');
    imgTag.src = apiUrl;
    imgTag.style.display = 'block';
}
</script>
```

### Python (Backend)

```python
import requests
from urllib.parse import quote

def generate_image_from_prompt(prompt, width=512, height=512):
    """
    יוצר תמונה באמצעות Pollinations.ai API
    
    Args:
        prompt: טקסט תיאור התמונה
        width: רוחב התמונה בפיקסלים
        height: גובה התמונה בפיקסלים
    
    Returns:
        bytes: נתוני התמונה
    """
    encoded_prompt = quote(prompt)
    api_url = f"https://pollinations.ai/{encoded_prompt}?width={width}&height={height}"
    
    try:
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        return response.content
    except requests.exceptions.RequestException as e:
        print(f"שגיאה ביצירת תמונה: {e}")
        return None

# דוגמת שימוש
if __name__ == "__main__":
    image_data = generate_image_from_prompt(
        "A beautiful fantasy landscape with mountains and rivers"
    )
    if image_data:
        with open("generated_image.jpg", "wb") as f:
            f.write(image_data)
        print("תמונה נשמרה בהצלחה!")
```

## מערכת עריכת תמונות מבוססת קואורדינטות

### קונספט
יצירת מודל תמונה בסיסי לפי הוראות טכניות, ואז מערכת עריכה באתר ששולחת את התמונה מחדש ומייצרת אותה לפי דרישות המשתמש עם נתונים כמו ערים, אגמים, כפרים, גבולות ועוד.

### טכנולוגיות רלוונטיות
- **Image-to-Image (Img2Img)**: עריכת תמונה קיימת עם הוראות טקסטואליות חדשות
- **Inpainting/Editing**: שינוי חלקים ספציפיים בתמונה
- **ControlNet**: שליטה מדויקת על אזורים ספציפיים בתמונה

### אדריכלות מומלצת

```
[ דפדפן המשתמש ] 
       │  (1. המשתמש מבקש שינוי, למשל: "הוסף אגם")
       ▼
[ שרת האתר שלך (Node.js / Python) ] 
       │  (2. השרת אורז את התמונה הקיימת + ההוראה החדשה)
       ▼
[ ה-API החינמי (למשל Hugging Face) ]
       │  (3. ה-AI מעבד את השינוי ומחזיר תמונה חדשה)
       ▼
[ שרת האתר שלך ] ──> מציג את התמונה המעודכנת למשתמש
```

### פתרון חכם: קואורדינטות טקסטואליות

במקום לשלוח קואורדינטות מספריות (X,Y) שמודלי AI לא מבינים, מתרגמים את מיקום הלחיצה למילים תיאוריות:

#### רשת של 9 אזורים:
- **אנכי**: top, center, bottom
- **אופקי**: left, center, right
- **דוגמאות**: top-left, center-right, bottom-center

#### דוגמת פרומפט עם קואורדינטות:
```
"A topographic map. A small village in the top-left, a blue lake in the center, 
and a mountain range along the bottom-right."
```

### JavaScript לדינמיקה של אלמנטים במפה

```javascript
// המערך ששומר את כל מה שהמשתמש בנה
let mapElements = [
    "A detailed fantasy RPG map style" // פרומפט הבסיס כדי לקבוע את הסגנון
];

// פונקציה להמרת אחוזים למילים
function translateCoordinates(xPercent, yPercent) {
    let vertical = yPercent < 33 ? "top" : (yPercent < 66 ? "center" : "bottom");
    let horizontal = xPercent < 33 ? "left" : (xPercent < 66 ? "center" : "right");
    return `${vertical}-${horizontal}`;
}

// פונקציה להוספת אלמנט חדש
function addMapElement(elementType, xPercent, yPercent) {
    const location = translateCoordinates(xPercent, yPercent);
    mapElements.push(`a ${elementType} at the ${location}`);
    
    // חיבור הכל לפרומפט אחד
    const finalPrompt = mapElements.join(", ");
    return finalPrompt;
}

// פונקציה לשליחה ל-API
function sendToAPI(prompt, seed = null) {
    const encodedPrompt = encodeURIComponent(prompt);
    let apiUrl = `https://pollinations.ai/${encodedPrompt}?width=512&height=512`;
    
    if (seed) {
        apiUrl += `&seed=${seed}`;
    }
    
    return apiUrl;
}

// דוגמת שימוש
document.addEventListener('DOMContentLoaded', function() {
    const mapCanvas = document.getElementById('mapCanvas');
    const seed = Math.floor(Math.random() * 1000000); // seed אקראי קבוע למשתמש
    
    mapCanvas.addEventListener('click', function(event) {
        const rect = mapCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;
        
        // דוגמה: המשתמש בוחר סוג אלמנט מתוך רשימה
        const elementType = "village"; // ניתן לקבל מתוך select או modal
        
        const updatedPrompt = addMapElement(elementType, xPercent, yPercent);
        const imageUrl = sendToAPI(updatedPrompt, seed);
        
        // עדכון התמונה באתר
        document.getElementById('mapImage').src = imageUrl;
    });
});
```

### שימוש ב-Seed לשמירת עקביות

ה-seed הוא מספר קבוע שקובע את ה"אקראיות" של התמונה. שימוש באותו seed עם פרומפט מעט שומר על המבנה הכללי של המפה המקורית.

#### דוגמת URL עם seed:
```
https://pollinations.ai/A%20detailed%20fantasy%20map?width=512&height=512&seed=123456
```

#### הגישה המומלצת:
1. כאשר משתמש מתחיל לעבוד על מפה, מייצרים seed אקראי
2. שומרים את ה-seed הזה לכל אורך העבודה
3. בכל עדכון של המפה, משתמשים באותו seed

### Python Backend לדוגמה

```python
from flask import Flask, request, jsonify, send_file
import requests
from urllib.parse import quote
import io

app = Flask(__name__)

# מאגר זמני של seedים למשתמשים
user_sessions = {}

@app.route('/api/generate-map', methods=['POST'])
def generate_map():
    data = request.json
    user_id = data.get('user_id')
    elements = data.get('elements', [])
    
    # יצירת או קבלת seed למשתמש
    if user_id not in user_sessions:
        user_sessions[user_id] = {'seed': hash(user_id) % 1000000}
    
    seed = user_sessions[user_id]['seed']
    
    # בניית פרומפט
    base_prompt = "A detailed topographic fantasy RPG map"
    elements_text = ", ".join(elements)
    full_prompt = f"{base_prompt}. {elements_text}"
    
    # שליחה ל-API
    encoded_prompt = quote(full_prompt)
    api_url = f"https://pollinations.ai/{encoded_prompt}?width=1024&height=768&seed={seed}"
    
    try:
        response = requests.get(api_url, timeout=60)
        response.raise_for_status()
        
        # החזרת התמונה כ-bytes
        return send_file(
            io.BytesIO(response.content),
            mimetype='image/jpeg',
            as_attachment=True,
            download_name='generated_map.jpg'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add-element', methods=['POST'])
def add_element():
    data = request.json
    user_id = data.get('user_id')
    element_type = data.get('element_type')
    x_percent = data.get('x_percent')
    y_percent = data.get('y_percent')
    
    # המרת אחוזים למילים
    def translate_coordinates(x, y):
        vertical = "top" if y < 33 else ("center" if y < 66 else "bottom")
        horizontal = "left" if x < 33 else ("center" if x < 66 else "right")
        return f"{vertical}-{horizontal}"
    
    location = translate_coordinates(x_percent, y_percent)
    element_description = f"a {element_type} at the {location}"
    
    # שמירת האלמנט (בפועל, נשמור בדאטה בייס)
    if user_id not in user_sessions:
        user_sessions[user_id] = {'elements': [], 'seed': hash(user_id) % 1000000}
    
    user_sessions[user_id]['elements'].append(element_description)
    
    return jsonify({
        'success': True,
        'element_added': element_description,
        'total_elements': len(user_sessions[user_id]['elements'])
    })

if __name__ == '__main__':
    app.run(debug=True)
```

## שיקולי אבטחה וביצועים

### אבטחה
1. **אין חשיפת מפתחות API**: עם Pollinations.ai, אין מפתחות API לחשוף
2. **Rate Limiting**: הגבלת כמות הבקשות ממשתמש בודד
3. **קלט משתמש**: סינון קלט משתמש למניעת הזרקת קוד

### ביצועים
1. **Caching**: שמירת תמונות שנוצרו במטמון
2. **Loading States**: הצגת מצב טעינה בזמן יצירת תמונה
3. **Compression**: דחיסת תמונות לפני שליחה ללקוח
4. **CDN**: שימוש ב-CDN לשיפור זמן טעינה

## טיפים להתחלה מהירה

1. **התחל עם Pollinations.ai**: הכי פשוט ומהיר להתחלה
2. **השתמש ב-seed קבוע**: לשמירת עקביות בין עדכונים
3. **תרגם קואורדינטות לטקסט**: המרת X,Y למילים כמו "top-left"
4. **שמור היסטוריה**: שמירת כל השינויים שהמשתמש מבצע
5. **הוסף undo/redo**: מתן אפשרות לביטול ושינוי שינויים

## מקורות נוספים

1. [Pollinations.ai Documentation](https://pollinations.ai)
2. [Hugging Face Models](https://huggingface.co/models)
3. [Stable Diffusion API Guides](https://stability.ai/developers)
4. [ControlNet for Precise Editing](https://github.com/lllyasviel/ControlNet)

---

**נוצר ב**: 20 באוגוסט 2026  
**עדכון אחרון**: 20 באוגוסט 2026  
**מטרה**: שימוש עתידי לחיבור API לתמונות בפרויקט Literary Assistant