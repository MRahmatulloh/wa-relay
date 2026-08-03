import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import {
  fetchHealth,
  fetchMessages,
  fetchUnreadByFolder,
  getHost,
  getToken,
  login,
  patchMessage,
  setHost,
  setToken,
} from './api'
import './App.css'

const FOLDERS = ['all', 'lgw', 'lhr', 'ltn', 'stn', 'others']
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'done', label: 'Done' },
]

function formatJobs(jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return null
  const j = jobs[0]
  const route = [j.from, j.to].filter(Boolean).join(' → ')
  const price =
    j.price != null && Number.isFinite(Number(j.price))
      ? `£${Number(j.price)}`
      : null
  const base = [route, price].filter(Boolean).join(' · ')
  if (!base) return null
  return jobs.length > 1 ? `${base} (+${jobs.length - 1})` : base
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function Login({ onOk }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [host, setHostDraft] = useState(getHost())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setHost(host)
      const data = await login(username.trim(), password)
      setToken(data.token)
      onOk(data.username || username)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>WA Relay Admin</h1>
        <p className="muted">Inbox · extracted jobs · folders</p>
        <label>
          API host
          <input
            value={host}
            onChange={(e) => setHostDraft(e.target.value)}
            placeholder="(empty = same origin)"
            autoComplete="url"
          />
        </label>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function MessageRow({ msg, onPatch }) {
  const [open, setOpen] = useState(false)
  const jobsLine = formatJobs(msg.jobs)
  const unread = !msg.readAt

  return (
    <article className={`msg ${unread ? 'unread' : ''}`}>
      <button type="button" className="msg-main" onClick={() => setOpen((v) => !v)}>
        <div className="msg-top">
          <strong>
            {msg.senderName || msg.senderPhone || 'Unknown'}
            {msg.isGroup && msg.groupName ? ` · ${msg.groupName}` : ''}
          </strong>
          <span className="chip">{(msg.folder || 'others').toUpperCase()}</span>
          <span className="muted small">{formatTime(msg.createdAt || msg.timestamp)}</span>
        </div>
        {jobsLine ? <div className="jobs">{jobsLine}</div> : null}
        <div className={`preview ${open ? 'full' : ''}`}>{msg.text}</div>
        <div className="meta muted small">
          parse: {msg.parseStatus || '—'}
          {msg.parseSource ? ` · ${msg.parseSource}` : ''}
          {msg.starred ? ' · ★' : ''}
          {msg.done ? ' · done' : ''}
        </div>
      </button>
      {open ? (
        <div className="msg-actions">
          <button type="button" onClick={() => onPatch(msg, { starred: !msg.starred })}>
            {msg.starred ? 'Unstar' : 'Star'}
          </button>
          <button type="button" onClick={() => onPatch(msg, { done: !msg.done })}>
            {msg.done ? 'Undone' : 'Done'}
          </button>
          <button
            type="button"
            onClick={() => onPatch(msg, { read: unread })}
          >
            {unread ? 'Mark read' : 'Mark unread'}
          </button>
          {msg.waLink ? (
            <a href={msg.waLink} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function Inbox({ username, onLogout }) {
  const [folder, setFolder] = useState('all')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [messages, setMessages] = useState([])
  const [counts, setCounts] = useState({})
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)

  const query = useMemo(() => {
    const base = { folder: folder === 'all' ? undefined : folder, q: search || undefined, limit: 40 }
    if (filter === 'unread') base.unread = true
    if (filter === 'starred') base.starred = true
    if (filter === 'done') base.done = true
    return base
  }, [folder, filter, search])

  const load = useCallback(
    async (cursor) => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchMessages({ ...query, before: cursor || undefined })
        setMessages((prev) => (cursor ? [...prev, ...data.messages] : data.messages))
        setNextCursor(data.nextCursor)
        const c = await fetchUnreadByFolder().catch(() => null)
        if (c?.counts) setCounts(c.counts)
        const h = await fetchHealth().catch(() => null)
        if (h) setHealth(h)
      } catch (err) {
        if (err.code === 401) {
          setToken('')
          onLogout()
          return
        }
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [query, onLogout],
  )

  useEffect(() => {
    load(null)
  }, [load])

  useEffect(() => {
    const token = getToken()
    if (!token) return undefined
    const host = getHost() || undefined
    const sock = io(host || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    sock.on('message:matched', (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id || m.messageId === msg.messageId)) return prev
        if (folder !== 'all' && (msg.folder || 'others') !== folder) return prev
        return [msg, ...prev]
      })
    })
    return () => sock.disconnect()
  }, [folder])

  async function onPatch(msg, patch) {
    try {
      const body = { ...patch }
      if ('read' in body) {
        body.read = body.read
      }
      const data = await patchMessage(msg.id, body)
      const updated = data.message || data
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...updated } : m)))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin">
      <header className="top">
        <div>
          <h1>WA Relay</h1>
          <p className="muted">
            {username}
            {health?.whatsapp
              ? ` · WA ${health.whatsapp.status}${health.whatsapp.connected ? '' : ' (offline)'}`
              : ''}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div className="folders">
        {FOLDERS.map((f) => (
          <button
            key={f}
            type="button"
            className={folder === f ? 'active' : ''}
            onClick={() => setFolder(f)}
          >
            {f.toUpperCase()}
            {f !== 'all' && counts[f] ? ` (${counts[f]})` : ''}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q.trim())
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search text, from, to…"
          />
          <button type="submit">Search</button>
        </form>
        <button type="button" className="ghost" onClick={() => load(null)} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <div className="error banner">{error}</div> : null}

      <div className="list">
        {messages.map((msg) => (
          <MessageRow key={msg.id || msg.messageId} msg={msg} onPatch={onPatch} />
        ))}
        {!loading && !messages.length ? <p className="muted empty">No messages</p> : null}
      </div>

      {nextCursor ? (
        <button type="button" className="more" onClick={() => load(nextCursor)} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? 'user' : ''))

  if (!user) {
    return <Login onOk={setUser} />
  }

  return (
    <Inbox
      username={user}
      onLogout={() => {
        setToken('')
        setUser('')
      }}
    />
  )
}
