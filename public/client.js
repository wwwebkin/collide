import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'

// room из url или генерим
const params = new URLSearchParams(location.search)
let room = params.get('room')
if (!room) {
  room = Math.random().toString(36).slice(2, 8)
  params.set('room', room)
  history.replaceState(null, '', `${location.pathname}?${params}`)
}
document.getElementById('roomName').textContent = room
document.getElementById('drawerRoom').textContent = room

function toast(text) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = text
  document.getElementById('toasts').appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const logbarDesc = document.getElementById('logbarDesc')

function log(text) {
  const el = document.getElementById('log')
  const row = document.createElement('div')
  row.className = 'log-entry'
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  row.innerHTML = `<span class="log-time">${time}</span><span>${text}</span>`
  el.appendChild(row)
  el.scrollTop = el.scrollHeight
  logbarDesc.textContent = text
}

document.getElementById('logToggle').onclick = (e) => {
  const btn = e.currentTarget
  const drawer = document.getElementById('logDrawer')
  drawer.classList.toggle('hidden')
  btn.classList.toggle('open')
}

const copyBtn = document.getElementById('copyLink')
copyBtn.onclick = () => {
  navigator.clipboard.writeText(location.href)
  copyBtn.classList.add('copied')
  toast('ссылка скопирована')
  setTimeout(() => copyBtn.classList.remove('copied'), 1600)
}

const drawer = document.getElementById('drawer')
const drawerBackdrop = document.getElementById('drawerBackdrop')

function openDrawer() {
  drawer.classList.add('open')
  drawerBackdrop.classList.remove('hidden')
}
function closeDrawer() {
  drawer.classList.remove('open')
  drawerBackdrop.classList.add('hidden')
}
document.getElementById('menuBtn').onclick = openDrawer
document.getElementById('drawerClose').onclick = closeDrawer
drawerBackdrop.onclick = closeDrawer

document.getElementById('drawerNewRoom').onclick = () => {
  const newRoom = Math.random().toString(36).slice(2, 8)
  location.href = `${location.pathname}?room=${newRoom}`
}

const SETTINGS_KEY = 'collide-settings'
const defaultSettings = {
  sound: false,
  joinSound: false,
  confetti: true,
  compact: false,
  mutedAccent: false,
  accent: '#6e7bff',
  name: ''
}

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { ...defaultSettings }
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

const settings = loadSettings()
let myName = settings.name?.trim() || ('гость-' + Math.floor(Math.random() * 900 + 100))
const myColor = `hsl(${Math.floor(Math.random() * 360)} 70% 62%)`

const ydoc = new Y.Doc()
const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host
const provider = new WebsocketProvider(wsUrl, room, ydoc)
const awareness = provider.awareness

awareness.setLocalStateField('user', { name: myName, color: myColor })
awareness.setLocalStateField('editing', false)

const statusDot = document.getElementById('statusDot')
const statusWrap = document.getElementById('status')
const brandMark = document.getElementById('brandMark')

function setStatus(state) {
  statusDot.className = 'status-dot ' + state
  statusWrap.title = { connecting: 'подключение…', synced: 'на связи', offline: 'разрыв связи' }[state]
}
setStatus('connecting')

provider.on('status', ({ status }) => {
  setStatus(status === 'connected' ? 'synced' : status === 'connecting' ? 'connecting' : 'offline')
  if (status === 'connected') {
    log('соединение с комнатой установлено')
    document.getElementById('splash').classList.add('hidden')
  }
})

provider.on('connection-error', () => {
  setStatus('offline')
  toast('нет связи с сервером')
})

let flashTimer = null
ydoc.on('update', () => {
  brandMark.classList.add('flash')
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => brandMark.classList.remove('flash'), 200)
})

const knownPeers = new Set()
const peerDots = new Map()
const drawerPeerRows = new Map()

function isEditing(state) {
  return !!state.editing
}

function peerLabel(state, clientId) {
  return state.user.name + (clientId === awareness.clientID ? ' (ты)' : '')
}

