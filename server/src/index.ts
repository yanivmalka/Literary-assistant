import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || ''

app.use(cors())
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================
// AI Name Suggestion Endpoint
// Uses HuggingFace Inference API (free tier)
// ============================================
app.post('/api/suggest-names', async (req, res) => {
  const { context, style, count = 5 } = req.body

  // If no API key, return fallback names
  if (!HF_API_KEY) {
    const fallbackNames = generateFallbackNames(context, style, count)
    res.json({ suggestions: fallbackNames, source: 'fallback' })
    return
  }

  try {
    const prompt = buildNamePrompt(context, style, count)

    const response = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 150,
            temperature: 0.8,
            return_full_text: false,
          },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`)
    }

    const data = await response.json() as Array<{ generated_text: string }>
    const generatedText = data[0]?.generated_text || ''

    // Parse names from the response
    const names = parseNamesFromResponse(generatedText, count)

    if (names.length === 0) {
      const fallbackNames = generateFallbackNames(context, style, count)
      res.json({ suggestions: fallbackNames, source: 'fallback' })
      return
    }

    res.json({ suggestions: names, source: 'ai' })
  } catch (error) {
    console.error('AI name generation failed:', error)
    const fallbackNames = generateFallbackNames(context, style, count)
    res.json({ suggestions: fallbackNames, source: 'fallback' })
  }
})

// ============================================
// Prompt Generation Endpoint
// ============================================
app.post('/api/generate-prompt', (req, res) => {
  const { canvasState, mapSettings } = req.body

  if (!canvasState || !mapSettings) {
    res.status(400).json({ error: 'Missing canvasState or mapSettings' })
    return
  }

  // The actual prompt generation logic is on the client side (PromptPanel.tsx)
  // This endpoint is available for future server-side enhancement
  res.json({
    success: true,
    message: 'Prompt generation is handled client-side for MVP',
  })
})

// ============================================
// Helper Functions
// ============================================

function buildNamePrompt(context: string, style: string, count: number): string {
  const styleDesc = style === 'fantasy' ? 'fantasy/medieval' : style || 'fantasy'
  return `<s>[INST] Generate ${count} unique ${styleDesc} place names for a ${context || 'location'} in a fantasy world. 
Return only the names, one per line, nothing else. The names should be evocative and pronounceable. [/INST]`
}

function parseNamesFromResponse(text: string, count: number): string[] {
  const lines = text
    .split('\n')
    .map(line => line.replace(/^\d+[\.\)\-]\s*/, '').trim())
    .filter(line => line.length > 0 && line.length < 30 && !line.includes(':'))
    .slice(0, count)

  return lines
}

function generateFallbackNames(context: string, _style: string, count: number): string[] {
  const prefixes: Record<string, string[]> = {
    water: ['Crystal', 'Azure', 'Silver', 'Mist', 'Shadow', 'Deep', 'Storm', 'Moon'],
    mountains: ['Iron', 'Thunder', 'Frost', 'Eagle', 'Storm', 'Dragon', 'Grey', 'Wind'],
    city: ['Crown', 'Haven', 'Gate', 'Cross', 'Shield', 'Gold', 'Star', 'Bright'],
    capital: ['King\'s', 'Grand', 'High', 'Royal', 'Imperial', 'Crown', 'Golden', 'Ancient'],
    desert: ['Sun', 'Sand', 'Dust', 'Fire', 'Gold', 'Dry', 'Ash', 'Heat'],
    forest: ['Green', 'Dark', 'Elder', 'Whisper', 'Shadow', 'Ancient', 'Wild', 'Deep'],
    village: ['Mill', 'Brook', 'Oak', 'Stone', 'River', 'Hill', 'Meadow', 'Thorn'],
    custom: ['Mystery', 'Wonder', 'Arcane', 'Forgotten', 'Hidden', 'Lost', 'Sacred', 'Eternal'],
  }

  const suffixes: Record<string, string[]> = {
    water: ['lake', 'mere', 'pool', 'falls', 'bay', 'sea', 'waters', 'spring'],
    mountains: ['peak', 'crest', 'mount', 'ridge', 'spire', 'horn', 'tower', 'cliff'],
    city: ['haven', 'ford', 'keep', 'hold', 'burg', 'gate', 'port', 'wall'],
    capital: ['throne', 'crown', 'palace', 'citadel', 'fortress', 'seat', 'tower', 'hall'],
    desert: ['waste', 'expanse', 'sands', 'reach', 'flats', 'dunes', 'void', 'span'],
    forest: ['wood', 'grove', 'thicket', 'weald', 'glen', 'hollow', 'shade', 'wilds'],
    village: ['stead', 'ton', 'vale', 'dale', 'wick', 'bury', 'field', 'well'],
    custom: ['realm', 'place', 'land', 'point', 'mark', 'rest', 'watch', 'reach'],
  }

  const ctxPrefixes = prefixes[context] || prefixes.custom
  const ctxSuffixes = suffixes[context] || suffixes.custom

  const names: string[] = []
  const used = new Set<string>()

  while (names.length < count) {
    const prefix = ctxPrefixes[Math.floor(Math.random() * ctxPrefixes.length)]
    const suffix = ctxSuffixes[Math.floor(Math.random() * ctxSuffixes.length)]
    const name = `${prefix}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`

    if (!used.has(name)) {
      used.add(name)
      names.push(name)
    }
  }

  return names
}

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
