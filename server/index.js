// статика + websocket комнаты (yjs). /api/ai опционально

require('dotenv').config()

const http = require('http')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const PORT = process.env.PORT || 3000

// GROQ_API_KEY=gsk_... в env (.env, никогда не в код). бесплатный тир: console.groq.com/keys
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile'
const MAX_CONTEXT_CHARS = 20000

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(express.static(path.join(__dirname, '..', 'public')))
function buildProjectContext(files) {
  if (!Array.isArray(files) || files.length === 0) return ''
  const tree = files.map(f => `- ${f.path}`).join('\n')
  let budget = MAX_CONTEXT_CHARS - tree.length
  const chunks = [`структура проекта:\n${tree}`]
  for (const f of files) {
    if (budget <= 0) break
    const content = String(f.content || '')
    const slice = content.slice(0, Math.max(0, budget))
    chunks.push(`\nфайл ${f.path}:\n\`\`\`\n${slice}\n\`\`\``)
    budget -= slice.length
  }

  return chunks.join('\n')
}

app.post('/api/ai', async (req, res) => {
  const { prompt, code, files } = req.body || {}
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'нужен prompt' })
  }

  if (!GROQ_API_KEY) {
    return res.json({
      stub: true,
      reply: 'тут должен быть api иишки но увы. кинь GROQ_API_KEY в env (.env)'
    })
  }

  const context = files
    ? buildProjectContext(files)
    : `файл:\n\`\`\`\n${String(code || '').slice(0, MAX_CONTEXT_CHARS)}\n\`\`\``

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'помощник по коду в CollIde. видишь структуру проекта и содержимое файлов ниже. отвечай коротко по-русски, ссылайся на конкретные файлы/строки где уместно.'
          },
          {
            role: 'user',
            content: `вопрос: ${prompt}\n\n${context}`
          }
        ],
        temperature: 0.3
      })
    })

    if (!r.ok) {
      const errText = await r.text()
      return res.status(502).json({ error: 'groq не ответил', detail: errText.slice(0, 400) })
    }

    const data = await r.json()
    const reply = data.choices?.[0]?.message?.content?.trim() || 'пустой ответ'
    res.json({ reply })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req)
})

server.listen(PORT, () => {
  console.log(`up on http://localhost:${PORT}`)
  if (!GROQ_API_KEY) {
    console.log('ai: stub (нет GROQ_API_KEY)')
  } else {
    console.log(`ai: live (${AI_MODEL})`)
  }
})