function ensurePeerDot(clientId, state, isNew) {
  let wrap = peerDots.get(clientId)
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.className = 'peer-dot' + (isNew ? ' peer-dot--enter' : '')
    wrap.dataset.clientId = String(clientId)

    const editing = document.createElement('span')
    editing.className = 'peer-editing hidden'
    editing.title = 'редактирует'
    wrap.appendChild(editing)

    peerDots.set(clientId, wrap)
    document.getElementById('peers').appendChild(wrap)
    if (isNew) {
      wrap.addEventListener('animationend', () => wrap.classList.remove('peer-dot--enter'), { once: true })
    }
  }

  wrap.style.background = state.user.color
  wrap.title = peerLabel(state, clientId)
  const initialsText = (() => {
    const parts = state.user.name.split('-')
    if (parts.length > 1 && parts[1]) return parts[1].slice(0, 2)
    return state.user.name.slice(0, 2)
  })().toUpperCase()
  if (wrap.firstChild?.nodeType === Node.TEXT_NODE) {
    wrap.firstChild.textContent = initialsText
  } else {
    wrap.insertBefore(document.createTextNode(initialsText), wrap.firstChild)
  }
  wrap.querySelector('.peer-editing').classList.toggle('hidden', !isEditing(state))
}

function ensureDrawerPeer(clientId, state) {
  let row = drawerPeerRows.get(clientId)
  if (!row) {
    row = document.createElement('div')
    row.className = 'drawer-peer'
    row.innerHTML = `
      <span class="drawer-peer-dot"></span>
      <span class="drawer-peer-name"></span>
      <span class="drawer-peer-editing hidden" title="редактирует"></span>
    `
    drawerPeerRows.set(clientId, row)
    document.getElementById('drawerPeers').appendChild(row)
  }
  row.querySelector('.drawer-peer-dot').style.background = state.user.color
  row.querySelector('.drawer-peer-name').textContent = peerLabel(state, clientId)
  row.querySelector('.drawer-peer-editing').classList.toggle('hidden', !isEditing(state))
}

function renderPeers() {
  const seen = new Set()

  awareness.getStates().forEach((state, clientId) => {
    if (!state.user) return
    seen.add(clientId)
    const isNew = !knownPeers.has(clientId)
    if (isNew) {
      knownPeers.add(clientId)
      if (peersReady && clientId !== awareness.clientID) {
        log(`${state.user.name} присоединился(-ась)`)
        if (settings.joinSound) playBeep(520, 0.08)
        if (settings.confetti) burstConfetti()
      }
    }
    ensurePeerDot(clientId, state, isNew && peersReady)
    ensureDrawerPeer(clientId, state)
  })

  knownPeers.forEach((id) => {
    if (seen.has(id)) return
    knownPeers.delete(id)
    peerDots.get(id)?.remove()
    peerDots.delete(id)
    drawerPeerRows.get(id)?.remove()
    drawerPeerRows.delete(id)
  })
}

let peersReady = false
awareness.on('change', renderPeers)
renderPeers()
queueMicrotask(() => { peersReady = true })

let audioCtx = null
function playBeep(freq, dur) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.value = 0.045
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur)
    osc.stop(audioCtx.currentTime + dur)
  } catch { /* autoplay */ }
}

function burstConfetti() {
  const layer = document.createElement('div')
  layer.className = 'confetti-burst'
  const colors = [settings.accent || '#6e7bff', '#3ecf8e', '#e0b64b', '#ef5a6f', '#6e9fff']
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('span')
    p.className = 'confetti-piece'
    p.style.left = Math.random() * 100 + '%'
    p.style.background = colors[i % colors.length]
    p.style.animationDuration = 1.2 + Math.random() * 1.4 + 's'
    p.style.animationDelay = Math.random() * 0.25 + 's'
    p.style.transform = `rotate(${Math.random() * 360}deg)`
    layer.appendChild(p)
  }
  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 2800)
}

function applyAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex)
  document.documentElement.style.setProperty('--accent-dim', hex + '1f')
  settings.accent = hex
  document.querySelectorAll('.accent-swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.accent === hex)
  })
}

