// статика + websocket комнаты (yjs). /api/ai опционально

const http = require('http')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const PORT = process.env.PORT || 3000

// OPENAI_API_KEY=sk-... в env. в public/ не класть
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini'

const app = express()
app.use(express.json({ limit: '256kb' }))
app.use(express.static(path.join(__dirname, '..', 'public')))

app.post('/api/ai', async (req, res) => {
  const { prompt, code } = req.body || {}
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'нужен prompt' })
  }

  if (!OPENAI_API_KEY) {
    return res.json({
      stub: true,
      reply: 'тут должен быть api иишки но увы. кинь OPENAI_API_KEY в env (см .env.example)'
    })
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'помощник по коду в CollIde. отвечай коротко по-русски.'
          },
          {
            role: 'user',
            content: `вопрос: ${prompt}\n\nкод:\n\`\`\`\n${String(code || '').slice(0, 12000)}\n\`\`\``
          }
        ],
        temperature: 0.3
      })
    })

    if (!r.ok) {
      const errText = await r.text()
      return res.status(502).json({ error: 'openai не ответил', detail: errText.slice(0, 400) })
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
  if (!OPENAI_API_KEY) {
    console.log('ai: stub (нет OPENAI_API_KEY)')
  } else {
    console.log(`ai: live (${AI_MODEL})`)
  }
})