function applySettingsUi() {
  document.getElementById('settingSound').checked = !!settings.sound
  document.getElementById('settingJoinSound').checked = !!settings.joinSound
  document.getElementById('settingConfetti').checked = !!settings.confetti
  document.getElementById('settingCompact').checked = !!settings.compact
  document.getElementById('settingMutedAccent').checked = !!settings.mutedAccent
  document.getElementById('settingName').value = myName
  document.body.classList.toggle('compact-editor', !!settings.compact)
  document.body.classList.toggle('theme-muted', !!settings.mutedAccent)
  if (!settings.mutedAccent) applyAccent(settings.accent || '#6e7bff')
  else {
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--accent-dim')
  }
  if (window.__editor) {
    window.__editor.updateOptions({ fontSize: settings.compact ? 12.5 : 14 })
  }
}

document.getElementById('settingSound').onchange = (e) => {
  settings.sound = e.target.checked
  saveSettings()
  if (settings.sound) playBeep(660, 0.06)
}
document.getElementById('settingJoinSound').onchange = (e) => {
  settings.joinSound = e.target.checked
  saveSettings()
  if (settings.joinSound) playBeep(520, 0.08)
}
document.getElementById('settingConfetti').onchange = (e) => {
  settings.confetti = e.target.checked
  saveSettings()
  if (settings.confetti) burstConfetti()
}
document.getElementById('settingCompact').onchange = (e) => {
  settings.compact = e.target.checked
  saveSettings()
  applySettingsUi()
}
document.getElementById('settingMutedAccent').onchange = (e) => {
  settings.mutedAccent = e.target.checked
  saveSettings()
  applySettingsUi()
}
document.getElementById('accentSwatches').onclick = (e) => {
  const btn = e.target.closest('.accent-swatch')
  if (!btn) return
  settings.mutedAccent = false
  document.getElementById('settingMutedAccent').checked = false
  applyAccent(btn.dataset.accent)
  saveSettings()
  applySettingsUi()
}
document.getElementById('settingName').addEventListener('change', (e) => {
  const next = e.target.value.trim().slice(0, 24)
  if (!next) {
    e.target.value = myName
    return
  }
  myName = next
  settings.name = next
  saveSettings()
  awareness.setLocalStateField('user', { name: myName, color: myColor })
  renderPeers()
  toast('имя обновлено')
})

applySettingsUi()

let currentFileName = 'untitled.js'
let fileHandle = null
const logbarFile = document.getElementById('logbarFile')
const MAX_FILE_BYTES = 1.5 * 1024 * 1024
const canFsAccess = typeof window.showOpenFilePicker === 'function'

const LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', cs: 'csharp',
  php: 'php', html: 'html', htm: 'html', css: 'css', scss: 'scss',
  json: 'json', md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml', xml: 'xml', txt: 'plaintext'
}

function langFromName(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return LANG_BY_EXT[ext] || 'plaintext'
}

function setFileName(name) {
  currentFileName = name || 'untitled.js'
  logbarFile.textContent = currentFileName
  logbarFile.title = fileHandle
    ? 'связан с диском · ctrl+s сохранит сюда'
    : 'ctrl+s сохранит / скачает'
}

function getEditorText() {
  return window.__editor ? window.__editor.getValue() : getYText().toString()
}

function getYText() {
  return ydoc.getText('monaco')
}

function loadTextIntoEditor(text, fileName) {
  const ed = window.__editor
  if (!ed) {
    toast('редактор ещё не готов')
    return
  }
  const ytext = getYText()
  const next = String(text)
  ydoc.transact(() => {
    if (ytext.length) ytext.delete(0, ytext.length)
    if (next) ytext.insert(0, next)
  })
  monaco.editor.setModelLanguage(ed.getModel(), langFromName(fileName))
  setFileName(fileName)
  log(`${fileName} загружен`)
  toast(fileHandle ? `открыт ${fileName} (можно ctrl+s)` : `открыт ${fileName}`)
}

async function openFromHandle(handle) {
  const file = await handle.getFile()
  if (file.size > MAX_FILE_BYTES) {
    toast('файл слишком большой (макс ~1.5мб)')
    return
  }
  const ytext = getYText()
  if (ytext.length > 0 && !confirm(`заменить содержимое комнаты на «${file.name}»?`)) return
  fileHandle = handle
  loadTextIntoEditor(await file.text(), file.name)
}

function readLocalFile(file, handle = null) {
  if (!file) return
  if (file.size > MAX_FILE_BYTES) {
    toast('файл слишком большой (макс ~1.5мб)')
    return
  }
  const ytext = getYText()
  if (ytext.length > 0 && !confirm(`заменить содержимое комнаты на «${file.name}»?`)) return

  const reader = new FileReader()
  reader.onload = () => {
    fileHandle = handle
    loadTextIntoEditor(reader.result, file.name)
  }
  reader.onerror = () => toast('не смог прочитать файл')
  reader.readAsText(file)
}

function downloadBlob(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = currentFileName || 'untitled.js'
  a.click()
  URL.revokeObjectURL(a.href)
  toast('файл скачан')
}

async function pickAndOpen() {
  if (canFsAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false })
      await openFromHandle(handle)
      return
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
  }
  openFileInput.click()
}

async function saveLocal() {
  const text = getEditorText()

  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable()
      await writable.write(text)
      await writable.close()
      toast(`сохранён ${currentFileName}`)
      log(`${currentFileName} сохранён`)
      return
    } catch {
      fileHandle = null
      setFileName(currentFileName)
    }
  }

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      fileHandle = await window.showSaveFilePicker({ suggestedName: currentFileName || 'untitled.js' })
      const writable = await fileHandle.createWritable()
      await writable.write(text)
      await writable.close()
      setFileName(fileHandle.name)
      toast(`сохранён ${currentFileName}`)
      log(`${currentFileName} сохранён`)
      return
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
  }

  downloadBlob(text)
}

const openFileInput = document.getElementById('openFileInput')
document.getElementById('openFile').onclick = () => pickAndOpen()
openFileInput.onchange = () => {
  const file = openFileInput.files?.[0]
  openFileInput.value = ''
  fileHandle = null
  readLocalFile(file)
}

const editorWrap = document.getElementById('editorWrap')
const dropHint = document.getElementById('dropHint')
let dragDepth = 0

function isFileDrag(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files')
}

editorWrap.addEventListener('dragenter', (e) => {
  if (!isFileDrag(e)) return
  e.preventDefault()
  dragDepth++
  editorWrap.classList.add('dragover')
  dropHint.classList.remove('hidden')
})
editorWrap.addEventListener('dragover', (e) => {
  if (!isFileDrag(e)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
})
editorWrap.addEventListener('dragleave', (e) => {
  if (!isFileDrag(e)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    editorWrap.classList.remove('dragover')
    dropHint.classList.add('hidden')
  }
})
editorWrap.addEventListener('drop', async (e) => {
  e.preventDefault()
  dragDepth = 0
  editorWrap.classList.remove('dragover')
  dropHint.classList.add('hidden')

  const item = e.dataTransfer?.items?.[0]
  if (item?.kind === 'file' && item.getAsFileSystemHandle) {
    try {
      const handle = await item.getAsFileSystemHandle()
      if (handle?.kind === 'file') {
        await openFromHandle(handle)
        return
      }
    } catch { /* firefox и тп */ }
  }
  fileHandle = null
  readLocalFile(e.dataTransfer?.files?.[0])
})

document.getElementById('downloadFile').onclick = () => saveLocal()
document.getElementById('downloadFile').title = 'сохранить (ctrl+s)'
document.getElementById('openFile').title = 'открыть (ctrl+o)'

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey
  if (!mod || e.altKey) return
  // e.code а не e.key -- иначе на русской раскладке ctrl+s = "ы" и браузер сейвит html
  if (e.code === 'KeyS') {
    e.preventDefault()
    e.stopPropagation()
    saveLocal()
  } else if (e.code === 'KeyO') {
    e.preventDefault()
    e.stopPropagation()
    pickAndOpen()
  }
}, true)

setFileName(currentFileName)

window.require.config({
  paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.49.0/min/vs' }
})

window.require(['vs/editor/editor.main'], () => {
  monaco.editor.defineTheme('collide-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '55555c', fontStyle: 'italic' },
      { token: 'keyword', foreground: '6e7bff' },
      { token: 'string', foreground: '9fd9a8' },
      { token: 'number', foreground: 'e0b64b' },
      { token: 'type', foreground: '6e9fff' },
      { token: 'function', foreground: 'e8e8ec' }
    ],
    colors: {
      'editor.background': '#0c0c0e',
      'editor.foreground': '#e8e8ec',
      'editor.lineHighlightBackground': '#ffffff06',
      'editorCursor.foreground': '#6e7bff',
      'editorLineNumber.foreground': '#333338',
      'editorLineNumber.activeForeground': '#6e7bff',
      'editor.selectionBackground': '#6e7bff2a',
      'editorIndentGuide.background': '#ffffff08',
      'editorGutter.background': '#0c0c0e'
    }
  })

  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'javascript',
    theme: 'collide-dark',
    automaticLayout: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    minimap: { enabled: false },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    padding: { top: 16 }
  })

  const ytext = ydoc.getText('monaco')
  new MonacoBinding(ytext, editor.getModel(), new Set([editor]), awareness)

  let editingTimer = null
  const markEditing = () => {
    awareness.setLocalStateField('editing', true)
    clearTimeout(editingTimer)
    editingTimer = setTimeout(() => awareness.setLocalStateField('editing', false), 1600)
  }

  editor.onDidChangeModelContent(() => {
    markEditing()
    const lines = editor.getModel().getLineCount()
    const chars = ytext.length
    logbarDesc.textContent = `${lines} строк · ${chars} символов`
  })

  editor.onDidChangeCursorPosition(markEditing)

  window.__editor = editor
  if (settings.compact) editor.updateOptions({ fontSize: 12.5 })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveLocal()
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, () => {
    pickAndOpen()
  })

  setTimeout(() => document.getElementById('splash').classList.add('hidden'), 4000)
})

const modes = document.querySelectorAll('.mode')
const modeIndicator = document.getElementById('modeIndicator')
const aiContext = document.getElementById('aiContext')
const quickPrompts = document.getElementById('quickPrompts')
const unreadChat = document.getElementById('unreadChat')
let currentMode = 'chat'

modes.forEach((btn, i) => {
  btn.onclick = () => {
    modes.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    currentMode = btn.dataset.mode
    modeIndicator.style.transform = `translateX(${i * 100}%)`
    document.getElementById('chatBody-chat').classList.toggle('hidden', currentMode !== 'chat')
    document.getElementById('chatBody-ai').classList.toggle('hidden', currentMode !== 'ai')
    aiContext.classList.toggle('hidden', currentMode !== 'ai')
    quickPrompts.classList.toggle('hidden', currentMode !== 'ai')
    aiInput.placeholder = currentMode === 'chat' ? 'написать в чат…' : 'спросить ии про код…'
    if (currentMode === 'chat') {
      unreadChat.classList.add('hidden')
      unreadCount = 0
    }
  }
})

document.querySelectorAll('.chip-prompt').forEach((chip) => {
  chip.onclick = () => {
    aiInput.value = chip.dataset.prompt
    aiInput.focus()
  }
})

const ychat = ydoc.getArray('chat')
const chatBody = document.getElementById('chatBody-chat')
let renderedChatLen = 0
let unreadCount = 0

function initials(name) {
  const parts = name.split('-')
  if (parts.length > 1 && parts[1]) return parts[1].slice(0, 2).toUpperCase()
  return (name.slice(0, 2) || '??').toUpperCase()
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function renderChat() {
  const items = ychat.toArray()
  for (let i = renderedChatLen; i < items.length; i++) {
    const msg = items[i]
    const mine = msg.clientId === awareness.clientID

    const row = document.createElement('div')
    row.className = 'chat-row' + (mine ? ' mine' : '')

    const avatar = document.createElement('div')
    avatar.className = 'chat-avatar'
    avatar.style.background = msg.color
    avatar.textContent = initials(msg.name)
    row.appendChild(avatar)

    const col = document.createElement('div')
    col.className = 'chat-bubble-col'

    const meta = document.createElement('div')
    meta.className = 'chat-meta-line'
    meta.innerHTML = `<span class="chat-meta-name" style="color:${msg.color}">${mine ? 'ты' : msg.name}</span><span>${formatTime(msg.ts)}</span>`
    col.appendChild(meta)

    const bubble = document.createElement('div')
    bubble.className = `ai-msg ${mine ? 'ai-msg--user' : 'ai-msg--bot'}`
    bubble.textContent = msg.text
    col.appendChild(bubble)

    row.appendChild(col)
    chatBody.appendChild(row)

    if (!mine && currentMode !== 'chat') {
      unreadCount++
      unreadChat.classList.remove('hidden')
    }
    if (!mine && settings.sound) playBeep(740, 0.05)
  }
  renderedChatLen = items.length
  chatBody.scrollTop = chatBody.scrollHeight
}
ychat.observe(renderChat)

const peerTyping = document.getElementById('peerTyping')
let typingTimer = null

function renderTyping() {
  const names = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return
    if (state.typing && state.user) names.push(state.user.name)
  })
  if (!names.length || currentMode !== 'chat') {
    peerTyping.classList.add('hidden')
    return
  }
  peerTyping.textContent = names.length === 1
    ? `${names[0]} печатает…`
    : `${names.join(', ')} печатают…`
  peerTyping.classList.remove('hidden')
}
awareness.on('change', renderTyping)

// ии через /api/ai. ключ только на сервере (OPENAI_API_KEY), сюда не пихай
const aiForm = document.getElementById('aiForm')
const aiInput = document.getElementById('aiInput')
const aiBody = document.getElementById('chatBody-ai')
const typingIndicator = document.getElementById('typingIndicator')
const aiContextText = document.getElementById('aiContextText')

aiInput.addEventListener('input', () => {
  if (currentMode !== 'chat') return
  awareness.setLocalStateField('typing', true)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => awareness.setLocalStateField('typing', false), 1200)
})

aiForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = aiInput.value.trim()
  if (!text) return
  aiInput.value = ''

  if (currentMode === 'chat') {
    clearTimeout(typingTimer)
    awareness.setLocalStateField('typing', false)
    ychat.push([{ text, name: myName, color: myColor, clientId: awareness.clientID, ts: Date.now() }])
    return
  }

  addAiMsg(text, 'ai-msg--user')
  typingIndicator.classList.remove('hidden')

  try {
    const code = window.__editor ? window.__editor.getValue() : ''
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, code })
    })
    const data = await res.json().catch(() => ({}))
    typingIndicator.classList.add('hidden')

    if (!res.ok) {
      addAiMsg(data.error || 'ошибка запроса к ии', 'ai-msg--stub')
      return
    }

    addAiMsg(data.reply || 'пустой ответ', data.stub ? 'ai-msg--stub' : 'ai-msg--bot')
  } catch {
    typingIndicator.classList.add('hidden')
    addAiMsg('не достучался до /api/ai, сервер жив?', 'ai-msg--stub')
  }
})

function addAiMsg(text, cls) {
  const div = document.createElement('div')
  div.className = `ai-msg ${cls}`
  div.textContent = text
  aiBody.appendChild(div)
  aiBody.scrollTop = aiBody.scrollHeight
}

function updateAiContext() {
  const ed = window.__editor
  if (!ed) return
  const lines = ed.getModel().getLineCount()
  aiContextText.textContent = `контекст: файл целиком · ${lines} строк`
}
setInterval(updateAiContext, 1500)
